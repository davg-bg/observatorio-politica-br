"""Job: ingere votações nominais da Câmara (últimos N dias).

Para cada votação do intervalo:
    1. Shell da proposição afetada (quando houver).
    2. Upsert da votação com contagens agregadas.
    3. Upsert de cada voto individual.
    4. Upsert de orientações partidárias dos líderes.

Idempotente: rodando múltiplas vezes gera o mesmo estado final.
Operação típica: backfill de 90 dias na primeira execução, depois incremental
diário de ~2-7 dias.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

import structlog

from etl.config import settings
from etl.db import session_scope
from etl.ingest_runs import record_run
from etl.sinks.parlamentares import upsert_partido
from etl.sinks.votacoes import (
    resolve_parlamentar_id,
    upsert_orientacao,
    upsert_proposicao_shell,
    upsert_votacao,
    upsert_voto,
)

from .client import CamaraClient
from .votacoes_models import (
    OrientacaoCamara,
    VotacaoResumo,
    VotoCamara,
    extract_source_id_from_uri,
    normalize_tipo_voto,
)

logger = structlog.get_logger(__name__)

# Backfill padrão: 90 dias. Pode ser sobrescrito via env/CLI.
DEFAULT_BACKFILL_DAYS = 90


async def run(days: int | None = None) -> None:
    """Entry point. Puxa votações dos últimos `days` dias (padrão 90)."""
    days = days or DEFAULT_BACKFILL_DAYS
    hoje = date.today()
    inicio = hoje - timedelta(days=days)

    async with CamaraClient() as client:
        with record_run("camara", "votacoes") as run_state:
            await _process_range(
                client,
                run_state["stats"],
                data_inicio=inicio.isoformat(),
                data_fim=hoje.isoformat(),
            )


async def _process_range(
    client: CamaraClient,
    stats: dict,
    *,
    data_inicio: str,
    data_fim: str,
) -> None:
    stats.setdefault("votacoes_processadas", 0)
    stats.setdefault("votos_inseridos", 0)
    stats.setdefault("orientacoes_inseridas", 0)
    stats.setdefault("errors", 0)
    stats.setdefault("votos_sem_parlamentar", 0)

    limit = settings.etl_limit
    count = 0

    async for resumo in client.list_votacoes(data_inicio=data_inicio, data_fim=data_fim):
        if limit is not None and count >= limit:
            break
        count += 1

        try:
            votos = await client.get_votos(resumo.id)
        except Exception as e:
            logger.warning("get_votos_failed", votacao_id=resumo.id, error=str(e))
            stats["errors"] += 1
            votos = []

        try:
            orientacoes = await client.get_orientacoes(resumo.id)
        except Exception as e:
            logger.warning("get_orientacoes_failed", votacao_id=resumo.id, error=str(e))
            orientacoes = []

        try:
            with session_scope() as session:
                _persist_votacao(session, resumo, votos, orientacoes, stats)
            stats["votacoes_processadas"] += 1
        except Exception as e:
            logger.exception("persist_votacao_failed", votacao_id=resumo.id, error=str(e))
            stats["errors"] += 1


def _persist_votacao(
    session,
    resumo: VotacaoResumo,
    votos: list[VotoCamara],
    orientacoes: list[OrientacaoCamara],
    stats: dict,
) -> None:
    """Grava uma votação + seus votos/orientações. Dentro de uma transação."""

    # 1. Shell da proposição, quando aplicável
    proposicao_id: str | None = None
    if resumo.proposicao_objeto:
        prop = resumo.proposicao_objeto
        prop_source_id = str(prop.get("id") or "")
        if prop_source_id:
            proposicao_id = upsert_proposicao_shell(
                session,
                casa="camara",
                source_id=prop_source_id,
                sigla_tipo=str(prop.get("siglaTipo") or "?"),
                numero=int(prop.get("numero") or 0),
                ano=int(prop.get("ano") or 0),
                ementa=str(prop.get("ementa") or resumo.descricao),
                uri=prop.get("uri"),
                data_apresentacao=_parse_date(prop.get("dataApresentacao")),
            )
    elif resumo.uri_proposicao_objeto:
        prop_source_id = extract_source_id_from_uri(resumo.uri_proposicao_objeto)
        if prop_source_id:
            proposicao_id = upsert_proposicao_shell(
                session,
                casa="camara",
                source_id=prop_source_id,
                sigla_tipo="?",
                numero=0,
                ano=0,
                ementa=resumo.descricao[:500],
                uri=resumo.uri_proposicao_objeto,
            )

    # 2. Contagens agregadas (derivadas dos votos individuais, mais confiáveis)
    counts = _count_votos(votos)

    # 3. Upsert da votação
    aprovacao: bool | None = None
    if resumo.aprovacao is not None:
        aprovacao = bool(resumo.aprovacao)

    votacao_id = upsert_votacao(
        session,
        casa="camara",
        source_id=resumo.id,
        data_hora_registro=resumo.data_hora_registro,
        descricao=resumo.descricao,
        aprovacao=aprovacao,
        sigla_orgao=resumo.sigla_orgao,
        proposicao_id=proposicao_id,
        votos_sim=counts["Sim"],
        votos_nao=counts["Não"],
        votos_abstencao=counts["Abstenção"],
        votos_outros=counts["Outros"],
        uri_evento=resumo.uri_evento,
        uri=resumo.uri,
    )

    # 4. Votos individuais
    for voto in votos:
        parlamentar_id = resolve_parlamentar_id(
            session, casa="camara", source_id=str(voto.deputado.id)
        )
        if parlamentar_id is None:
            stats["votos_sem_parlamentar"] += 1
            continue

        partido_id_na_epoca = upsert_partido(session, voto.deputado.sigla_partido)

        upsert_voto(
            session,
            votacao_id=votacao_id,
            parlamentar_id=parlamentar_id,
            tipo_voto=normalize_tipo_voto(voto.tipo_voto),
            partido_id_na_epoca=partido_id_na_epoca,
            data_registro=voto.data_registro,
        )
        stats["votos_inseridos"] += 1

    # 5. Orientações — só as realmente partidárias (codTipoLideranca='P' + codPartidoBloco)
    for orient in orientacoes:
        if orient.cod_tipo_lideranca != "P":
            continue
        if not orient.orientacao_voto:
            continue
        # Só processamos quando a sigla do bloco é um partido registrado.
        partido_id = upsert_partido(session, orient.sigla_partido_bloco)
        if partido_id is None:
            continue

        upsert_orientacao(
            session,
            votacao_id=votacao_id,
            partido_id=partido_id,
            orientacao=orient.orientacao_voto,
        )
        stats["orientacoes_inseridas"] += 1


def _count_votos(votos: list[VotoCamara]) -> dict[str, int]:
    counts = {"Sim": 0, "Não": 0, "Abstenção": 0, "Outros": 0}
    for v in votos:
        tipo = normalize_tipo_voto(v.tipo_voto)
        if tipo in counts:
            counts[tipo] += 1
        else:
            counts["Outros"] += 1
    return counts


def _parse_date(raw: Any) -> date | None:
    """A Câmara às vezes manda '2026-10-14T20:25' em vez de ISO date puro."""
    if not raw:
        return None
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw
    s = str(raw)
    # Remove horário se vier junto
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None
