"""Validação estrutural das migrations SQL.

Estes testes não executam o SQL (precisariam de Postgres), mas garantem:
  • que cada migration abre/fecha transação,
  • que registra sua versão em schema_migrations,
  • que o seed de UFs contém as 27 unidades da federação,
  • que o schema inclui as tabelas esperadas pela Fase 1.

Isso pega erros grosseiros antes que o usuário aplique no banco real.
"""

from __future__ import annotations

import re

import pytest

from etl.migrate import MIGRATIONS_DIR, discover_migrations, version_from_filename


def test_migrations_directory_exists() -> None:
    assert MIGRATIONS_DIR.exists(), f"Esperado diretório {MIGRATIONS_DIR}"


def test_at_least_one_migration() -> None:
    migrations = discover_migrations()
    assert len(migrations) >= 1, "Esperada pelo menos 1 migration"


def test_version_from_filename() -> None:
    from pathlib import Path

    assert version_from_filename(Path("db/migrations/0001_init.sql")) == "0001_init"
    assert version_from_filename(Path("0042_foo_bar.sql")) == "0042_foo_bar"


@pytest.fixture
def init_migration_sql() -> str:
    migrations = discover_migrations()
    init = next((m for m in migrations if m.stem == "0001_init"), None)
    assert init is not None, "Esperada migration 0001_init.sql"
    return init.read_text(encoding="utf-8")


class TestInitMigration:
    """0001_init precisa criar o schema completo da Fase 0."""

    def test_opens_and_closes_transaction(self, init_migration_sql: str) -> None:
        sql = init_migration_sql
        assert re.search(r"^BEGIN\s*;", sql, re.MULTILINE), "migration deve começar com BEGIN"
        assert re.search(r"^COMMIT\s*;", sql, re.MULTILINE), "migration deve terminar com COMMIT"

    def test_registers_version(self, init_migration_sql: str) -> None:
        assert "INSERT INTO schema_migrations" in init_migration_sql, (
            "migration deve inserir sua versão em schema_migrations"
        )
        assert "'0001_init'" in init_migration_sql, "versão '0001_init' deve ser inserida"

    @pytest.mark.parametrize(
        "table",
        [
            "ufs",
            "partidos",
            "legislaturas",
            "parlamentares",
            "mandatos",
            "ingest_runs",
            "schema_migrations",
        ],
    )
    def test_creates_table(self, init_migration_sql: str, table: str) -> None:
        pattern = rf"CREATE TABLE IF NOT EXISTS\s+{re.escape(table)}\s*\("
        assert re.search(pattern, init_migration_sql, re.IGNORECASE), (
            f"tabela '{table}' não encontrada"
        )

    def test_creates_enums(self, init_migration_sql: str) -> None:
        for enum_type in ("casa_legislativa", "regiao_brasil", "ingest_status"):
            assert f"CREATE TYPE {enum_type}" in init_migration_sql, f"enum {enum_type} ausente"

    def test_uf_seed_has_27_entries(self, init_migration_sql: str) -> None:
        # Conta as linhas de insert dentro do bloco de seeds de UFs
        uf_section = _extract_block(init_migration_sql, "INSERT INTO ufs")
        # Cada UF é uma linha ('XX', 'nome', 'região'),
        rows = re.findall(r"\(\s*'[A-Z]{2}'\s*,", uf_section)
        assert len(rows) == 27, f"Esperadas 27 UFs, achei {len(rows)}"

    def test_uf_seed_covers_all_regions(self, init_migration_sql: str) -> None:
        uf_section = _extract_block(init_migration_sql, "INSERT INTO ufs")
        for regiao in ("Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"):
            assert f"'{regiao}'" in uf_section, f"Região {regiao} ausente"

    def test_partido_seed_includes_major_parties(self, init_migration_sql: str) -> None:
        partido_section = _extract_block(init_migration_sql, "INSERT INTO partidos")
        # Partidos com representação relevante no Congresso em 2024/2025
        for sigla in ("PT", "PL", "MDB", "PSD", "UNIÃO", "PSOL", "NOVO", "REPUBLICANOS"):
            assert f"'{sigla}'" in partido_section, f"Partido {sigla} ausente no seed"

    def test_parlamentares_has_unique_source(self, init_migration_sql: str) -> None:
        assert "UNIQUE (casa, source_id)" in init_migration_sql, (
            "constraint UNIQUE (casa, source_id) é essencial para idempotência do ETL"
        )

    def test_trigram_index_for_name_search(self, init_migration_sql: str) -> None:
        """Busca por nome na UI usa índice GIN com trigrams."""
        assert "gin_trgm_ops" in init_migration_sql
        assert 'CREATE EXTENSION IF NOT EXISTS "pg_trgm"' in init_migration_sql


def _extract_block(sql: str, start_marker: str) -> str:
    """Retorna da ocorrência de `start_marker` até o próximo `;`."""
    idx = sql.find(start_marker)
    assert idx >= 0, f"marker '{start_marker}' não encontrado"
    end = sql.find(";", idx)
    return sql[idx : end + 1 if end > 0 else len(sql)]
