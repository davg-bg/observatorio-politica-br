"""Smoke tests — garante que o pacote importa e o CLI responde."""

from __future__ import annotations

import pytest
from typer.testing import CliRunner

from etl import __version__
from etl.cli import app
from etl.http import RateLimiter


def test_version_is_set() -> None:
    assert __version__ == "0.1.0"


def test_cli_jobs_command() -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["jobs"])
    assert result.exit_code == 0
    assert "camara-deputados" in result.stdout
    assert "senado-senadores" in result.stdout
    assert "daily" in result.stdout


def test_cli_unknown_job() -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["run", "nao-existe"])
    assert result.exit_code == 1


@pytest.mark.asyncio
async def test_rate_limiter_respects_interval() -> None:
    """RateLimiter(rate=10) deve esperar ~100ms entre chamadas."""
    import time

    limiter = RateLimiter(rate_per_second=10.0)

    start = time.monotonic()
    await limiter.acquire()
    await limiter.acquire()
    await limiter.acquire()
    elapsed = time.monotonic() - start

    # 3 chamadas a 10/s: a primeira é imediata; as 2 seguintes esperam 100ms cada.
    # Com um pouco de folga para o scheduler, esperamos >= ~180ms.
    assert elapsed >= 0.18, f"Esperado >= 0.18s, obteve {elapsed:.3f}s"
