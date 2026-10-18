"""Job: sincroniza a composição do STF a partir da lista curada.

Fluxo:
    1. Marca todos os ministros atualmente em exercício como `em_exercicio = FALSE`.
    2. Upsert dos entries de `MINISTROS_STF`, marcando `em_exercicio = TRUE` e
       computando `ordem_antiguidade` com base em `data_posse` ascendente.
    3. A `data_aposentadoria_compulsoria` é calculada (nascimento + 75 anos).

Como só mantemos a lista de ministros em exercício na curadoria, qualquer
ministro no banco cuja posse não bate com a lista fica marcado como fora.
"""

from __future__ import annotations

import structlog
from sqlalchemy import text

from etl.db import session_scope
from etl.ingest_runs import record_run

from .ministros_data import MINISTROS_STF, aposentadoria_compulsoria

logger = structlog.get_logger(__name__)


async def run() -> None:
    """Entry point: ingere a composição curada do STF."""
    with record_run("stf", "composicao") as run_state:
        _process(run_state["stats"])


def _process(stats: dict) -> None:
    stats.setdefault("ministros_upsert", 0)
    stats.setdefault("ministros_desligados", 0)

    # Ordena por data_posse ascendente -> ordem_antiguidade 1..N
    ordenados = sorted(MINISTROS_STF, key=lambda m: m.data_posse)

    with session_scope() as session:
        # 1) Marca todos como fora de exercício (não zeramos antiguidade pra
        #    manter o histórico; o ETL repopula abaixo quem está dentro).
        result = session.execute(
            text(
                """
                UPDATE stf_ministros
                   SET em_exercicio = FALSE,
                       data_aposentadoria = COALESCE(data_aposentadoria, CURRENT_DATE),
                       ordem_antiguidade = NULL
                 WHERE em_exercicio = TRUE
                """
            )
        )
        stats["ministros_desligados"] = result.rowcount or 0

        # 2) Upsert com antiguidade recomputada
        for idx, m in enumerate(ordenados, start=1):
            aposent_compulsoria = aposentadoria_compulsoria(m.data_nascimento)
            session.execute(
                text(
                    """
                    INSERT INTO stf_ministros (
                        nome, nome_completo, data_nascimento, local_nascimento,
                        presidente_indicou, partido_indicacao, data_posse,
                        data_aposentadoria, data_aposentadoria_compulsoria,
                        cargo_atual, formacao_academica, em_exercicio,
                        ordem_antiguidade
                    ) VALUES (
                        :nome, :nome_completo, :nasc, :local,
                        :pres, :partido, :posse,
                        NULL, :compulsoria,
                        :cargo, :formacao, TRUE,
                        :ordem
                    )
                    ON CONFLICT (nome, data_posse) DO UPDATE SET
                        nome_completo                    = EXCLUDED.nome_completo,
                        data_nascimento                  = EXCLUDED.data_nascimento,
                        local_nascimento                 = COALESCE(EXCLUDED.local_nascimento, stf_ministros.local_nascimento),
                        presidente_indicou               = EXCLUDED.presidente_indicou,
                        partido_indicacao                = COALESCE(EXCLUDED.partido_indicacao, stf_ministros.partido_indicacao),
                        data_aposentadoria               = NULL,
                        data_aposentadoria_compulsoria   = EXCLUDED.data_aposentadoria_compulsoria,
                        cargo_atual                      = EXCLUDED.cargo_atual,
                        formacao_academica               = COALESCE(EXCLUDED.formacao_academica, stf_ministros.formacao_academica),
                        em_exercicio                     = TRUE,
                        ordem_antiguidade                = EXCLUDED.ordem_antiguidade
                    """
                ),
                {
                    "nome": m.nome,
                    "nome_completo": m.nome_completo,
                    "nasc": m.data_nascimento,
                    "local": m.local_nascimento,
                    "pres": m.presidente_indicou,
                    "partido": m.partido_indicacao,
                    "posse": m.data_posse,
                    "compulsoria": aposent_compulsoria,
                    "cargo": m.cargo_atual,
                    "formacao": m.formacao_academica,
                    "ordem": idx,
                },
            )
            stats["ministros_upsert"] += 1

    logger.info(
        "stf_composicao_sync",
        em_exercicio=len(ordenados),
        desligados=stats["ministros_desligados"],
    )
