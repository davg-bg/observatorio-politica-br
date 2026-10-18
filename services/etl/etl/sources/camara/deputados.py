"""Job: ingere deputados em exercício da Câmara dos Deputados.

Fluxo:
    1. Lista todos os deputados em exercício (paginado).
    2. Para cada um, busca o detalhe completo.
    3. Resolve referências (UF, partido, legislatura).
    4. Upsert em `parlamentares` e `mandatos`.
    5. Marca em_exercicio=false para quem saiu desde a última execução.

Idempotente: rodar várias vezes no mesmo dia produz o mesmo estado final.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import structlog

from etl.config import settings
from etl.db import session_scope
from etl.ingest_runs import record_run
from etl.sinks.parlamentares import (
    ensure_legislatura,
    mark_not_in_exercise,
    resolve_uf_id,
    upsert_mandato,
    upsert_parlamentar,
    upsert_partido,
)
from etl.sinks.redes_sociais import parse_redes

from .client import CamaraClient
from .models import DeputadoDetalhe, DeputadoResumo

logger = structlog.get_logger(__name__)


async def run() -> None:
    """Entry point do job (invocado via CLI)."""
    async with CamaraClient() as client:
        with record_run("camara", "deputados") as run_state:
            await _process_all(client, run_state["stats"])


async def _process_all(
    client: CamaraClient,
    stats: dict,
    *,
    detalhes_iter: AsyncIterator[DeputadoDetalhe] | None = None,
) -> None:
    """Processa todos os deputados.

    `detalhes_iter` é um hook pra testes substituírem o fluxo HTTP real.
    """
    stats.setdefault("processed", 0)
    stats.setdefault("inserted_or_updated", 0)
    stats.setdefault("marked_inactive", 0)
    stats.setdefault("errors", 0)

    source_ids_vistos: set[str] = set()

    limit = settings.etl_limit

    async def _detalhes_from_api() -> AsyncIterator[DeputadoDetalhe]:
        count = 0
        async for resumo in client.list_deputados():
            if limit is not None and count >= limit:
                return
            try:
                yield await client.get_deputado(resumo.id)
                count += 1
            except Exception as e:
                logger.exception("get_deputado_failed", id=resumo.id, error=str(e))
                stats["errors"] += 1

    iterator = detalhes_iter if detalhes_iter is not None else _detalhes_from_api()

    async for detalhe in iterator:
        stats["processed"] += 1
        try:
            with session_scope() as session:
                _persist_deputado(session, detalhe)
            source_ids_vistos.add(str(detalhe.id))
            stats["inserted_or_updated"] += 1
        except Exception as e:
            logger.exception("persist_failed", id=detalhe.id, error=str(e))
            stats["errors"] += 1

    # Depois de processar todos, marcamos como fora de exercício quem não apareceu.
    # Mas só se o batch não teve erros graves (threshold conservador).
    if source_ids_vistos and stats["errors"] < max(5, stats["processed"] * 0.1):
        with session_scope() as session:
            n = mark_not_in_exercise(session, casa="camara", source_ids_atuais=source_ids_vistos)
            stats["marked_inactive"] = n
    else:
        logger.warning(
            "skipping_mark_inactive",
            reason="too_many_errors_or_empty_batch",
            errors=stats["errors"],
            processed=stats["processed"],
        )


def _persist_deputado(session, detalhe: DeputadoDetalhe) -> None:
    """Grava um deputado + seu mandato atual no banco. Dentro de uma transação."""
    status = detalhe.ultimo_status

    uf_id = resolve_uf_id(session, status.sigla_uf)
    partido_id = upsert_partido(session, status.sigla_partido)
    ensure_legislatura(session, status.id_legislatura)

    redes = parse_redes(detalhe.rede_social)
    em_exercicio = (status.situacao or "").lower().startswith("exerc")

    parlamentar_id = upsert_parlamentar(
        session,
        casa="camara",
        source_id=str(detalhe.id),
        nome=status.nome_eleitoral or status.nome,
        nome_civil=detalhe.nome_civil,
        cpf=detalhe.cpf,
        sexo=detalhe.sexo,
        data_nascimento=detalhe.data_nascimento,
        uf_id=uf_id,
        partido_id=partido_id,
        foto_url=status.url_foto,
        email=(status.gabinete.email if status.gabinete else status.email) or status.email,
        site=detalhe.url_website,
        redes=redes,
        escolaridade=detalhe.escolaridade,
        situacao=status.situacao,
        em_exercicio=em_exercicio,
    )

    if status.data is not None:
        upsert_mandato(
            session,
            parlamentar_id=parlamentar_id,
            casa="camara",
            legislatura_id=status.id_legislatura,
            partido_id=partido_id,
            uf_id=uf_id,
            tipo=status.condicao_eleitoral,
            data_inicio=status.data,
        )


# Mantemos a função resumo_to_detalhe pra uso em testes sintéticos
def _resumo_as_detalhe(resumo: DeputadoResumo) -> DeputadoDetalhe:
    """Útil quando um teste quer gerar DeputadoDetalhe a partir só do resumo."""
    from datetime import date

    return DeputadoDetalhe(
        id=resumo.id,
        nomeCivil=None,
        ultimoStatus={
            "id": resumo.id,
            "nome": resumo.nome,
            "siglaPartido": resumo.sigla_partido,
            "siglaUf": resumo.sigla_uf,
            "idLegislatura": resumo.id_legislatura or 57,
            "urlFoto": resumo.url_foto,
            "email": resumo.email,
            "data": date(2023, 2, 1),
            "nomeEleitoral": resumo.nome,
            "situacao": "Exercício",
            "condicaoEleitoral": "Titular",
        },
    )
