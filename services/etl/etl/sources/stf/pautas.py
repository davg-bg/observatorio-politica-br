"""Job: ingere pautas do STF (sessões presenciais do plenário e turmas).

Para cada dia útil nas próximas N semanas (default: 6), bate no
`calendario-service.asp` do portal do STF, mapeia colegiados → sessões →
processos e persiste.

Idempotente: upsert por `source_id` (sessão) e por `(sessao_id, source_id)`
(processo).

Importante: scraping leve + rate limit baixo pra ser respeitoso com o portal.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any

import structlog
from sqlalchemy import text

from etl.config import settings
from etl.db import session_scope
from etl.ingest_runs import record_run

from .client import StfClient
from .models import CalendarioSessao, IncidenteSTF, SessaoSTF, flag_sn

logger = structlog.get_logger(__name__)

# Quantos dias olhar à frente (6 semanas = ~30 dias úteis, cobre o calendário STF)
DIAS_AHEAD_DEFAULT = 42


async def run() -> None:
    """Entry point: percorre dias à frente e ingere o que achar."""
    with record_run("stf", "pautas") as run_state:
        async with StfClient() as client:
            await _process(client, run_state["stats"])


async def _process(client: StfClient, stats: dict) -> None:
    stats.setdefault("dias_consultados", 0)
    stats.setdefault("dias_com_sessao", 0)
    stats.setdefault("sessoes_upsert", 0)
    stats.setdefault("processos_upsert", 0)
    stats.setdefault("errors", 0)

    hoje = date.today()
    limit = settings.etl_limit or DIAS_AHEAD_DEFAULT

    for dias in range(limit):
        d = hoje + timedelta(days=dias)
        # Pula fim de semana — STF só pauta de 2a a 6a
        if d.weekday() >= 5:
            continue

        data_str = d.strftime("%d/%m/%Y")
        stats["dias_consultados"] += 1
        try:
            calendario = await client.get_calendario_presencial(data_str)
        except Exception as e:
            logger.warning("stf_calendario_falhou", data=data_str, error=str(e))
            stats["errors"] += 1
            continue

        if not calendario.colegiados:
            continue
        stats["dias_com_sessao"] += 1

        _persist_calendario(calendario, stats)

    logger.info("stf_pautas_concluido", **stats)


def _persist_calendario(calendario: CalendarioSessao, stats: dict) -> None:
    """Grava o calendário de um dia (todos os colegiados e sessões)."""
    with session_scope() as session:
        for colegiado in calendario.colegiados:
            for sessao in colegiado.sessoes:
                sessao_id = _upsert_sessao(session, colegiado.codigo, colegiado.descricao, sessao)
                if sessao_id is None:
                    continue
                stats["sessoes_upsert"] += 1

                for incidente in sessao.incidentes:
                    _upsert_processo(session, sessao_id, incidente)
                    stats["processos_upsert"] += 1


def _upsert_sessao(
    session: Any,
    colegiado_codigo: str,
    colegiado_descricao: str,
    sessao: SessaoSTF,
) -> str | None:
    """Upsert em stf_sessoes. Retorna o ID da sessão (string UUID) ou None se falhou."""
    data_inicio = sessao.data_inicio
    if data_inicio is None:
        logger.warning(
            "stf_sessao_sem_data_valida", source_id=sessao.id, raw=sessao.data_inicio_str
        )
        return None

    # Garante timezone pra TIMESTAMPTZ — STF opera em America/Sao_Paulo (UTC-3)
    # Mas como o Postgres TIMESTAMPTZ guarda em UTC, convertemos aqui.
    # UTC-3 → somar 3h pra obter UTC. Simplificação sem DST (STF Brasília não tem).
    data_inicio_utc = data_inicio.replace(tzinfo=UTC) + timedelta(hours=3)

    result = session.execute(
        text(
            """
            INSERT INTO stf_sessoes (
                source_id, colegiado_codigo, colegiado_descricao,
                data_inicio, tipo, numero, ano, observacao
            ) VALUES (
                :source_id, :codigo, :descricao,
                :data_inicio, :tipo, :numero, :ano, :obs
            )
            ON CONFLICT (source_id) DO UPDATE SET
                colegiado_codigo    = EXCLUDED.colegiado_codigo,
                colegiado_descricao = EXCLUDED.colegiado_descricao,
                data_inicio         = EXCLUDED.data_inicio,
                tipo                = EXCLUDED.tipo,
                numero              = COALESCE(EXCLUDED.numero, stf_sessoes.numero),
                ano                 = COALESCE(EXCLUDED.ano, stf_sessoes.ano),
                observacao          = EXCLUDED.observacao
            RETURNING id
            """
        ),
        {
            "source_id": sessao.id,
            "codigo": colegiado_codigo,
            "descricao": colegiado_descricao,
            "data_inicio": data_inicio_utc,
            "tipo": sessao.tipo,
            "numero": sessao.numero_int,
            "ano": sessao.ano_int,
            "obs": sessao.observacao,
        },
    )
    row = result.fetchone()
    return str(row[0]) if row else None


def _upsert_processo(session: Any, sessao_id: str, incidente: IncidenteSTF) -> None:
    """Upsert em stf_pauta_processos."""
    session.execute(
        text(
            """
            INSERT INTO stf_pauta_processos (
                sessao_id, source_id, classe, numero, relator, ministro_vista,
                destaque, materia_relevante, repercussao_geral, assuncao_competencia,
                situacao_processo_sessao, resumo_tema
            ) VALUES (
                :sessao_id, :source_id, :classe, :numero, :relator, :ministro_vista,
                :destaque, :relevante, :rg, :ac,
                :situacao, :resumo
            )
            ON CONFLICT (sessao_id, source_id) DO UPDATE SET
                classe                   = EXCLUDED.classe,
                numero                   = EXCLUDED.numero,
                relator                  = COALESCE(EXCLUDED.relator, stf_pauta_processos.relator),
                ministro_vista           = EXCLUDED.ministro_vista,
                destaque                 = EXCLUDED.destaque,
                materia_relevante        = EXCLUDED.materia_relevante,
                repercussao_geral        = EXCLUDED.repercussao_geral,
                assuncao_competencia     = EXCLUDED.assuncao_competencia,
                situacao_processo_sessao = EXCLUDED.situacao_processo_sessao,
                resumo_tema              = COALESCE(EXCLUDED.resumo_tema, stf_pauta_processos.resumo_tema)
            """
        ),
        {
            "sessao_id": sessao_id,
            "source_id": incidente.id_informacao_pauta_processo,
            "classe": incidente.classe,
            "numero": incidente.numero,
            "relator": incidente.relator,
            "ministro_vista": incidente.ministro_vista,
            "destaque": incidente.destaque,
            "relevante": flag_sn(incidente.materia_relevante),
            "rg": flag_sn(incidente.repercussao_geral),
            "ac": flag_sn(incidente.assuncao_competencia),
            "situacao": incidente.situacao_processo_sessao,
            "resumo": incidente.resumo_tema,
        },
    )


# Também útil pra o widget da home se precisar
def _parse_pt_date(s: str) -> date | None:
    try:
        return datetime.strptime(s, "%d/%m/%Y").date()
    except (ValueError, TypeError):
        return None
