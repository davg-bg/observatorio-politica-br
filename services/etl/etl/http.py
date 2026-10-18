"""Cliente HTTP compartilhado com rate limit e retry.

Garante que todas as requisições a APIs externas respeitem um ritmo
baixo (≤ 10 req/s por padrão) e lidem com erros transitórios (429, 5xx).
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any

import httpx
import structlog
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

logger = structlog.get_logger(__name__)


class TransientHTTPError(Exception):
    """Erro HTTP transitório — vale a pena retentar."""


@dataclass
class RateLimiter:
    """Rate limiter simples baseado em "min interval entre chamadas".

    Para 10 req/s, min_interval = 0.1s.
    """

    rate_per_second: float
    _last_call: float = field(default=0.0, init=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, init=False)

    @property
    def min_interval(self) -> float:
        return 1.0 / self.rate_per_second if self.rate_per_second > 0 else 0.0

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            wait = self._last_call + self.min_interval - now
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_call = time.monotonic()


class RateLimitedClient:
    """Wrapper em httpx.AsyncClient com rate limit e retry exponencial.

    Uso:
        async with RateLimitedClient(base_url="https://api.exemplo.com", rate_per_second=10) as client:
            data = await client.get_json("/recurso")
    """

    def __init__(
        self,
        *,
        base_url: str,
        rate_per_second: float = 10.0,
        timeout: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.base_url = base_url
        self.limiter = RateLimiter(rate_per_second=rate_per_second)
        self._client = httpx.AsyncClient(
            base_url=base_url,
            timeout=timeout,
            headers=headers or {},
            follow_redirects=True,
        )
        self._log = logger.bind(client=base_url)

    async def __aenter__(self) -> RateLimitedClient:
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.close()

    async def close(self) -> None:
        await self._client.aclose()

    async def _request_with_retry(
        self,
        method: str,
        path: str,
        **kwargs: Any,
    ) -> httpx.Response:
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(5),
            wait=wait_exponential(multiplier=1, min=1, max=30),
            retry=retry_if_exception_type((TransientHTTPError, httpx.TimeoutException)),
            reraise=True,
        ):
            with attempt:
                await self.limiter.acquire()
                response = await self._client.request(method, path, **kwargs)
                if response.status_code == 429 or response.status_code >= 500:
                    self._log.warning(
                        "transient_http_error",
                        method=method,
                        path=path,
                        status=response.status_code,
                        attempt=attempt.retry_state.attempt_number,
                    )
                    raise TransientHTTPError(f"HTTP {response.status_code} em {method} {path}")
                response.raise_for_status()
                return response
        # unreachable; AsyncRetrying raises on exhaustion
        raise RuntimeError("retry loop terminated unexpectedly")

    async def get_json(self, path: str, **kwargs: Any) -> dict[str, Any]:
        response = await self._request_with_retry("GET", path, **kwargs)
        return response.json()

    async def get_text(self, path: str, **kwargs: Any) -> str:
        response = await self._request_with_retry("GET", path, **kwargs)
        return response.text

    async def get_bytes(self, path: str, **kwargs: Any) -> bytes:
        response = await self._request_with_retry("GET", path, **kwargs)
        return response.content
