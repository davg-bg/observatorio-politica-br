"""Aplicador de migrations SQL.

Lê todos os arquivos `.sql` em `db/migrations/` em ordem lexicográfica
(0001_*, 0002_*, ...), consulta `schema_migrations` para pular as já
aplicadas e executa as pendentes.

Cada migration **deve** ser idempotente e **deve** inserir sua própria
versão em `schema_migrations` ao final (o aplicador também insere como
fallback, mas o padrão é a migration fazer isso dentro da transação).

Convenção do nome: `NNNN_descricao.sql`. A `version` é o prefixo antes
da primeira `_` (ex: "0001" ou "0001_init" — tudo antes da extensão).
"""

from __future__ import annotations

from pathlib import Path

import structlog
from sqlalchemy import text

from etl.config import MONOREPO_ROOT
from etl.db import get_engine

logger = structlog.get_logger(__name__)

MIGRATIONS_DIR = MONOREPO_ROOT / "db" / "migrations"


def discover_migrations() -> list[Path]:
    """Retorna arquivos de migration em ordem lexicográfica."""
    if not MIGRATIONS_DIR.exists():
        return []
    return sorted(p for p in MIGRATIONS_DIR.glob("*.sql") if p.is_file())


def version_from_filename(path: Path) -> str:
    """Converte 'db/migrations/0001_init.sql' em '0001_init'."""
    return path.stem


def get_applied_versions() -> set[str]:
    """Lê schema_migrations. Retorna conjunto vazio se a tabela não existe."""
    try:
        with get_engine().connect() as conn:
            result = conn.execute(text("SELECT version FROM schema_migrations"))
            return {row[0] for row in result}
    except Exception as e:
        # Primeira execução: a tabela ainda não existe.
        logger.debug("schema_migrations_not_found", error=str(e))
        return set()


def apply_migration(path: Path, *, dry_run: bool = False) -> None:
    """Aplica uma migration. Toda a sua execução acontece numa única conexão."""
    sql = path.read_text(encoding="utf-8")
    version = version_from_filename(path)
    log = logger.bind(version=version, file=path.name)

    if dry_run:
        log.info("migration_pending", mode="dry-run", bytes=len(sql))
        return

    log.info("applying_migration")
    engine = get_engine()
    # psycopg3 interpreta `%` como placeholder em exec_driver_sql; escapamos
    # literais ('%' → '%%') pra permitir ILIKE '%foo%' e comentários com '%'
    # em migrations SQL puras.
    sql_escaped = sql.replace("%", "%%")
    with engine.begin() as conn:
        conn.exec_driver_sql(sql_escaped)
        # Fallback: se a própria migration esqueceu de registrar, nós garantimos.
        conn.execute(
            text(
                "INSERT INTO schema_migrations (version) VALUES (:v) "
                "ON CONFLICT (version) DO NOTHING"
            ),
            {"v": version},
        )
    log.info("migration_applied")


def run_pending(*, dry_run: bool = False) -> dict[str, list[str]]:
    """Aplica todas as migrations pendentes. Retorna {applied: [...], skipped: [...]}."""
    migrations = discover_migrations()
    if not migrations:
        logger.warning("no_migrations_found", dir=str(MIGRATIONS_DIR))
        return {"applied": [], "skipped": []}

    applied_before = get_applied_versions()
    applied: list[str] = []
    skipped: list[str] = []

    for path in migrations:
        version = version_from_filename(path)
        if version in applied_before:
            skipped.append(version)
            continue
        apply_migration(path, dry_run=dry_run)
        applied.append(version)

    logger.info("migrate_done", applied=applied, skipped=skipped, dry_run=dry_run)
    return {"applied": applied, "skipped": skipped}
