"""Logging de execuções de ETL na tabela `ingest_runs`.

Cada job cria uma linha ao iniciar e atualiza ao terminar (sucesso ou erro).
Isso alimenta o widget "Última atualização" na home.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy import text

from etl.config import settings
from etl.db import session_scope

logger = structlog.get_logger(__name__)


@contextmanager
def record_run(source: str, job: str) -> Iterator[dict[str, Any]]:
    """Context manager que grava início e fim de uma execução.

    Yielda um dict com uma chave "stats" que o job pode preencher.
    Em caso de dry-run ou falta de banco, apenas loga sem persistir.

    Uso:
        with record_run("camara", "deputados") as run:
            # ... faz o trabalho ...
            run["stats"]["processed"] = 513
    """
    started_at = datetime.now(UTC)
    run_id = uuid.uuid4()
    state: dict[str, Any] = {"stats": {}, "run_id": run_id, "started_at": started_at}

    log = logger.bind(source=source, job=job, run_id=str(run_id))

    if settings.etl_dry_run:
        log.info("etl_run_started", mode="dry-run")
        try:
            yield state
            log.info("etl_run_finished", mode="dry-run", stats=state["stats"])
        except Exception as e:
            log.error("etl_run_failed", mode="dry-run", error=str(e))
            raise
        return

    # Modo real: grava no banco.
    try:
        with session_scope() as session:
            session.execute(
                text(
                    """
                    INSERT INTO ingest_runs (id, source, job, started_at, status)
                    VALUES (:id, :source, :job, :started_at, 'running')
                    """
                ),
                {
                    "id": str(run_id),
                    "source": source,
                    "job": job,
                    "started_at": started_at,
                },
            )
    except Exception as e:
        # Se não deu pra registrar (DB fora, tabela não existe), continua
        # a execução mas sem persistência de run.
        log.warning("ingest_run_start_failed", error=str(e))
        yield state
        return

    log.info("etl_run_started")
    try:
        yield state
    except Exception as e:
        _finalize_run(run_id, "failed", state["stats"], error=str(e))
        log.error("etl_run_failed", error=str(e), stats=state["stats"])
        raise
    else:
        _finalize_run(run_id, "success", state["stats"])
        log.info("etl_run_finished", stats=state["stats"])


def _finalize_run(
    run_id: uuid.UUID,
    status: str,
    stats: dict[str, Any],
    error: str | None = None,
) -> None:
    import json

    try:
        with session_scope() as session:
            session.execute(
                text(
                    """
                    UPDATE ingest_runs
                       SET finished_at = :finished_at,
                           status      = :status,
                           stats       = CAST(:stats AS JSONB),
                           error       = :error
                     WHERE id = :id
                    """
                ),
                {
                    "id": str(run_id),
                    "finished_at": datetime.now(UTC),
                    "status": status,
                    "stats": json.dumps(stats, default=str),
                    "error": error,
                },
            )
    except Exception as e:
        logger.warning("ingest_run_finalize_failed", error=str(e), run_id=str(run_id))
