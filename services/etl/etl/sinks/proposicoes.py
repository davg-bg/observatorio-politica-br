"""Upsert de proposições enriquecidas (detalhes, tramitação, temas)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = structlog.get_logger(__name__)


def _parse_date(raw: Any) -> date | None:
    if not raw:
        return None
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw
    try:
        return date.fromisoformat(str(raw)[:10])
    except ValueError:
        return None


def _parse_datetime(raw: Any) -> datetime | None:
    if not raw:
        return None
    try:
        s = str(raw)
        # API às vezes retorna "2024-05-15T10:30"
        if len(s) == 16:
            s = s + ":00"
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def is_arquivada(descricao_situacao: str | None) -> bool:
    """Marca como arquivada quando descrição começa com "Arquivada"/"Transformada em Norma Jurídica"
    ou contém palavras-chave de encerramento."""
    if not descricao_situacao:
        return False
    s = descricao_situacao.strip().lower()
    terminativas = (
        "arquivada",
        "arquivado",
        "arquivamento",
        "transformad",  # "Transformada em Norma Jurídica" / "Transformado em Lei"
        "retirada pelo autor",
        "prejudicada",
    )
    return any(s.startswith(t) or t in s for t in terminativas)


def upsert_proposicao_enriquecida(
    session: Session,
    *,
    casa: str,
    source_id: str,
    detalhe: dict,
    ultima_tramitacao: datetime | None,
) -> str:
    """Upsert com dados detalhados vindos de GET /proposicoes/{id}.

    Preserva o `uri` já salvo se não vier atualizado.
    """
    sigla = str(detalhe.get("siglaTipo") or "?")
    numero = int(detalhe.get("numero") or 0)
    ano = int(detalhe.get("ano") or 0)
    ementa = str(detalhe.get("ementa") or "")
    ementa_detalhada = detalhe.get("ementaDetalhada")
    keywords = detalhe.get("keywords")
    data_apresentacao = _parse_date(detalhe.get("dataApresentacao"))

    status = detalhe.get("statusProposicao") or {}
    descricao_situacao = status.get("descricaoSituacao")
    descricao_tramitacao = status.get("descricaoTramitacao")
    sigla_orgao_atual = status.get("siglaOrgao")
    url_inteiro_teor = detalhe.get("urlInteiroTeor")

    row = session.execute(
        text(
            """
            INSERT INTO proposicoes (
                casa, source, source_id, sigla_tipo, numero, ano, ementa,
                ementa_detalhada, keywords, data_apresentacao,
                data_ultima_tramitacao, sigla_orgao_atual,
                descricao_situacao, descricao_tramitacao, arquivada,
                uri, url_inteiro_teor
            ) VALUES (
                CAST(:casa AS casa_legislativa), :source, :source_id, :sigla, :numero, :ano, :ementa,
                :ementa_detalhada, :keywords, :data_apresentacao,
                :data_ultima_tramitacao, :sigla_orgao_atual,
                :descricao_situacao, :descricao_tramitacao, :arquivada,
                :uri, :url_inteiro_teor
            )
            ON CONFLICT (casa, source_id) DO UPDATE SET
                sigla_tipo               = EXCLUDED.sigla_tipo,
                numero                   = EXCLUDED.numero,
                ano                      = EXCLUDED.ano,
                ementa                   = COALESCE(NULLIF(EXCLUDED.ementa, ''), proposicoes.ementa),
                ementa_detalhada         = COALESCE(EXCLUDED.ementa_detalhada, proposicoes.ementa_detalhada),
                keywords                 = COALESCE(EXCLUDED.keywords, proposicoes.keywords),
                data_apresentacao        = COALESCE(EXCLUDED.data_apresentacao, proposicoes.data_apresentacao),
                data_ultima_tramitacao   = COALESCE(EXCLUDED.data_ultima_tramitacao, proposicoes.data_ultima_tramitacao),
                sigla_orgao_atual        = COALESCE(EXCLUDED.sigla_orgao_atual, proposicoes.sigla_orgao_atual),
                descricao_situacao       = COALESCE(EXCLUDED.descricao_situacao, proposicoes.descricao_situacao),
                descricao_tramitacao     = COALESCE(EXCLUDED.descricao_tramitacao, proposicoes.descricao_tramitacao),
                arquivada                = EXCLUDED.arquivada,
                uri                      = COALESCE(EXCLUDED.uri, proposicoes.uri),
                url_inteiro_teor         = COALESCE(EXCLUDED.url_inteiro_teor, proposicoes.url_inteiro_teor)
            RETURNING id
            """
        ),
        {
            "casa": casa,
            "source": casa,
            "source_id": source_id,
            "sigla": sigla,
            "numero": numero,
            "ano": ano,
            "ementa": ementa,
            "ementa_detalhada": ementa_detalhada,
            "keywords": keywords,
            "data_apresentacao": data_apresentacao,
            "data_ultima_tramitacao": ultima_tramitacao,
            "sigla_orgao_atual": sigla_orgao_atual,
            "descricao_situacao": descricao_situacao,
            "descricao_tramitacao": descricao_tramitacao,
            "arquivada": is_arquivada(descricao_situacao),
            "uri": detalhe.get("uri"),
            "url_inteiro_teor": url_inteiro_teor,
        },
    ).fetchone()
    assert row is not None
    return str(row[0])


def upsert_tramitacao(
    session: Session,
    *,
    proposicao_id: str,
    sequencia: int,
    data: datetime,
    sigla_orgao: str | None,
    descricao_tramitacao: str | None,
    descricao_situacao: str | None,
    despacho: str | None,
    url: str | None,
) -> None:
    """Upsert de uma linha de tramitação. Chave: (proposicao_id, sequencia)."""
    session.execute(
        text(
            """
            INSERT INTO tramitacoes (
                proposicao_id, sequencia, data, sigla_orgao,
                descricao_tramitacao, descricao_situacao, despacho, url
            ) VALUES (
                :proposicao_id, :sequencia, :data, :sigla_orgao,
                :descricao_tramitacao, :descricao_situacao, :despacho, :url
            )
            ON CONFLICT (proposicao_id, sequencia) DO UPDATE SET
                data                 = EXCLUDED.data,
                sigla_orgao          = EXCLUDED.sigla_orgao,
                descricao_tramitacao = EXCLUDED.descricao_tramitacao,
                descricao_situacao   = EXCLUDED.descricao_situacao,
                despacho             = EXCLUDED.despacho,
                url                  = EXCLUDED.url
            """
        ),
        {
            "proposicao_id": proposicao_id,
            "sequencia": sequencia,
            "data": data,
            "sigla_orgao": sigla_orgao,
            "descricao_tramitacao": descricao_tramitacao,
            "descricao_situacao": descricao_situacao,
            "despacho": despacho,
            "url": url,
        },
    )


def upsert_tema(session: Session, tema_id: int, nome: str, uri: str | None = None) -> None:
    session.execute(
        text(
            """
            INSERT INTO temas (id, nome, uri) VALUES (:id, :nome, :uri)
            ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome
            """
        ),
        {"id": tema_id, "nome": nome, "uri": uri},
    )


def associate_tema(session: Session, proposicao_id: str, tema_id: int) -> None:
    session.execute(
        text(
            """
            INSERT INTO proposicoes_temas (proposicao_id, tema_id)
            VALUES (:proposicao_id, :tema_id)
            ON CONFLICT DO NOTHING
            """
        ),
        {"proposicao_id": proposicao_id, "tema_id": tema_id},
    )


def list_proposicao_shells(
    session: Session, limit: int | None = None
) -> list[tuple[str, str, str]]:
    """Lista proposições que precisam de enriquecimento (ementa vazia ou dados mínimos).

    Retorna [(id, casa, source_id), ...].
    """
    rows = session.execute(
        text(
            """
            SELECT id, casa::text, source_id
              FROM proposicoes
             WHERE data_apresentacao IS NULL OR descricao_situacao IS NULL
             ORDER BY criado_em DESC
             LIMIT :limit
            """
        ),
        {"limit": limit if limit is not None else 10_000},
    ).fetchall()
    return [(str(r[0]), r[1], r[2]) for r in rows]
