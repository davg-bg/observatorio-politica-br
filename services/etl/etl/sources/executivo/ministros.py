"""Job: ingere composição ministerial a partir da lista curada.

Fluxo:
    1. Marca todos os ministros atuais como `em_exercicio = FALSE`.
    2. Upsert dos entries de `MINISTROS_ATUAIS`, marcando `em_exercicio = TRUE`.
    3. Órgãos que não aparecem na lista nova ficam marcados como "fora".

Essa estratégia garante que a UI mostra sempre o gabinete atual conforme
a curadoria do código, sem depender de scraping.
"""

from __future__ import annotations

import structlog
from sqlalchemy import text

from etl.db import session_scope
from etl.ingest_runs import record_run

from .ministros_data import MINISTROS_ATUAIS

logger = structlog.get_logger(__name__)


async def run() -> None:
    """Entry point: ingere a lista curada de ministros."""
    with record_run("executivo", "ministros") as run_state:
        _process(run_state["stats"])


def _process(stats: dict) -> None:
    stats.setdefault("ministros_upsert", 0)
    stats.setdefault("ministros_desligados", 0)

    with session_scope() as session:
        # Primeiro: marca todos como fora de exercício
        result = session.execute(
            text(
                """
                UPDATE ministros
                   SET em_exercicio = FALSE,
                       data_fim_gestao = COALESCE(data_fim_gestao, CURRENT_DATE)
                 WHERE em_exercicio = TRUE
                """
            )
        )
        stats["ministros_desligados"] = result.rowcount or 0

        for entry in MINISTROS_ATUAIS:
            session.execute(
                text(
                    """
                    INSERT INTO ministros (
                        orgao_sigla, orgao_nome, nome, partido_sigla, site_oficial,
                        em_exercicio, data_inicio_gestao, data_fim_gestao
                    ) VALUES (
                        :orgao_sigla, :orgao_nome, :nome, :partido, :site,
                        TRUE, CURRENT_DATE, NULL
                    )
                    ON CONFLICT (orgao_sigla, nome, data_inicio_gestao) DO UPDATE SET
                        orgao_nome        = EXCLUDED.orgao_nome,
                        partido_sigla     = COALESCE(EXCLUDED.partido_sigla, ministros.partido_sigla),
                        site_oficial      = COALESCE(EXCLUDED.site_oficial, ministros.site_oficial),
                        em_exercicio      = TRUE,
                        data_fim_gestao   = NULL
                    """
                ),
                {
                    "orgao_sigla": entry.orgao_sigla,
                    "orgao_nome": entry.orgao_nome,
                    "nome": entry.nome,
                    "partido": entry.partido_sigla,
                    "site": entry.site_oficial,
                },
            )
            stats["ministros_upsert"] += 1

    logger.info(
        "ministros_processados",
        total=len(MINISTROS_ATUAIS),
        desligados=stats["ministros_desligados"],
    )
