"""Validação estrutural da migration 0002 (proposições/votações)."""

from __future__ import annotations

import re

import pytest

from etl.migrate import discover_migrations


@pytest.fixture
def migration_sql() -> str:
    migrations = discover_migrations()
    m = next((p for p in migrations if p.stem == "0002_proposicoes"), None)
    assert m is not None, "Esperada migration 0002_proposicoes.sql"
    return m.read_text(encoding="utf-8")


class TestMigration0002:
    def test_opens_and_closes_transaction(self, migration_sql: str) -> None:
        assert re.search(r"^BEGIN\s*;", migration_sql, re.MULTILINE)
        assert re.search(r"^COMMIT\s*;", migration_sql, re.MULTILINE)

    def test_registers_version(self, migration_sql: str) -> None:
        assert "'0002_proposicoes'" in migration_sql

    @pytest.mark.parametrize(
        "table",
        [
            "proposicoes",
            "temas",
            "proposicoes_temas",
            "proposicoes_autores",
            "tramitacoes",
            "votacoes",
            "votos",
            "orientacoes_partidarias",
        ],
    )
    def test_creates_table(self, migration_sql: str, table: str) -> None:
        pattern = rf"CREATE TABLE IF NOT EXISTS\s+{re.escape(table)}\s*\("
        assert re.search(pattern, migration_sql, re.IGNORECASE), f"tabela '{table}' ausente"

    def test_proposicoes_unique_source(self, migration_sql: str) -> None:
        """ETL depende do UNIQUE (casa, source_id) pro upsert ser idempotente."""
        assert "proposicoes_unique_source UNIQUE (casa, source_id)" in migration_sql

    def test_votacoes_unique_source(self, migration_sql: str) -> None:
        assert "votacoes_unique_source UNIQUE (casa, source_id)" in migration_sql

    def test_votos_unique_votacao_parlamentar(self, migration_sql: str) -> None:
        """Cada parlamentar vota uma única vez em cada votação."""
        assert "votos_unique UNIQUE (votacao_id, parlamentar_id)" in migration_sql

    def test_orientacoes_unique_votacao_partido(self, migration_sql: str) -> None:
        assert "orientacao_unique UNIQUE (votacao_id, partido_id)" in migration_sql

    @pytest.mark.parametrize(
        "index",
        [
            "idx_proposicoes_data_apresentacao",
            "idx_proposicoes_ultima_tramitacao",
            "idx_proposicoes_arquivada",
            "idx_proposicoes_ementa_trgm",
            "idx_votacoes_data_registro",
            "idx_votos_parlamentar",
            "idx_votos_votacao",
            "idx_votos_tipo",
        ],
    )
    def test_has_important_indexes(self, migration_sql: str, index: str) -> None:
        """Índices críticos pra performance das queries na Fase 2+."""
        pattern = rf"CREATE INDEX IF NOT EXISTS\s+{re.escape(index)}\s"
        assert re.search(pattern, migration_sql), f"índice '{index}' ausente"

    def test_proposicoes_tramitacao_unique_sequencia(self, migration_sql: str) -> None:
        """Sequência da tramitação é a chave que evita duplicatas."""
        assert "tramitacao_unique UNIQUE (proposicao_id, sequencia)" in migration_sql

    def test_votos_tem_partido_snapshot(self, migration_sql: str) -> None:
        """`partido_id_na_epoca` é essencial pra análise temporal correta."""
        assert "partido_id_na_epoca" in migration_sql
        assert re.search(r"COMMENT ON COLUMN votos.partido_id_na_epoca", migration_sql)

    def test_autores_check_identificado(self, migration_sql: str) -> None:
        """Autor sempre tem parlamentar_id OU nome_livre (não ambos nulos)."""
        assert "autor_identificado CHECK" in migration_sql

    def test_cascade_deletes_para_filhos(self, migration_sql: str) -> None:
        """Apagar uma proposição deve apagar suas tramitações, temas e autores."""
        for table in ("tramitacoes", "proposicoes_temas", "proposicoes_autores"):
            # procura o REFERENCES proposicoes ... ON DELETE CASCADE dentro da definição da tabela
            section = _find_table_section(migration_sql, table)
            assert "ON DELETE CASCADE" in section, f"{table} não cascata ao apagar proposição"


def _find_table_section(sql: str, table: str) -> str:
    pattern = rf"CREATE TABLE IF NOT EXISTS\s+{re.escape(table)}\s*\((.*?)^\);"
    m = re.search(pattern, sql, re.IGNORECASE | re.DOTALL | re.MULTILINE)
    assert m, f"seção da tabela '{table}' não encontrada"
    return m.group(1)
