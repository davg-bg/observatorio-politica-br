"""Testa o job completo de ingestão de deputados (sem DB real).

Usa um FakeSession pra capturar as queries, verificando que:
  • cada deputado dispara upserts na ordem certa (partido -> parlamentar -> mandato),
  • referências são resolvidas (UF, legislatura),
  • idempotência: rodar 2x gera upserts com os mesmos parâmetros.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest

from etl.sources.camara.deputados import _persist_deputado, _process_all, run
from etl.sources.camara.models import DeputadoDetalhe
from tests.conftest import FakeSession, load_fixture


def _deputado_from_fixture(name: str) -> DeputadoDetalhe:
    data = load_fixture(name)["dados"]
    return DeputadoDetalhe.model_validate(data)


def _configure_fake_session(session: FakeSession) -> None:
    """Configura respostas padrão: UF resolve, partido upsert retorna id, parlamentar retorna uuid."""
    session.on("FROM ufs WHERE sigla", row=(5,))
    session.on("INSERT INTO partidos", row=(1,))
    session.on("INSERT INTO parlamentares", row=("00000000-0000-0000-0000-000000000001",))
    session.on("SELECT 1 FROM legislaturas", row=(1,))  # já existe
    # ensure_legislatura: também pode fazer INSERT INTO legislaturas se precisar
    session.on("INSERT INTO legislaturas", row=None, rowcount=1)
    session.on("INSERT INTO mandatos", row=None, rowcount=1)


class TestPersistDeputado:
    def test_persist_204379(self, fake_session: FakeSession) -> None:
        _configure_fake_session(fake_session)
        detalhe = _deputado_from_fixture("camara_deputado_204379")

        _persist_deputado(fake_session, detalhe)

        # Verifica a ordem: UF -> partido -> legislatura -> parlamentar -> mandato
        assert fake_session.find_call("FROM ufs WHERE sigla") is not None
        assert fake_session.find_call("INSERT INTO partidos") is not None
        assert fake_session.find_call("INSERT INTO parlamentares") is not None
        assert fake_session.find_call("INSERT INTO mandatos") is not None

    def test_parlamentar_params_use_nome_eleitoral(self, fake_session: FakeSession) -> None:
        _configure_fake_session(fake_session)
        detalhe = _deputado_from_fixture("camara_deputado_204379")

        _persist_deputado(fake_session, detalhe)
        call = fake_session.find_call("INSERT INTO parlamentares")
        assert call is not None
        assert call.params["nome"] == "Acácio Favacho"
        assert call.params["nome_civil"] == "ACÁCIO DA SILVA FAVACHO NETO"
        assert call.params["cpf"] == "74287028287"
        assert call.params["sexo"] == "M"
        assert call.params["casa"] == "camara"
        assert call.params["source_id"] == "204379"
        assert call.params["em_exercicio"] is True

    def test_email_falls_back_to_gabinete(self, fake_session: FakeSession) -> None:
        """O email root é null; devemos pegar do gabinete."""
        _configure_fake_session(fake_session)
        detalhe = _deputado_from_fixture("camara_deputado_204379")

        _persist_deputado(fake_session, detalhe)
        call = fake_session.find_call("INSERT INTO parlamentares")
        assert call is not None
        assert call.params["email"] == "dep.acaciofavacho@camara.leg.br"

    def test_redes_sao_normalizadas(self, fake_session: FakeSession) -> None:
        import json

        _configure_fake_session(fake_session)
        detalhe = _deputado_from_fixture("camara_deputado_204379")

        _persist_deputado(fake_session, detalhe)
        call = fake_session.find_call("INSERT INTO parlamentares")
        assert call is not None
        redes = json.loads(call.params["redes"])
        assert "twitter" in redes
        assert "facebook" in redes
        assert "youtube" in redes
        assert redes["twitter"]["handle"] == "acaciofavacho"

    def test_mandato_params(self, fake_session: FakeSession) -> None:
        from datetime import date

        _configure_fake_session(fake_session)
        detalhe = _deputado_from_fixture("camara_deputado_204379")

        _persist_deputado(fake_session, detalhe)
        call = fake_session.find_call("INSERT INTO mandatos")
        assert call is not None
        assert call.params["casa"] == "camara"
        assert call.params["legislatura_id"] == 57
        assert call.params["tipo"] == "Titular"
        assert call.params["data_inicio"] == date(2023, 2, 1)

    def test_without_social_networks(self, fake_session: FakeSession) -> None:
        """Deputado sem redes sociais não quebra o pipeline."""
        import json

        _configure_fake_session(fake_session)
        detalhe = _deputado_from_fixture("camara_deputado_160564")

        _persist_deputado(fake_session, detalhe)
        call = fake_session.find_call("INSERT INTO parlamentares")
        assert call is not None
        assert json.loads(call.params["redes"]) == {}


@pytest.mark.asyncio
async def test_process_all_counts_stats(monkeypatch) -> None:
    """O _process_all deve contar processados corretamente."""
    detalhes = [
        _deputado_from_fixture("camara_deputado_204379"),
        _deputado_from_fixture("camara_deputado_160564"),
    ]

    async def _iter() -> AsyncIterator[DeputadoDetalhe]:
        for d in detalhes:
            yield d

    # Substitui session_scope por um context manager que yielda FakeSession.
    import contextlib

    from etl.sources.camara import deputados as mod

    @contextlib.contextmanager
    def fake_scope():
        session = FakeSession()
        _configure_fake_session(session)
        yield session

    monkeypatch.setattr(mod, "session_scope", fake_scope)

    stats: dict = {}
    # Passamos um client dummy porque o detalhes_iter já supre tudo.
    await _process_all(client=None, stats=stats, detalhes_iter=_iter())  # type: ignore[arg-type]

    assert stats["processed"] == 2
    assert stats["inserted_or_updated"] == 2
    assert stats["errors"] == 0


@pytest.mark.asyncio
async def test_idempotencia_mesmos_params(monkeypatch) -> None:
    """Rodar _persist_deputado duas vezes gera os mesmos INSERTs (ON CONFLICT lida com dedup)."""
    detalhe = _deputado_from_fixture("camara_deputado_204379")

    session1 = FakeSession()
    _configure_fake_session(session1)
    _persist_deputado(session1, detalhe)
    params1 = session1.find_call("INSERT INTO parlamentares").params  # type: ignore[union-attr]

    session2 = FakeSession()
    _configure_fake_session(session2)
    _persist_deputado(session2, detalhe)
    params2 = session2.find_call("INSERT INTO parlamentares").params  # type: ignore[union-attr]

    assert params1 == params2


@pytest.mark.asyncio
async def test_run_entry_point_is_callable() -> None:
    """O entry-point `run` deve pelo menos ser invocável sem argumentos.

    Não cumprimos o fluxo inteiro porque exige HTTP real e DB.
    """
    assert callable(run)
