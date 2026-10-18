"""Job: ingere senadores em exercício do Senado Federal.

Fluxo:
    1. GET /senador/lista/atual (81 senadores em um só payload).
    2. Para cada um, GET /senador/{codigo} (dados básicos: nascimento, naturalidade).
    3. Resolve referências e upsert em `parlamentares` e `mandatos`.
    4. Marca em_exercicio=false para quem saiu desde a última execução.

Observação: a API do Senado não expõe redes sociais no endpoint principal
(estão em endpoints separados ou só no site). Deixamos `redes = {}` por ora;
a integração completa de redes vem numa task futura.
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

from .client import SenadoClient
from .models import DetalheSenador, ParlamentarEmExercicio, normalize_sexo

logger = structlog.get_logger(__name__)


async def run() -> None:
    """Entry point do job (invocado via CLI)."""
    async with SenadoClient() as client:
        with record_run("senado", "senadores") as run_state:
            await _process_all(client, run_state["stats"])


async def _process_all(
    client: SenadoClient,
    stats: dict,
    *,
    senadores_iter: AsyncIterator[tuple[ParlamentarEmExercicio, DetalheSenador | None]]
    | None = None,
) -> None:
    """Processa todos os senadores em exercício.

    `senadores_iter` é um hook de teste para injetar dados sem HTTP real.
    Cada item é (resumo, detalhe-opcional).
    """
    stats.setdefault("processed", 0)
    stats.setdefault("inserted_or_updated", 0)
    stats.setdefault("marked_inactive", 0)
    stats.setdefault("errors", 0)

    source_ids_vistos: set[str] = set()
    limit = settings.etl_limit

    async def _iter_from_api() -> AsyncIterator[
        tuple[ParlamentarEmExercicio, DetalheSenador | None]
    ]:
        try:
            senadores = await client.list_senadores_atuais()
        except Exception as e:
            logger.exception("list_senadores_failed", error=str(e))
            stats["errors"] += 1
            return

        count = 0
        for resumo in senadores:
            if limit is not None and count >= limit:
                return
            try:
                detalhe = await client.get_senador(resumo.identificacao.codigo)
                yield resumo, detalhe
                count += 1
            except Exception as e:
                logger.warning(
                    "get_senador_failed_using_resumo_only",
                    codigo=resumo.identificacao.codigo,
                    error=str(e),
                )
                # Fallback: processa só com o que a lista nos deu.
                yield resumo, None
                count += 1
                stats["errors"] += 1

    iterator = senadores_iter if senadores_iter is not None else _iter_from_api()

    async for resumo, detalhe in iterator:
        stats["processed"] += 1
        try:
            with session_scope() as session:
                _persist_senador(session, resumo, detalhe)
            source_ids_vistos.add(resumo.identificacao.codigo)
            stats["inserted_or_updated"] += 1
        except Exception as e:
            logger.exception("persist_failed", codigo=resumo.identificacao.codigo, error=str(e))
            stats["errors"] += 1

    if source_ids_vistos and stats["errors"] < max(5, stats["processed"] * 0.1):
        with session_scope() as session:
            n = mark_not_in_exercise(session, casa="senado", source_ids_atuais=source_ids_vistos)
            stats["marked_inactive"] = n
    else:
        logger.warning(
            "skipping_mark_inactive",
            errors=stats["errors"],
            processed=stats["processed"],
        )


def _persist_senador(
    session,
    resumo: ParlamentarEmExercicio,
    detalhe: DetalheSenador | None,
) -> None:
    """Grava um senador + seu mandato atual no banco."""
    ident = resumo.identificacao
    mandato = resumo.mandato

    uf_id = resolve_uf_id(session, ident.uf)
    partido_id = upsert_partido(session, ident.sigla_partido)

    # Legislatura do mandato
    legislatura = mandato.legislatura_atual if mandato else None
    if legislatura:
        ensure_legislatura(
            session,
            legislatura.numero,
            data_inicio=legislatura.data_inicio,
            data_fim=legislatura.data_fim,
        )

    # Dados do detalhe (quando disponíveis)
    data_nascimento = (
        detalhe.dados_basicos.data_nascimento if (detalhe and detalhe.dados_basicos) else None
    )

    parlamentar_id = upsert_parlamentar(
        session,
        casa="senado",
        source_id=ident.codigo,
        nome=ident.nome,
        nome_civil=ident.nome_completo,
        cpf=None,  # Senado não expõe CPF
        sexo=normalize_sexo(ident.sexo),
        data_nascimento=data_nascimento,
        uf_id=uf_id,
        partido_id=partido_id,
        foto_url=ident.url_foto,
        email=ident.email,
        site=ident.url_pagina,
        redes={},  # API do Senado não traz redes no endpoint principal
        escolaridade=None,
        profissao=None,
        situacao="Exercício",
        em_exercicio=True,
    )

    if legislatura and mandato:
        upsert_mandato(
            session,
            parlamentar_id=parlamentar_id,
            casa="senado",
            legislatura_id=legislatura.numero,
            partido_id=partido_id,
            uf_id=uf_id,
            tipo=mandato.descricao_participacao,
            data_inicio=legislatura.data_inicio,
            data_fim=legislatura.data_fim,
        )
