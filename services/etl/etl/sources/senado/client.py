"""Cliente HTTP para a API de Dados Abertos do Senado Federal.

Base: https://legis.senado.leg.br/dadosabertos
A API retorna XML por default; pedimos JSON com Accept header.
"""

from __future__ import annotations

from typing import Any

import structlog

from etl.config import settings
from etl.http import RateLimitedClient

from .models import (
    DetalheSenador,
    ParlamentarEmExercicio,
    unwrap_list,
)

logger = structlog.get_logger(__name__)

BASE_URL = "https://legis.senado.leg.br/dadosabertos"


class SenadoClient:
    """Wrapper tipado em cima do RateLimitedClient."""

    def __init__(self, *, base_url: str = BASE_URL, rate_per_second: float | None = None) -> None:
        self._http = RateLimitedClient(
            base_url=base_url,
            rate_per_second=rate_per_second or settings.rate_limit_senado,
            timeout=settings.http_timeout,
            headers={"Accept": "application/json", "User-Agent": "observatorio-politica-br/0.1"},
        )

    async def __aenter__(self) -> SenadoClient:
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.close()

    async def close(self) -> None:
        await self._http.close()

    async def list_senadores_atuais(self) -> list[ParlamentarEmExercicio]:
        """Retorna todos os senadores em exercício (atualmente 81).

        Não há paginação neste endpoint.
        """
        raw = await self._http.get_json("/senador/lista/atual")
        return _parse_lista(raw)

    async def get_senador(self, codigo: str | int) -> DetalheSenador:
        """Busca o detalhe de um senador por código."""
        raw = await self._http.get_json(f"/senador/{codigo}")
        return _parse_detalhe(raw)


def _parse_lista(raw: dict) -> list[ParlamentarEmExercicio]:
    """Extrai e normaliza a lista do envelope `ListaParlamentarEmExercicio`."""
    envelope = raw.get("ListaParlamentarEmExercicio", {})
    parlamentares_container = envelope.get("Parlamentares", {})
    items = unwrap_list(parlamentares_container, "Parlamentar")
    return [ParlamentarEmExercicio.model_validate(item) for item in items]


def _parse_detalhe(raw: dict) -> DetalheSenador:
    """Extrai o `DetalheParlamentar.Parlamentar` e devolve DetalheSenador."""
    envelope = raw.get("DetalheParlamentar", {})
    parlamentar = envelope.get("Parlamentar", {})
    return DetalheSenador.model_validate(parlamentar)
