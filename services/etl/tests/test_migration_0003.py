"""Validação estrutural da migration 0003 (views de alinhamento)."""

from __future__ import annotations

import re

import pytest

from etl.migrate import discover_migrations


@pytest.fixture
def migration_sql() -> str:
    migrations = discover_migrations()
    m = next((p for p in migrations if p.stem == "0003_alinhamento"), None)
    assert m is not None, "Esperada migration 0003_alinhamento.sql"
    return m.read_text(encoding="utf-8")


class TestMigration0003:
    def test_opens_and_closes_transaction(self, migration_sql: str) -> None:
        assert re.search(r"^BEGIN\s*;", migration_sql, re.MULTILINE)
        assert re.search(r"^COMMIT\s*;", migration_sql, re.MULTILINE)

    def test_registers_version(self, migration_sql: str) -> None:
        assert "'0003_alinhamento'" in migration_sql

    def test_creates_posicao_view(self, migration_sql: str) -> None:
        assert "CREATE OR REPLACE VIEW v_posicao_partido_votacao" in migration_sql

    def test_creates_coesao_mview(self, migration_sql: str) -> None:
        assert "CREATE MATERIALIZED VIEW v_coesao_partido" in migration_sql

    def test_creates_alinhamento_mview(self, migration_sql: str) -> None:
        assert "CREATE MATERIALIZED VIEW v_alinhamento_partidos" in migration_sql

    def test_creates_refresh_function(self, migration_sql: str) -> None:
        assert "CREATE OR REPLACE FUNCTION refresh_alinhamento_views()" in migration_sql
        assert "REFRESH MATERIALIZED VIEW CONCURRENTLY v_coesao_partido" in migration_sql
        assert "REFRESH MATERIALIZED VIEW CONCURRENTLY v_alinhamento_partidos" in migration_sql

    def test_janelas_function(self, migration_sql: str) -> None:
        """Janelas 30d/90d/365d — base para análise temporal da UI."""
        assert "CREATE OR REPLACE FUNCTION alinhamento_janelas()" in migration_sql
        for janela in ("'30d'", "'90d'", "'365d'"):
            assert janela in migration_sql, f"janela {janela} ausente"

    def test_rice_only_counts_decisive_votes(self, migration_sql: str) -> None:
        """O denominador do Rice é (Sim + Não), não o total — abstenções não entram."""
        # Procura o cálculo específico dentro da seção v_coesao_partido
        assert "ABS(pos.sim - pos.nao)::real / (pos.sim + pos.nao)" in migration_sql

    def test_rice_filtra_bancadas_pequenas(self, migration_sql: str) -> None:
        """Partidos com menos de 5 presentes numa votação não contribuem (ruído)."""
        assert "(pos.sim + pos.nao) >= 5" in migration_sql

    def test_similaridade_ignora_posicoes_neutras(self, migration_sql: str) -> None:
        """Partidos que não tomaram posição (0) não entram no cálculo."""
        assert "a.posicao <> 0 AND b.posicao <> 0" in migration_sql

    def test_similaridade_filtra_pares_pequenos(self, migration_sql: str) -> None:
        """< 10 votações comuns não gera linha (significância baixa)."""
        assert "HAVING COUNT(*) >= 10" in migration_sql

    def test_pares_ordenados_para_evitar_duplicata(self, migration_sql: str) -> None:
        """Simetria A↔B representada só uma vez: condição A < B."""
        assert "b.partido_id > a.partido_id" in migration_sql

    def test_unique_indexes_para_concurrent_refresh(self, migration_sql: str) -> None:
        """REFRESH CONCURRENTLY exige unique indexes nas views materializadas."""
        assert "idx_v_coesao_partido_pk" in migration_sql
        assert "idx_v_alinhamento_partidos_pk" in migration_sql


class TestCLIRefreshViews:
    def test_cli_registra_comando_refresh_views(self) -> None:
        """O CLI expõe `etl refresh-views`."""
        from typer.testing import CliRunner

        from etl.cli import app

        runner = CliRunner()
        result = runner.invoke(app, ["--help"])
        assert "refresh-views" in result.stdout
