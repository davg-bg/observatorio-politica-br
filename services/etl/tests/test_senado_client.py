"""Testa o SenadoClient com HTTP mockado."""

from __future__ import annotations

import pytest

from etl.sources.senado.client import BASE_URL, SenadoClient
from tests.conftest import load_fixture


@pytest.mark.asyncio
async def test_list_senadores_atuais(httpx_mock) -> None:
    """Puxa a lista com 2 senadores."""
    fixture = load_fixture("senado_lista_atual")
    httpx_mock.add_response(url=f"{BASE_URL}/senador/lista/atual", json=fixture)

    async with SenadoClient(rate_per_second=100) as client:
        parlamentares = await client.list_senadores_atuais()

    assert len(parlamentares) == 2
    assert parlamentares[0].identificacao.codigo == "5672"
    assert parlamentares[0].identificacao.nome == "Alan Rick"


@pytest.mark.asyncio
async def test_get_senador_detalhe(httpx_mock) -> None:
    fixture = load_fixture("senado_detalhe_5672")
    httpx_mock.add_response(url=f"{BASE_URL}/senador/5672", json=fixture)

    async with SenadoClient(rate_per_second=100) as client:
        detalhe = await client.get_senador(5672)

    from datetime import date

    assert detalhe.identificacao.codigo == "5672"
    assert detalhe.dados_basicos is not None
    assert detalhe.dados_basicos.data_nascimento == date(1976, 10, 23)


@pytest.mark.asyncio
async def test_list_handles_single_item_response(httpx_mock) -> None:
    """A API retorna Parlamentar como objeto (não lista) quando há 1 só item."""
    fixture = load_fixture("senado_lista_single_item")
    httpx_mock.add_response(url=f"{BASE_URL}/senador/lista/atual", json=fixture)

    async with SenadoClient(rate_per_second=100) as client:
        parlamentares = await client.list_senadores_atuais()

    assert len(parlamentares) == 1
    assert parlamentares[0].identificacao.codigo == "99999"
