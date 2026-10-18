"""Testa parsing, upsert e matching de emendas parlamentares."""

from __future__ import annotations

from decimal import Decimal

import pytest

from etl.migrate import discover_migrations
from etl.sinks.emendas import normalize_nome, resolve_parlamentar_por_nome
from etl.sources.transparencia.models import EmendaDTO, parse_brl


class TestParseBrl:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("1.234,56", Decimal("1234.56")),
            ("0,00", Decimal("0")),
            ("12.345.678,90", Decimal("12345678.90")),
            ("500", Decimal("500")),
            ("", Decimal("0")),
            (None, Decimal("0")),
            (1500, Decimal("1500")),
            (99.9, Decimal("99.9")),
        ],
    )
    def test_parse(self, raw, expected) -> None:
        assert parse_brl(raw) == expected

    def test_parse_invalid_falls_back_zero(self) -> None:
        assert parse_brl("inválido") == Decimal("0")


class TestEmendaDTO:
    def test_parse_response_real(self) -> None:
        """Parse de uma resposta realista do Portal da Transparência."""
        raw = {
            "codigoEmenda": "202412345678",
            "ano": 2024,
            "tipoEmenda": "Individual",
            "autor": "FULANO DA SILVA (PT/SP)",
            "nomeAutor": "FULANO DA SILVA (PT/SP)",
            "numeroEmenda": "12345",
            "localidadeDoGasto": "SÃO PAULO (SP)",
            "funcao": "Saúde",
            "subfuncao": "Atenção Básica",
            "valorEmpenhado": "500.000,00",
            "valorLiquidado": "350.000,00",
            "valorPago": "350.000,00",
            "valorRestoInscrito": "0,00",
            "valorRestoCancelado": "0,00",
            "valorRestoPago": "0,00",
        }
        emenda = EmendaDTO.model_validate(raw)
        assert emenda.codigo_emenda == "202412345678"
        assert emenda.ano == 2024
        assert emenda.tipo_emenda == "Individual"
        assert emenda.autor_normalizado == "FULANO DA SILVA (PT/SP)"
        assert emenda.valor_empenhado == Decimal("500000")
        assert emenda.valor_liquidado == Decimal("350000")
        assert emenda.valor_pago == Decimal("350000")

    def test_prefere_nome_autor_sobre_autor(self) -> None:
        raw = {
            "codigoEmenda": "X",
            "ano": 2024,
            "autor": "abc",
            "nomeAutor": "NOME CORRETO",
        }
        emenda = EmendaDTO.model_validate(raw)
        assert emenda.autor_normalizado == "NOME CORRETO"

    def test_valores_vazios_viram_zero(self) -> None:
        raw = {"codigoEmenda": "X", "ano": 2024, "nomeAutor": "A"}
        emenda = EmendaDTO.model_validate(raw)
        assert emenda.valor_empenhado == Decimal("0")
        assert emenda.valor_pago == Decimal("0")


class TestNormalizeNome:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("Fulano da Silva (PT/SP)", "FULANO DA SILVA"),
            ("FULANO DA SILVA (PT/SP)", "FULANO DA SILVA"),
            ("  Fulano  da  Silva  ", "FULANO DA SILVA"),
            ("Senador Beltrano", "SENADOR BELTRANO"),
            ("", ""),
            (None, ""),
        ],
    )
    def test_normalize(self, raw, expected) -> None:
        assert normalize_nome(raw) == expected


class TestResolvePorNome:
    def test_match_unico_retorna_id(self, fake_session) -> None:
        from tests.conftest import FakeSession

        session: FakeSession = fake_session
        session.on("FROM parlamentares", rows=[("abc-uuid",)])
        result = resolve_parlamentar_por_nome(session, "FULANO DA SILVA (PT/SP)")
        assert result == "abc-uuid"

    def test_match_ambiguo_retorna_none(self, fake_session) -> None:
        from tests.conftest import FakeSession

        session: FakeSession = fake_session
        session.on("FROM parlamentares", rows=[("a",), ("b",)])
        result = resolve_parlamentar_por_nome(session, "FULANO DA SILVA")
        assert result is None

    def test_match_vazio_retorna_none(self, fake_session) -> None:
        from tests.conftest import FakeSession

        session: FakeSession = fake_session
        session.on("FROM parlamentares", rows=[])
        result = resolve_parlamentar_por_nome(session, "FULANO")
        assert result is None

    def test_nome_curto_nao_consulta(self, fake_session) -> None:
        """< 6 chars não arrisca match ambíguo."""
        result = resolve_parlamentar_por_nome(fake_session, "A")
        assert result is None
        # Confirma que não fez query
        assert fake_session.find_call("FROM parlamentares") is None


class TestMigration0004:
    @pytest.fixture
    def migration_sql(self) -> str:
        migrations = discover_migrations()
        m = next((p for p in migrations if p.stem == "0004_emendas"), None)
        assert m is not None, "Esperada migration 0004_emendas.sql"
        return m.read_text(encoding="utf-8")

    def test_cria_tabela_emendas(self, migration_sql: str) -> None:
        assert "CREATE TABLE IF NOT EXISTS emendas" in migration_sql

    def test_codigo_emenda_unique(self, migration_sql: str) -> None:
        assert "codigo_emenda       TEXT NOT NULL UNIQUE" in migration_sql

    def test_cria_mview_ranking(self, migration_sql: str) -> None:
        assert "CREATE MATERIALIZED VIEW v_ranking_emendas_parlamentar" in migration_sql
        assert "GROUP BY p.id" in migration_sql

    def test_cria_refresh_function(self, migration_sql: str) -> None:
        assert "CREATE OR REPLACE FUNCTION refresh_emendas_views" in migration_sql
        assert "REFRESH MATERIALIZED VIEW CONCURRENTLY" in migration_sql

    def test_indexes_essenciais(self, migration_sql: str) -> None:
        for idx in ("idx_emendas_ano", "idx_emendas_tipo", "idx_emendas_valor_pago"):
            assert idx in migration_sql
