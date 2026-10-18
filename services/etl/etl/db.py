"""Camada de acesso ao banco (SQLAlchemy Core)."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import structlog
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from etl.config import settings

logger = structlog.get_logger(__name__)

_engine: Engine | None = None
_SessionFactory: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    """Lazy-cria o engine. Lança se DATABASE_URL não estiver setada."""
    global _engine
    if _engine is None:
        if not settings.database_url:
            raise RuntimeError("DATABASE_URL não configurada. Defina em .env ou nas env vars.")
        # psycopg3 driver
        url = settings.database_url
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        _engine = create_engine(url, pool_pre_ping=True, future=True)
        logger.info("db_engine_created", driver="psycopg", url_masked=_mask_url(url))
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    global _SessionFactory
    if _SessionFactory is None:
        _SessionFactory = sessionmaker(bind=get_engine(), autoflush=False, future=True)
    return _SessionFactory


@contextmanager
def session_scope() -> Iterator[Session]:
    """Context manager que abre uma sessão, faz commit ao final e rollback em erro."""
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def check_connection() -> bool:
    """Testa a conexão com um `SELECT 1`."""
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error("db_connection_failed", error=str(e))
        return False


def _mask_url(url: str) -> str:
    """Remove senha da URL para logs."""
    import re

    return re.sub(r"://([^:]+):([^@]+)@", r"://\1:***@", url)
