"""Job: ingere emendas parlamentares do Portal da Transparência.

Para cada ano em `anos_configurados` (default: ano atual + anterior),
busca todas as emendas e faz upsert por codigo_emenda. Tenta resolver
`parlamentar_id` fazendo match de nome.

Idempotente: valores sobrescritos a cada run (fica com o último estado
de execução da emenda).
"""

from __future__ import annotations

from datetime import date

import structlog

from etl.config import settings
from etl.db import session_scope
from etl.ingest_runs import record_run
from etl.sinks.emendas import (
    normalize_nome,
    resolve_parlamentar_por_nome,
    upsert_emenda,
)

from .client import TransparenciaClient

logger = structlog.get_logger(__name__)


async def run() -> None:
    """Entry point: ingere emendas do ano corrente + anterior."""
    hoje = date.today()
    anos = [hoje.year, hoje.year - 1]

    if not settings.transparencia_api_token:
        logger.warning("transparencia_token_missing_skipping")
        return

    async with TransparenciaClient() as client:
        with record_run("transparencia", "emendas") as run_state:
            await _process_anos(client, run_state["stats"], anos=anos)


async def _process_anos(
    client: TransparenciaClient,
    stats: dict,
    *,
    anos: list[int],
) -> None:
    stats.setdefault("emendas_processadas", 0)
    stats.setdefault("emendas_com_parlamentar", 0)
    stats.setdefault("emendas_sem_match", 0)
    stats.setdefault("errors", 0)

    limit = settings.etl_limit
    count = 0

    # Cache de resolução de parlamentar por autor (evita queries repetidas)
    resolucao_cache: dict[str, str | None] = {}

    for ano in anos:
        logger.info("processing_year", ano=ano)
        try:
            async for emenda in client.list_emendas(ano=ano):
                if limit is not None and count >= limit:
                    return
                count += 1

                autor_livre = emenda.autor_normalizado
                autor_key = normalize_nome(autor_livre)

                parlamentar_id: str | None = None
                if autor_key:
                    if autor_key in resolucao_cache:
                        parlamentar_id = resolucao_cache[autor_key]
                    else:
                        try:
                            with session_scope() as session:
                                parlamentar_id = resolve_parlamentar_por_nome(session, autor_livre)
                        except Exception as e:
                            logger.warning("resolve_failed", autor=autor_livre, error=str(e))
                            parlamentar_id = None
                        resolucao_cache[autor_key] = parlamentar_id

                if parlamentar_id:
                    stats["emendas_com_parlamentar"] += 1
                else:
                    stats["emendas_sem_match"] += 1

                try:
                    with session_scope() as session:
                        upsert_emenda(
                            session,
                            codigo_emenda=emenda.codigo_emenda,
                            ano=emenda.ano,
                            tipo_emenda=emenda.tipo_emenda,
                            autor_livre=autor_livre,
                            parlamentar_id=parlamentar_id,
                            numero_emenda=emenda.numero_emenda,
                            localidade_do_gasto=emenda.localidade_do_gasto,
                            funcao=emenda.funcao,
                            subfuncao=emenda.subfuncao,
                            valor_empenhado=emenda.valor_empenhado,
                            valor_liquidado=emenda.valor_liquidado,
                            valor_pago=emenda.valor_pago,
                            valor_resto_inscrito=emenda.valor_resto_inscrito,
                            valor_resto_cancelado=emenda.valor_resto_cancelado,
                            valor_resto_pago=emenda.valor_resto_pago,
                        )
                    stats["emendas_processadas"] += 1
                except Exception as e:
                    logger.exception(
                        "upsert_emenda_failed",
                        codigo=emenda.codigo_emenda,
                        error=str(e),
                    )
                    stats["errors"] += 1
        except Exception as e:
            logger.exception("list_emendas_failed", ano=ano, error=str(e))
            stats["errors"] += 1
