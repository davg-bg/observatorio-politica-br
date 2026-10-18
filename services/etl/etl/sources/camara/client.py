"""Cliente HTTP para a API de Dados Abertos da Câmara dos Deputados.

Base: https://dadosabertos.camara.leg.br/api/v2
Sem autenticação. JSON via header Accept.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import structlog

from etl.config import settings
from etl.http import RateLimitedClient

from .models import DeputadoDetalhe, DeputadoResumo, DetailResponse, ListResponse
from .votacoes_models import OrientacaoCamara, VotacaoResumo, VotoCamara

logger = structlog.get_logger(__name__)

BASE_URL = "https://dadosabertos.camara.leg.br/api/v2"


class CamaraClient:
    """Wrapper tipado em cima do RateLimitedClient."""

    def __init__(self, *, base_url: str = BASE_URL, rate_per_second: float | None = None) -> None:
        self._http = RateLimitedClient(
            base_url=base_url,
            rate_per_second=rate_per_second or settings.rate_limit_camara,
            timeout=settings.http_timeout,
            headers={"Accept": "application/json", "User-Agent": "observatorio-politica-br/0.1"},
        )

    async def __aenter__(self) -> CamaraClient:
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.close()

    async def close(self) -> None:
        await self._http.close()

    async def list_deputados(
        self,
        *,
        items_per_page: int = 100,
        id_legislatura: int | None = None,
    ) -> AsyncIterator[DeputadoResumo]:
        """Itera pelos deputados em exercício (paginado).

        Por padrão a API retorna só os em exercício. Para pegar o histórico
        completo de uma legislatura, passe `id_legislatura`.
        """
        pagina = 1
        while True:
            params: dict[str, Any] = {
                "itens": items_per_page,
                "pagina": pagina,
                "ordem": "ASC",
                "ordenarPor": "nome",
            }
            if id_legislatura is not None:
                params["idLegislatura"] = id_legislatura

            raw = await self._http.get_json("/deputados", params=params)
            envelope = ListResponse.model_validate(raw)

            if not envelope.dados:
                return

            for item in envelope.dados:
                yield DeputadoResumo.model_validate(item)

            # Para por checagem explícita do link "next". Se não existe, acabou.
            has_next = any(link.get("rel") == "next" for link in envelope.links)
            if not has_next:
                return
            pagina += 1

    async def get_deputado(self, deputado_id: int) -> DeputadoDetalhe:
        """Busca o detalhe completo de um deputado."""
        raw = await self._http.get_json(f"/deputados/{deputado_id}")
        envelope = DetailResponse.model_validate(raw)
        return DeputadoDetalhe.model_validate(envelope.dados)

    # ------------------------------------------------------------------
    # Votações
    # ------------------------------------------------------------------
    async def list_votacoes(
        self,
        *,
        data_inicio: str,
        data_fim: str,
        items_per_page: int = 100,
    ) -> AsyncIterator[VotacaoResumo]:
        """Itera pelas votações num intervalo de datas (paginado).

        `data_inicio` e `data_fim` em formato ISO (YYYY-MM-DD).
        """
        pagina = 1
        while True:
            params: dict[str, Any] = {
                "dataInicio": data_inicio,
                "dataFim": data_fim,
                "itens": items_per_page,
                "pagina": pagina,
                "ordem": "DESC",
            }
            raw = await self._http.get_json("/votacoes", params=params)
            envelope = ListResponse.model_validate(raw)

            if not envelope.dados:
                return
            for item in envelope.dados:
                yield VotacaoResumo.model_validate(item)

            has_next = any(link.get("rel") == "next" for link in envelope.links)
            if not has_next:
                return
            pagina += 1

    async def get_votacao(self, votacao_id: str) -> dict:
        """Busca detalhes de uma votação específica. Retorna dict cru porque
        os campos variam demais entre tipos de votação."""
        raw = await self._http.get_json(f"/votacoes/{votacao_id}")
        envelope = DetailResponse.model_validate(raw)
        return envelope.dados

    async def get_votos(self, votacao_id: str) -> list[VotoCamara]:
        """Retorna todos os votos individuais da votação.

        A API retorna tudo numa resposta — sem paginação explícita.
        """
        raw = await self._http.get_json(f"/votacoes/{votacao_id}/votos")
        envelope = ListResponse.model_validate(raw)
        return [VotoCamara.model_validate(item) for item in envelope.dados]

    async def get_orientacoes(self, votacao_id: str) -> list[OrientacaoCamara]:
        """Orientações partidárias (líderes) para a votação."""
        raw = await self._http.get_json(f"/votacoes/{votacao_id}/orientacoes")
        envelope = ListResponse.model_validate(raw)
        return [OrientacaoCamara.model_validate(item) for item in envelope.dados]

    async def get_proposicao(self, proposicao_id: str) -> dict:
        """Busca detalhes de uma proposição (dict cru)."""
        raw = await self._http.get_json(f"/proposicoes/{proposicao_id}")
        envelope = DetailResponse.model_validate(raw)
        return envelope.dados

    async def get_tramitacoes(self, proposicao_id: str) -> list[dict]:
        """Lista as tramitações de uma proposição em ordem cronológica."""
        raw = await self._http.get_json(f"/proposicoes/{proposicao_id}/tramitacoes")
        envelope = ListResponse.model_validate(raw)
        return list(envelope.dados)

    async def get_temas_proposicao(self, proposicao_id: str) -> list[dict]:
        """Lista os temas associados a uma proposição."""
        raw = await self._http.get_json(f"/proposicoes/{proposicao_id}/temas")
        envelope = ListResponse.model_validate(raw)
        return list(envelope.dados)

    async def get_autores_proposicao(self, proposicao_id: str) -> list[dict]:
        """Lista os autores de uma proposição."""
        raw = await self._http.get_json(f"/proposicoes/{proposicao_id}/autores")
        envelope = ListResponse.model_validate(raw)
        return list(envelope.dados)
