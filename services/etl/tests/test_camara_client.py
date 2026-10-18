"""Testa o CamaraClient com HTTP mockado (pytest-httpx)."""

from __future__ import annotations

import pytest

from etl.sources.camara.client import BASE_URL, CamaraClient
from tests.conftest import load_fixture


@pytest.mark.asyncio
async def test_list_deputados_single_page(httpx_mock) -> None:
    """Quando não há link 'next', o iterador para após a primeira página."""
    fixture = load_fixture("camara_deputados_pagina1")
    httpx_mock.add_response(
        url=f"{BASE_URL}/deputados?itens=100&pagina=1&ordem=ASC&ordenarPor=nome",
        json=fixture,
    )

    async with CamaraClient(rate_per_second=100) as client:
        deputados = [d async for d in client.list_deputados()]

    assert len(deputados) == 2
    assert deputados[0].id == 204379
    assert deputados[0].sigla_partido == "MDB"
    assert deputados[1].sigla_partido == "PT"


@pytest.mark.asyncio
async def test_list_deputados_follows_next_link(httpx_mock) -> None:
    """Com link 'next', busca a próxima página até esgotar."""
    import re

    page1 = {
        "dados": [
            {"id": 1, "nome": "A", "siglaPartido": "PT", "siglaUf": "SP", "idLegislatura": 57}
        ],
        "links": [{"rel": "next", "href": "..."}],
    }
    page2 = {
        "dados": [
            {"id": 2, "nome": "B", "siglaPartido": "PL", "siglaUf": "RJ", "idLegislatura": 57}
        ],
        "links": [],
    }
    httpx_mock.add_response(url=re.compile(r".*pagina=1.*"), json=page1)
    httpx_mock.add_response(url=re.compile(r".*pagina=2.*"), json=page2)

    async with CamaraClient(rate_per_second=100) as client:
        deputados = [d async for d in client.list_deputados(items_per_page=1)]

    assert [d.id for d in deputados] == [1, 2]


@pytest.mark.asyncio
async def test_get_deputado(httpx_mock) -> None:
    """GET /deputados/{id} retorna um DeputadoDetalhe tipado."""
    fixture = load_fixture("camara_deputado_204379")
    httpx_mock.add_response(url=f"{BASE_URL}/deputados/204379", json=fixture)

    async with CamaraClient(rate_per_second=100) as client:
        detalhe = await client.get_deputado(204379)

    assert detalhe.id == 204379
    assert detalhe.cpf == "74287028287"
    assert detalhe.ultimo_status.sigla_partido == "MDB"
    assert detalhe.ultimo_status.sigla_uf == "AP"
    assert detalhe.ultimo_status.situacao == "Exercício"
    assert detalhe.ultimo_status.gabinete is not None
    assert detalhe.ultimo_status.gabinete.email == "dep.acaciofavacho@camara.leg.br"
    assert len(detalhe.rede_social) == 3
