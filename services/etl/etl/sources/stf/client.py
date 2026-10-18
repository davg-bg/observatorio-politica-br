"""Cliente HTTP pro portal.stf.jus.br.

A base pública não oferece OpenAPI, mas o Vue frontend consome endpoints
JSON em `/pauta/services/*.asp`. Precisa de User-Agent de browser (o default
do httpx leva 403).
"""

from __future__ import annotations

import structlog

from etl.http import RateLimitedClient

from .models import CalendarioSessao

logger = structlog.get_logger(__name__)

BASE_URL = "https://portal.stf.jus.br"

HEADERS = {
    # Precisa parecer um browser pro firewall liberar
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://portal.stf.jus.br/pauta/pesquisarCalendario.asp",
}


class StfClient:
    """Wrapper tipado pros endpoints do portal do STF."""

    def __init__(
        self,
        *,
        base_url: str = BASE_URL,
        rate_per_second: float = 2.0,
    ) -> None:
        # Rate limit baixo porque é scraping, não API — não queremos agressivo.
        self._http = RateLimitedClient(
            base_url=base_url,
            rate_per_second=rate_per_second,
            headers=HEADERS,
            timeout=30,
        )

    async def __aenter__(self) -> StfClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self._http.close()

    async def get_calendario_presencial(self, data: str) -> CalendarioSessao:
        """Busca o calendário de sessão presencial para uma data `DD/MM/YYYY`.

        Retorna estrutura vazia (sem colegiados) se não houver sessão.
        """
        path = f"/pauta/services/calendario-service.asp?dados=sessao-presencial&data={data}"
        payload = await self._http.get_json(path)
        return CalendarioSessao.model_validate(payload)
