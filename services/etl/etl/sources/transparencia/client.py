"""Cliente HTTP para a API do Portal da Transparência.

Autenticação via header `chave-api-dados`. Rate limit conservador
(~2 req/s = 120 req/min), bem abaixo do limite oficial para não
disparar bloqueios.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import structlog

from etl.config import settings
from etl.http import RateLimitedClient

from .models import EmendaDTO

logger = structlog.get_logger(__name__)

BASE_URL = "https://api.portaldatransparencia.gov.br"


class TransparenciaClient:
    """Wrapper tipado para a API do Portal da Transparência."""

    def __init__(
        self,
        *,
        token: str | None = None,
        base_url: str = BASE_URL,
        rate_per_second: float | None = None,
    ) -> None:
        self._token = token or settings.transparencia_api_token
        if not self._token:
            raise ValueError(
                "TRANSPARENCIA_API_TOKEN não configurado. "
                "Cadastre email em https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email"
            )
        self._http = RateLimitedClient(
            base_url=base_url,
            rate_per_second=rate_per_second or settings.rate_limit_transparencia,
            timeout=settings.http_timeout,
            headers={
                "Accept": "application/json",
                "User-Agent": "observatorio-politica-br/0.1",
                "chave-api-dados": self._token,
            },
        )

    async def __aenter__(self) -> TransparenciaClient:
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.close()

    async def close(self) -> None:
        await self._http.close()

    async def list_emendas(
        self,
        *,
        ano: int,
        tipo_emenda: str | None = None,
    ) -> AsyncIterator[EmendaDTO]:
        """Itera por todas as emendas de um ano.

        A API retorna até 15 emendas por página. Vamos paginando até receber
        resposta vazia.
        """
        pagina = 1
        while True:
            params: dict[str, Any] = {"ano": ano, "pagina": pagina}
            if tipo_emenda:
                params["tipoEmenda"] = tipo_emenda

            raw = await self._http.get_json("/api-de-dados/emendas", params=params)
            if not isinstance(raw, list) or not raw:
                return

            for item in raw:
                try:
                    yield EmendaDTO.model_validate(item)
                except Exception as e:
                    logger.warning(
                        "emenda_parse_failed",
                        error=str(e),
                        codigo=item.get("codigoEmenda", "?"),
                    )

            # Se a página retornou menos itens que o max, acabou.
            if len(raw) < 15:
                return
            pagina += 1
