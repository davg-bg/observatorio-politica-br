"""Fixtures compartilhadas: fake session SQLAlchemy + loader de fixtures JSON."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> Any:
    """Carrega uma fixture JSON pelo nome (sem extensão)."""
    path = FIXTURES_DIR / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8"))


@dataclass
class RecordedCall:
    """Representa uma chamada a session.execute(stmt, params)."""

    sql: str
    params: dict[str, Any] | None


@dataclass
class FakeResult:
    """Resultado configurado para uma call. Simula .fetchone()/.rowcount/__iter__."""

    row: tuple | None = None
    rows: list[tuple] = field(default_factory=list)
    rowcount: int = 0

    def fetchone(self) -> tuple | None:
        return self.row

    def fetchall(self) -> list[tuple]:
        return list(self.rows)

    def __iter__(self):
        return iter(self.rows)


class FakeSession:
    """Captura chamadas a .execute() e devolve resultados pré-configurados.

    Uso:
        s = FakeSession()
        s.on("INSERT INTO partidos", row=(42,))
        s.on("INSERT INTO parlamentares", row=("uuid-123",))
        # ... depois, inspecione s.calls
    """

    def __init__(self) -> None:
        self.calls: list[RecordedCall] = []
        self._responses: list[tuple[str, FakeResult]] = []
        self._default = FakeResult()
        self.committed = False
        self.rolled_back = False
        self.closed = False

    def on(
        self,
        sql_contains: str,
        *,
        row: tuple | None = None,
        rows: list[tuple] | None = None,
        rowcount: int = 1,
    ) -> None:
        """Registra que, quando uma SQL contendo esse substring for executada,
        o resultado será o especificado."""
        self._responses.append(
            (sql_contains, FakeResult(row=row, rows=rows or [], rowcount=rowcount))
        )

    def execute(self, stmt: Any, params: dict | None = None) -> FakeResult:
        sql = str(stmt)
        self.calls.append(RecordedCall(sql=sql, params=params))
        for marker, result in self._responses:
            if marker in sql:
                return result
        return self._default

    def commit(self) -> None:
        self.committed = True

    def rollback(self) -> None:
        self.rolled_back = True

    def close(self) -> None:
        self.closed = True

    def find_call(self, sql_contains: str) -> RecordedCall | None:
        for call in self.calls:
            if sql_contains in call.sql:
                return call
        return None

    def count_calls(self, sql_contains: str) -> int:
        return sum(1 for c in self.calls if sql_contains in c.sql)


@pytest.fixture
def fake_session() -> FakeSession:
    """Session SQLAlchemy fake pra testar lógica de upsert sem Postgres."""
    return FakeSession()
