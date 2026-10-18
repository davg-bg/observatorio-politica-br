"""Upserts para parlamentares, mandatos e tabelas de referência.

Todas as funções abaixo:
  • são idempotentes (ON CONFLICT DO UPDATE),
  • assumem que o chamador está dentro de uma `session_scope()`,
  • retornam IDs para encadear operações.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = structlog.get_logger(__name__)


def resolve_uf_id(session: Session, sigla: str | None) -> int | None:
    """Encontra o id da UF pela sigla. Retorna None se sigla inválida."""
    if not sigla:
        return None
    row = session.execute(
        text("SELECT id FROM ufs WHERE sigla = :sigla"),
        {"sigla": sigla.upper()},
    ).fetchone()
    return row[0] if row else None


def upsert_partido(session: Session, sigla: str | None, *, nome: str | None = None) -> int | None:
    """Garante que o partido existe e retorna seu id.

    Partidos novos (não semeados) são criados com nome='sigla' como fallback,
    que será atualizado se recebermos nome real depois.
    """
    if not sigla:
        return None
    sigla_up = sigla.upper()
    nome_eff = nome or sigla_up

    row = session.execute(
        text(
            """
            INSERT INTO partidos (sigla, nome)
            VALUES (:sigla, :nome)
            ON CONFLICT (sigla) DO UPDATE
                SET nome = COALESCE(EXCLUDED.nome, partidos.nome)
            RETURNING id
            """
        ),
        {"sigla": sigla_up, "nome": nome_eff},
    ).fetchone()
    assert row is not None
    return row[0]


def ensure_legislatura(
    session: Session,
    legislatura_id: int,
    *,
    data_inicio: date | None = None,
    data_fim: date | None = None,
) -> None:
    """Insere a legislatura se faltar. Datas são derivadas do número quando omitidas."""
    row = session.execute(
        text("SELECT 1 FROM legislaturas WHERE id = :id"),
        {"id": legislatura_id},
    ).fetchone()
    if row:
        return

    # Fallback: computa datas pela numeração (1º fev do ano, 4 anos de duração).
    # Legislatura N = de 2019 em diante segue (ano_inicio = 2019 + (N-56)*4).
    if data_inicio is None:
        ano_inicio = 2019 + (legislatura_id - 56) * 4
        data_inicio = date(ano_inicio, 2, 1)
    if data_fim is None:
        data_fim = date(data_inicio.year + 4, 1, 31)

    session.execute(
        text(
            """
            INSERT INTO legislaturas (id, numero, data_inicio, data_fim)
            VALUES (:id, :numero, :inicio, :fim)
            ON CONFLICT (id) DO NOTHING
            """
        ),
        {
            "id": legislatura_id,
            "numero": legislatura_id,
            "inicio": data_inicio,
            "fim": data_fim,
        },
    )


def upsert_parlamentar(
    session: Session,
    *,
    casa: str,
    source_id: str,
    nome: str,
    nome_civil: str | None = None,
    cpf: str | None = None,
    sexo: str | None = None,
    data_nascimento: date | None = None,
    uf_id: int | None = None,
    partido_id: int | None = None,
    foto_url: str | None = None,
    email: str | None = None,
    site: str | None = None,
    redes: dict[str, Any] | None = None,
    escolaridade: str | None = None,
    profissao: str | None = None,
    situacao: str | None = None,
    em_exercicio: bool = True,
) -> str:
    """Upsert e retorna o uuid do parlamentar.

    `source` é derivado de `casa` para alinhar com a tabela ingest_runs.
    """
    import json

    row = session.execute(
        text(
            """
            INSERT INTO parlamentares (
                casa, source, source_id, nome, nome_civil, cpf, sexo,
                data_nascimento, uf_id, partido_id, foto_url, email, site,
                redes, escolaridade, profissao, situacao, em_exercicio
            )
            VALUES (
                CAST(:casa AS casa_legislativa), :source, :source_id, :nome, :nome_civil, :cpf, :sexo,
                :data_nascimento, :uf_id, :partido_id, :foto_url, :email, :site,
                CAST(:redes AS JSONB), :escolaridade, :profissao, :situacao, :em_exercicio
            )
            ON CONFLICT (casa, source_id) DO UPDATE SET
                nome            = EXCLUDED.nome,
                nome_civil      = COALESCE(EXCLUDED.nome_civil, parlamentares.nome_civil),
                cpf             = COALESCE(EXCLUDED.cpf, parlamentares.cpf),
                sexo            = COALESCE(EXCLUDED.sexo, parlamentares.sexo),
                data_nascimento = COALESCE(EXCLUDED.data_nascimento, parlamentares.data_nascimento),
                uf_id           = COALESCE(EXCLUDED.uf_id, parlamentares.uf_id),
                partido_id      = COALESCE(EXCLUDED.partido_id, parlamentares.partido_id),
                foto_url        = COALESCE(EXCLUDED.foto_url, parlamentares.foto_url),
                email           = COALESCE(EXCLUDED.email, parlamentares.email),
                site            = COALESCE(EXCLUDED.site, parlamentares.site),
                redes           = EXCLUDED.redes,
                escolaridade    = COALESCE(EXCLUDED.escolaridade, parlamentares.escolaridade),
                profissao       = COALESCE(EXCLUDED.profissao, parlamentares.profissao),
                situacao        = EXCLUDED.situacao,
                em_exercicio    = EXCLUDED.em_exercicio
            RETURNING id
            """
        ),
        {
            "casa": casa,
            "source": casa,
            "source_id": source_id,
            "nome": nome,
            "nome_civil": nome_civil,
            "cpf": cpf,
            "sexo": sexo,
            "data_nascimento": data_nascimento,
            "uf_id": uf_id,
            "partido_id": partido_id,
            "foto_url": foto_url,
            "email": email,
            "site": site,
            "redes": json.dumps(redes or {}),
            "escolaridade": escolaridade,
            "profissao": profissao,
            "situacao": situacao,
            "em_exercicio": em_exercicio,
        },
    ).fetchone()
    assert row is not None
    return str(row[0])


def upsert_mandato(
    session: Session,
    *,
    parlamentar_id: str,
    casa: str,
    legislatura_id: int,
    partido_id: int | None,
    uf_id: int | None,
    tipo: str | None,
    data_inicio: date,
    data_fim: date | None = None,
) -> None:
    """Upsert de mandato na combinação (parlamentar, legislatura, casa)."""
    session.execute(
        text(
            """
            INSERT INTO mandatos (
                parlamentar_id, casa, legislatura_id, partido_id, uf_id,
                tipo, data_inicio, data_fim
            )
            VALUES (
                :parlamentar_id, CAST(:casa AS casa_legislativa), :legislatura_id, :partido_id, :uf_id,
                :tipo, :data_inicio, :data_fim
            )
            ON CONFLICT (parlamentar_id, legislatura_id, casa) DO UPDATE SET
                partido_id = COALESCE(EXCLUDED.partido_id, mandatos.partido_id),
                uf_id      = COALESCE(EXCLUDED.uf_id, mandatos.uf_id),
                tipo       = COALESCE(EXCLUDED.tipo, mandatos.tipo),
                data_fim   = COALESCE(EXCLUDED.data_fim, mandatos.data_fim)
            """
        ),
        {
            "parlamentar_id": parlamentar_id,
            "casa": casa,
            "legislatura_id": legislatura_id,
            "partido_id": partido_id,
            "uf_id": uf_id,
            "tipo": tipo,
            "data_inicio": data_inicio,
            "data_fim": data_fim,
        },
    )


def mark_not_in_exercise(session: Session, *, casa: str, source_ids_atuais: set[str]) -> int:
    """Marca `em_exercicio=false` para quem saiu desde a última sincronização.

    Retorna o número de linhas afetadas.
    """
    if not source_ids_atuais:
        # Guard: se a lista vier vazia (ex: fonte fora do ar), não desligamos ninguém.
        return 0

    result = session.execute(
        text(
            """
            UPDATE parlamentares
               SET em_exercicio = FALSE
             WHERE casa = CAST(:casa AS casa_legislativa)
               AND em_exercicio = TRUE
               AND source_id <> ALL(:ids)
            """
        ),
        {"casa": casa, "ids": list(source_ids_atuais)},
    )
    return result.rowcount or 0
