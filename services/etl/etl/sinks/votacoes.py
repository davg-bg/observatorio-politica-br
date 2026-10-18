"""Upserts para votações, votos individuais e orientações partidárias."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = structlog.get_logger(__name__)


def upsert_proposicao_shell(
    session: Session,
    *,
    casa: str,
    source_id: str,
    sigla_tipo: str,
    numero: int,
    ano: int,
    ementa: str,
    uri: str | None = None,
    data_apresentacao: date | None = None,
) -> str:
    """Cria/atualiza um 'shell' de proposição com dados mínimos.

    Útil quando descobrimos uma proposição via votação mas não puxamos ainda
    o detalhe completo. Um job posterior pode enriquecer.
    """
    row = session.execute(
        text(
            """
            INSERT INTO proposicoes (
                casa, source, source_id, sigla_tipo, numero, ano, ementa, uri, data_apresentacao
            ) VALUES (
                CAST(:casa AS casa_legislativa), :source, :source_id, :sigla_tipo,
                :numero, :ano, :ementa, :uri, :data_apresentacao
            )
            ON CONFLICT (casa, source_id) DO UPDATE SET
                ementa     = COALESCE(NULLIF(EXCLUDED.ementa, ''), proposicoes.ementa),
                uri        = COALESCE(EXCLUDED.uri, proposicoes.uri),
                sigla_tipo = COALESCE(EXCLUDED.sigla_tipo, proposicoes.sigla_tipo),
                numero     = EXCLUDED.numero,
                ano        = EXCLUDED.ano
            RETURNING id
            """
        ),
        {
            "casa": casa,
            "source": casa,
            "source_id": source_id,
            "sigla_tipo": sigla_tipo,
            "numero": numero,
            "ano": ano,
            "ementa": ementa,
            "uri": uri,
            "data_apresentacao": data_apresentacao,
        },
    ).fetchone()
    assert row is not None
    return str(row[0])


def upsert_votacao(
    session: Session,
    *,
    casa: str,
    source_id: str,
    data_hora_registro: datetime,
    descricao: str,
    aprovacao: bool | None,
    sigla_orgao: str | None,
    proposicao_id: str | None = None,
    votos_sim: int = 0,
    votos_nao: int = 0,
    votos_abstencao: int = 0,
    votos_outros: int = 0,
    uri_evento: str | None = None,
    uri: str | None = None,
) -> str:
    """Upsert de votação. Retorna o uuid."""
    row = session.execute(
        text(
            """
            INSERT INTO votacoes (
                casa, source, source_id, proposicao_id, data_hora_registro,
                sigla_orgao, descricao, aprovacao,
                votos_sim, votos_nao, votos_abstencao, votos_outros,
                uri_evento, uri
            ) VALUES (
                CAST(:casa AS casa_legislativa), :source, :source_id, :proposicao_id, :data_hora_registro,
                :sigla_orgao, :descricao, :aprovacao,
                :votos_sim, :votos_nao, :votos_abstencao, :votos_outros,
                :uri_evento, :uri
            )
            ON CONFLICT (casa, source_id) DO UPDATE SET
                proposicao_id      = COALESCE(EXCLUDED.proposicao_id, votacoes.proposicao_id),
                data_hora_registro = EXCLUDED.data_hora_registro,
                sigla_orgao        = EXCLUDED.sigla_orgao,
                descricao          = EXCLUDED.descricao,
                aprovacao          = COALESCE(EXCLUDED.aprovacao, votacoes.aprovacao),
                votos_sim          = EXCLUDED.votos_sim,
                votos_nao          = EXCLUDED.votos_nao,
                votos_abstencao    = EXCLUDED.votos_abstencao,
                votos_outros       = EXCLUDED.votos_outros,
                uri_evento         = COALESCE(EXCLUDED.uri_evento, votacoes.uri_evento),
                uri                = COALESCE(EXCLUDED.uri, votacoes.uri)
            RETURNING id
            """
        ),
        {
            "casa": casa,
            "source": casa,
            "source_id": source_id,
            "proposicao_id": proposicao_id,
            "data_hora_registro": data_hora_registro,
            "sigla_orgao": sigla_orgao,
            "descricao": descricao,
            "aprovacao": aprovacao,
            "votos_sim": votos_sim,
            "votos_nao": votos_nao,
            "votos_abstencao": votos_abstencao,
            "votos_outros": votos_outros,
            "uri_evento": uri_evento,
            "uri": uri,
        },
    ).fetchone()
    assert row is not None
    return str(row[0])


def resolve_parlamentar_id(
    session: Session,
    *,
    casa: str,
    source_id: str,
) -> str | None:
    """Resolve o UUID de um parlamentar a partir de (casa, source_id).

    Retorna None se o parlamentar não existe no banco (pode acontecer se o
    ETL de deputados nunca rodou ou o deputado é anterior ao backfill).
    """
    row = session.execute(
        text(
            """
            SELECT id FROM parlamentares
             WHERE casa = CAST(:casa AS casa_legislativa)
               AND source_id = :source_id
            """
        ),
        {"casa": casa, "source_id": source_id},
    ).fetchone()
    return str(row[0]) if row else None


def upsert_voto(
    session: Session,
    *,
    votacao_id: str,
    parlamentar_id: str,
    tipo_voto: str,
    partido_id_na_epoca: int | None = None,
    data_registro: datetime | None = None,
) -> None:
    """Upsert do voto individual. Troca o tipo_voto se houver correção."""
    session.execute(
        text(
            """
            INSERT INTO votos (
                votacao_id, parlamentar_id, tipo_voto, partido_id_na_epoca, data_registro
            ) VALUES (
                :votacao_id, :parlamentar_id, :tipo_voto, :partido_id, :data_registro
            )
            ON CONFLICT (votacao_id, parlamentar_id) DO UPDATE SET
                tipo_voto            = EXCLUDED.tipo_voto,
                partido_id_na_epoca  = COALESCE(EXCLUDED.partido_id_na_epoca, votos.partido_id_na_epoca),
                data_registro        = COALESCE(EXCLUDED.data_registro, votos.data_registro)
            """
        ),
        {
            "votacao_id": votacao_id,
            "parlamentar_id": parlamentar_id,
            "tipo_voto": tipo_voto,
            "partido_id": partido_id_na_epoca,
            "data_registro": data_registro,
        },
    )


def upsert_orientacao(
    session: Session,
    *,
    votacao_id: str,
    partido_id: int,
    orientacao: str,
) -> None:
    """Upsert de orientação partidária para uma votação."""
    session.execute(
        text(
            """
            INSERT INTO orientacoes_partidarias (votacao_id, partido_id, orientacao)
            VALUES (:votacao_id, :partido_id, :orientacao)
            ON CONFLICT (votacao_id, partido_id) DO UPDATE SET
                orientacao = EXCLUDED.orientacao
            """
        ),
        {
            "votacao_id": votacao_id,
            "partido_id": partido_id,
            "orientacao": orientacao,
        },
    )


def delete_votos_fora_de(session: Session, votacao_id: str, parlamentar_ids: set[str]) -> int:
    """Opcional: remove votos que não aparecem mais no response.
    Útil em caso de a Câmara corrigir uma votação (raro). Retorna linhas afetadas.
    """
    if not parlamentar_ids:
        return 0
    result = session.execute(
        text(
            """
            DELETE FROM votos
             WHERE votacao_id = :votacao_id
               AND parlamentar_id <> ALL(:ids::uuid[])
            """
        ),
        {"votacao_id": votacao_id, "ids": list(parlamentar_ids)},
    )
    return result.rowcount or 0


def _unused(_: Any) -> None:
    """Silence pyflakes about imported but currently unreferenced names."""
