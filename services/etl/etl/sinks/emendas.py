"""Upsert de emendas parlamentares + match com parlamentares no banco."""

from __future__ import annotations

import re
from decimal import Decimal

import structlog
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = structlog.get_logger(__name__)


def normalize_nome(nome: str | None) -> str:
    """Remove sufixos tipo '(PT/SP)' e normaliza whitespace para matching."""
    if not nome:
        return ""
    # Remove conteúdo entre parênteses no final: "Fulano da Silva (PT/SP)"
    s = re.sub(r"\s*\([^)]*\)\s*$", "", nome)
    # Normaliza espaços múltiplos
    s = re.sub(r"\s+", " ", s).strip()
    return s.upper()


def resolve_parlamentar_por_nome(session: Session, autor_livre: str) -> str | None:
    """Resolve `parlamentar_id` fazendo match case-insensitive por nome.

    Tenta nome parlamentar primeiro, depois nome civil. Prefere match
    com parlamentares em exercício; se houver múltiplos, pega o primeiro.
    Retorna None se não achar com confiança (um só match).
    """
    normalized = normalize_nome(autor_livre)
    if not normalized or len(normalized) < 6:
        return None

    row = session.execute(
        text(
            """
            SELECT id
            FROM parlamentares
            WHERE UPPER(nome) = :n
               OR UPPER(nome_civil) = :n
            ORDER BY em_exercicio DESC
            LIMIT 2
            """
        ),
        {"n": normalized},
    ).fetchall()

    if len(row) == 1:
        return str(row[0][0])
    return None  # 0 ou múltiplos matches ambíguos


def upsert_emenda(
    session: Session,
    *,
    codigo_emenda: str,
    ano: int,
    tipo_emenda: str | None,
    autor_livre: str,
    parlamentar_id: str | None,
    numero_emenda: str | None,
    localidade_do_gasto: str | None,
    funcao: str | None,
    subfuncao: str | None,
    valor_empenhado: Decimal,
    valor_liquidado: Decimal,
    valor_pago: Decimal,
    valor_resto_inscrito: Decimal,
    valor_resto_cancelado: Decimal,
    valor_resto_pago: Decimal,
) -> None:
    """Upsert idempotente de uma emenda. Chave: codigo_emenda."""
    session.execute(
        text(
            """
            INSERT INTO emendas (
                codigo_emenda, ano, tipo_emenda, autor_livre, parlamentar_id,
                numero_emenda, localidade_do_gasto, funcao, subfuncao,
                valor_empenhado, valor_liquidado, valor_pago,
                valor_resto_inscrito, valor_resto_cancelado, valor_resto_pago
            ) VALUES (
                :codigo_emenda, :ano, :tipo_emenda, :autor_livre, :parlamentar_id,
                :numero_emenda, :localidade_do_gasto, :funcao, :subfuncao,
                :valor_empenhado, :valor_liquidado, :valor_pago,
                :valor_resto_inscrito, :valor_resto_cancelado, :valor_resto_pago
            )
            ON CONFLICT (codigo_emenda) DO UPDATE SET
                ano                    = EXCLUDED.ano,
                tipo_emenda            = COALESCE(EXCLUDED.tipo_emenda, emendas.tipo_emenda),
                autor_livre            = EXCLUDED.autor_livre,
                parlamentar_id         = COALESCE(EXCLUDED.parlamentar_id, emendas.parlamentar_id),
                numero_emenda          = COALESCE(EXCLUDED.numero_emenda, emendas.numero_emenda),
                localidade_do_gasto    = COALESCE(EXCLUDED.localidade_do_gasto, emendas.localidade_do_gasto),
                funcao                 = COALESCE(EXCLUDED.funcao, emendas.funcao),
                subfuncao              = COALESCE(EXCLUDED.subfuncao, emendas.subfuncao),
                valor_empenhado        = EXCLUDED.valor_empenhado,
                valor_liquidado        = EXCLUDED.valor_liquidado,
                valor_pago             = EXCLUDED.valor_pago,
                valor_resto_inscrito   = EXCLUDED.valor_resto_inscrito,
                valor_resto_cancelado  = EXCLUDED.valor_resto_cancelado,
                valor_resto_pago       = EXCLUDED.valor_resto_pago
            """
        ),
        {
            "codigo_emenda": codigo_emenda,
            "ano": ano,
            "tipo_emenda": tipo_emenda,
            "autor_livre": autor_livre,
            "parlamentar_id": parlamentar_id,
            "numero_emenda": numero_emenda,
            "localidade_do_gasto": localidade_do_gasto,
            "funcao": funcao,
            "subfuncao": subfuncao,
            "valor_empenhado": valor_empenhado,
            "valor_liquidado": valor_liquidado,
            "valor_pago": valor_pago,
            "valor_resto_inscrito": valor_resto_inscrito,
            "valor_resto_cancelado": valor_resto_cancelado,
            "valor_resto_pago": valor_resto_pago,
        },
    )
