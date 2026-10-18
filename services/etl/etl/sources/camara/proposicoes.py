"""Job: enriquece proposições já referenciadas em votações com detalhes e tramitação.

Fluxo:
    1. Lê os shells de `proposicoes` que ainda têm dados mínimos.
    2. Para cada uma, busca GET /proposicoes/{id} + tramitacoes + temas.
    3. Atualiza o registro com ementa completa, situação, data da última
       tramitação, e marca `arquivada` conforme a descrição da situação.
    4. Insere tramitações e temas (idempotentes).

Idempotente: pode rodar várias vezes seguidas.
"""

from __future__ import annotations

from datetime import datetime

import structlog

from etl.config import settings
from etl.db import session_scope
from etl.ingest_runs import record_run
from etl.sinks.proposicoes import (
    associate_tema,
    list_proposicao_shells,
    upsert_proposicao_enriquecida,
    upsert_tema,
    upsert_tramitacao,
)

from .client import CamaraClient

logger = structlog.get_logger(__name__)


async def run() -> None:
    """Entry point. Enriquece shells pendentes (limite configurável)."""
    async with CamaraClient() as client:
        with record_run("camara", "proposicoes") as run_state:
            await _process_shells(client, run_state["stats"])


async def _process_shells(client: CamaraClient, stats: dict) -> None:
    stats.setdefault("proposicoes_enriquecidas", 0)
    stats.setdefault("tramitacoes_inseridas", 0)
    stats.setdefault("temas_associados", 0)
    stats.setdefault("errors", 0)

    with session_scope() as session:
        shells = list_proposicao_shells(session, limit=settings.etl_limit)

    logger.info("found_shells", total=len(shells))

    for prop_uuid, casa, source_id in shells:
        if casa != "camara":
            # ETL de proposições do Senado é outro job (fica no roadmap)
            continue
        try:
            await _enrich_proposicao(client, prop_uuid, source_id, stats)
            stats["proposicoes_enriquecidas"] += 1
        except Exception as e:
            logger.warning(
                "enrich_failed",
                source_id=source_id,
                error=str(e),
            )
            stats["errors"] += 1


async def _enrich_proposicao(
    client: CamaraClient,
    prop_uuid: str,
    source_id: str,
    stats: dict,
) -> None:
    """Busca e persiste detalhes + tramitação + temas de uma proposição."""
    detalhe = await client.get_proposicao(source_id)

    # Busca tramitações pra calcular data_ultima_tramitacao
    tramitacoes_raw: list[dict] = []
    try:
        tramitacoes_raw = await client.get_tramitacoes(source_id)
    except Exception as e:
        logger.warning("get_tramitacoes_failed", source_id=source_id, error=str(e))

    ultima_tramitacao: datetime | None = None
    if tramitacoes_raw:
        datas = [_parse_dh(t.get("dataHora")) for t in tramitacoes_raw]
        datas_validas = [d for d in datas if d is not None]
        if datas_validas:
            ultima_tramitacao = max(datas_validas)

    # Upsert com dados enriquecidos
    with session_scope() as session:
        upsert_proposicao_enriquecida(
            session,
            casa="camara",
            source_id=source_id,
            detalhe=detalhe,
            ultima_tramitacao=ultima_tramitacao,
        )

        # Insere tramitações (upsert por sequencia)
        for t in tramitacoes_raw:
            seq = t.get("sequencia")
            dh = _parse_dh(t.get("dataHora"))
            if seq is None or dh is None:
                continue
            upsert_tramitacao(
                session,
                proposicao_id=prop_uuid,
                sequencia=int(seq),
                data=dh,
                sigla_orgao=t.get("siglaOrgao"),
                descricao_tramitacao=t.get("descricaoTramitacao"),
                descricao_situacao=t.get("descricaoSituacao"),
                despacho=t.get("despacho"),
                url=t.get("url"),
            )
            stats["tramitacoes_inseridas"] += 1

    # Temas: endpoint separado
    try:
        temas_raw = await client.get_temas_proposicao(source_id)
    except Exception as e:
        logger.warning("get_temas_failed", source_id=source_id, error=str(e))
        temas_raw = []

    if temas_raw:
        with session_scope() as session:
            for t in temas_raw:
                tema_id = t.get("codTema")
                nome = t.get("tema")
                if tema_id is None or not nome:
                    continue
                upsert_tema(session, int(tema_id), str(nome))
                associate_tema(session, prop_uuid, int(tema_id))
                stats["temas_associados"] += 1


def _parse_dh(raw) -> datetime | None:
    if not raw:
        return None
    try:
        s = str(raw)
        if len(s) == 16:  # "2024-05-15T10:30"
            s = s + ":00"
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
