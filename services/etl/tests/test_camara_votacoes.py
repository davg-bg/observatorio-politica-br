"""Testa o job de votações da Câmara (sem DB real)."""

from __future__ import annotations

import pytest

from etl.sources.camara.client import BASE_URL, CamaraClient
from etl.sources.camara.votacoes import _persist_votacao, run
from etl.sources.camara.votacoes_models import (
    OrientacaoCamara,
    VotacaoResumo,
    VotoCamara,
)
from tests.conftest import FakeSession, load_fixture


def _resumo_from_fixture(idx: int = 0) -> VotacaoResumo:
    data = load_fixture("camara_votacoes_lista")["dados"][idx]
    return VotacaoResumo.model_validate(data)


def _votos_from_fixture() -> list[VotoCamara]:
    data = load_fixture("camara_votos_2236186-60")["dados"]
    return [VotoCamara.model_validate(d) for d in data]


def _orientacoes_from_fixture() -> list[OrientacaoCamara]:
    data = load_fixture("camara_orientacoes_2236186-60")["dados"]
    return [OrientacaoCamara.model_validate(d) for d in data]


def _configure_session(session: FakeSession) -> None:
    """Configura respostas padrão: proposição shell, votação, partido, parlamentar."""
    session.on("INSERT INTO proposicoes", row=("prop-uuid-1",))
    session.on("INSERT INTO votacoes", row=("vot-uuid-1",))
    session.on("INSERT INTO partidos", row=(1,))
    # resolve_parlamentar_id — devolvemos UUID pra 3 primeiros, None pro quarto
    session.on("SELECT id FROM parlamentares", row=("parl-uuid-1",))


@pytest.mark.asyncio
async def test_list_votacoes_single_page(httpx_mock) -> None:
    import re

    fixture = load_fixture("camara_votacoes_lista")
    httpx_mock.add_response(url=re.compile(r".*/votacoes\?.*"), json=fixture)

    async with CamaraClient(rate_per_second=100) as client:
        votacoes = [
            v async for v in client.list_votacoes(data_inicio="2026-09-15", data_fim="2026-10-15")
        ]

    assert len(votacoes) == 2
    assert votacoes[0].id == "2236186-60"
    assert votacoes[0].aprovacao == 0


@pytest.mark.asyncio
async def test_get_votos(httpx_mock) -> None:
    fixture = load_fixture("camara_votos_2236186-60")
    httpx_mock.add_response(url=f"{BASE_URL}/votacoes/2236186-60/votos", json=fixture)

    async with CamaraClient(rate_per_second=100) as client:
        votos = await client.get_votos("2236186-60")

    assert len(votos) == 4
    assert votos[0].tipo_voto == "Sim"
    assert votos[0].deputado.id == 220588


@pytest.mark.asyncio
async def test_get_orientacoes(httpx_mock) -> None:
    fixture = load_fixture("camara_orientacoes_2236186-60")
    httpx_mock.add_response(url=f"{BASE_URL}/votacoes/2236186-60/orientacoes", json=fixture)

    async with CamaraClient(rate_per_second=100) as client:
        orient = await client.get_orientacoes("2236186-60")

    assert len(orient) == 5
    partidarias = [o for o in orient if o.cod_tipo_lideranca == "P"]
    assert len(partidarias) == 3


class TestPersistVotacao:
    def test_counts_derived_from_votos(self, fake_session: FakeSession) -> None:
        _configure_session(fake_session)
        resumo = _resumo_from_fixture()
        votos = _votos_from_fixture()
        orientacoes: list[OrientacaoCamara] = []
        stats: dict = {
            "votacoes_processadas": 0,
            "votos_inseridos": 0,
            "orientacoes_inseridas": 0,
            "errors": 0,
            "votos_sem_parlamentar": 0,
        }

        _persist_votacao(fake_session, resumo, votos, orientacoes, stats)

        # 2 Sim, 1 Não, 1 Abstenção (com espaço, normalizado) = contagens corretas
        votacao_call = fake_session.find_call("INSERT INTO votacoes")
        assert votacao_call is not None
        assert votacao_call.params["votos_sim"] == 2
        assert votacao_call.params["votos_nao"] == 1
        assert votacao_call.params["votos_abstencao"] == 1
        assert votacao_call.params["votos_outros"] == 0

    def test_proposicao_shell_via_uri(self, fake_session: FakeSession) -> None:
        _configure_session(fake_session)
        resumo = _resumo_from_fixture()  # tem uriProposicaoObjeto
        _persist_votacao(fake_session, resumo, [], [], _blank_stats())

        prop_call = fake_session.find_call("INSERT INTO proposicoes")
        assert prop_call is not None
        assert prop_call.params["source_id"] == "2647737"

    def test_votacao_sem_proposicao(self, fake_session: FakeSession) -> None:
        """Segunda votação da fixture não tem proposicaoObjeto nem URI — proposicao_id fica NULL."""
        _configure_session(fake_session)
        resumo = _resumo_from_fixture(idx=1)
        _persist_votacao(fake_session, resumo, [], [], _blank_stats())

        assert fake_session.find_call("INSERT INTO proposicoes") is None
        votacao_call = fake_session.find_call("INSERT INTO votacoes")
        assert votacao_call is not None
        assert votacao_call.params["proposicao_id"] is None

    def test_aprovacao_bool_from_int(self, fake_session: FakeSession) -> None:
        _configure_session(fake_session)
        resumo = _resumo_from_fixture()  # aprovacao=0
        _persist_votacao(fake_session, resumo, [], [], _blank_stats())

        votacao_call = fake_session.find_call("INSERT INTO votacoes")
        assert votacao_call is not None
        assert votacao_call.params["aprovacao"] is False

    def test_voto_sem_parlamentar_registrado_e_contado(self, fake_session: FakeSession) -> None:
        """4 votos; se o resolver retornar None pra um, incrementa stats mas não quebra."""
        # Overrida resolve_parlamentar_id pra retornar None sempre (todos faltam)
        fake_session.on("INSERT INTO proposicoes", row=("prop-uuid-1",))
        fake_session.on("INSERT INTO votacoes", row=("vot-uuid-1",))
        fake_session.on("INSERT INTO partidos", row=(1,))
        fake_session.on("SELECT id FROM parlamentares", row=None)  # ninguém no banco

        stats = _blank_stats()
        resumo = _resumo_from_fixture()
        votos = _votos_from_fixture()

        _persist_votacao(fake_session, resumo, votos, [], stats)
        assert stats["votos_sem_parlamentar"] == 4
        assert stats["votos_inseridos"] == 0

    def test_orientacoes_filter_bloco_e_vazias(self, fake_session: FakeSession) -> None:
        """Orientações: tipo B ignorado, orientacao vazia ignorada; só 2 restam (PL + PT)."""
        _configure_session(fake_session)
        resumo = _resumo_from_fixture()
        stats = _blank_stats()
        _persist_votacao(fake_session, resumo, [], _orientacoes_from_fixture(), stats)

        count = fake_session.count_calls("INSERT INTO orientacoes_partidarias")
        assert count == 2  # PL=Sim, PT=Não; PDT com voto vazio não entra
        assert stats["orientacoes_inseridas"] == 2


def test_run_entry_point_is_callable() -> None:
    assert callable(run)


def _blank_stats() -> dict:
    return {
        "votacoes_processadas": 0,
        "votos_inseridos": 0,
        "orientacoes_inseridas": 0,
        "errors": 0,
        "votos_sem_parlamentar": 0,
    }
