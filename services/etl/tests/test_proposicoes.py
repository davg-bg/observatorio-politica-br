"""Testa parsing, upsert e detecção de arquivadas em proposições."""

from __future__ import annotations

import pytest

from etl.migrate import discover_migrations
from etl.sinks.proposicoes import is_arquivada


class TestIsArquivada:
    @pytest.mark.parametrize(
        "descricao,expected",
        [
            ("Arquivada", True),
            ("Arquivada ao Final da Legislatura", True),
            ("Arquivado nos termos do artigo 105", True),
            ("Transformada em Norma Jurídica", True),
            ("Transformado em Lei Nº 14.000/2024", True),
            ("Retirada pelo Autor", True),
            ("Prejudicada", True),
            ("Em tramitação", False),
            ("Pronta para pauta", False),
            ("Aguardando parecer", False),
            (None, False),
            ("", False),
        ],
    )
    def test_detect(self, descricao, expected) -> None:
        assert is_arquivada(descricao) == expected


class TestMigration0005:
    @pytest.fixture
    def migration_sql(self) -> str:
        migrations = discover_migrations()
        m = next((p for p in migrations if p.stem == "0005_engavetados"), None)
        assert m is not None, "Esperada migration 0005_engavetados.sql"
        return m.read_text(encoding="utf-8")

    def test_cria_mview(self, migration_sql: str) -> None:
        assert "CREATE MATERIALIZED VIEW v_engavetados" in migration_sql

    def test_criterio_arquivada_false(self, migration_sql: str) -> None:
        """Core do filtro: só não arquivadas."""
        assert "arquivada = FALSE" in migration_sql

    def test_criterio_180_dias(self, migration_sql: str) -> None:
        """180 dias sem tramitação é o threshold padrão da fase 4."""
        assert "INTERVAL '180 days'" in migration_sql

    def test_filtra_pls_novos(self, migration_sql: str) -> None:
        """Proposição recente (< 1 ano) não é engavetada, só lenta."""
        assert "INTERVAL '365 days'" in migration_sql

    def test_agrega_temas(self, migration_sql: str) -> None:
        """A view precisa concentrar temas em array para filtro na UI."""
        assert "ARRAY_AGG" in migration_sql
        assert "proposicoes_temas" in migration_sql

    def test_cria_refresh_function(self, migration_sql: str) -> None:
        assert "CREATE OR REPLACE FUNCTION refresh_engavetados" in migration_sql
        assert "REFRESH MATERIALIZED VIEW CONCURRENTLY v_engavetados" in migration_sql

    def test_unique_index_para_concurrent_refresh(self, migration_sql: str) -> None:
        assert "idx_v_engavetados_pk" in migration_sql


class TestCLIProposicoesJob:
    def test_job_registered(self) -> None:
        from etl.cli import JOB_GROUPS, JOBS

        assert "camara-proposicoes" in JOBS
        assert "camara-proposicoes" in JOB_GROUPS["daily"]
