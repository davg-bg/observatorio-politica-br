"""Testa o parser e o job de ingestão de senadores."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest

from etl.sources.senado.client import _parse_detalhe, _parse_lista
from etl.sources.senado.models import normalize_sexo, unwrap_list
from etl.sources.senado.senadores import _persist_senador, _process_all, run
from tests.conftest import FakeSession, load_fixture


class TestNormalizeSexo:
    @pytest.mark.parametrize(
        "input,expected",
        [
            ("Masculino", "M"),
            ("masculino", "M"),
            ("Feminino", "F"),
            ("f", "F"),
            (None, None),
            ("", None),
            ("Outro", None),
        ],
    )
    def test_normalize(self, input, expected) -> None:
        assert normalize_sexo(input) == expected


class TestUnwrapList:
    def test_already_list(self) -> None:
        assert unwrap_list({"X": [1, 2]}, "X") == [1, 2]

    def test_single_object_becomes_list(self) -> None:
        assert unwrap_list({"X": {"a": 1}}, "X") == [{"a": 1}]

    def test_missing_key_returns_empty(self) -> None:
        assert unwrap_list({"other": 1}, "X") == []

    def test_none_value(self) -> None:
        assert unwrap_list({"X": None}, "X") == []


class TestParseLista:
    def test_parse_two_items(self) -> None:
        raw = load_fixture("senado_lista_atual")
        parsed = _parse_lista(raw)
        assert len(parsed) == 2
        assert parsed[0].identificacao.codigo == "5672"
        assert parsed[0].identificacao.nome == "Alan Rick"
        assert parsed[0].identificacao.sigla_partido == "REPUBLICANOS"
        assert parsed[0].identificacao.uf == "AC"
        assert parsed[0].mandato is not None
        assert parsed[0].mandato.descricao_participacao == "Titular"

    def test_parse_single_item(self) -> None:
        """Quando a lista tem 1 só, a API retorna objeto em vez de lista."""
        raw = load_fixture("senado_lista_single_item")
        parsed = _parse_lista(raw)
        assert len(parsed) == 1
        assert parsed[0].identificacao.codigo == "99999"


class TestParseDetalhe:
    def test_parse(self) -> None:
        from datetime import date

        raw = load_fixture("senado_detalhe_5672")
        parsed = _parse_detalhe(raw)
        assert parsed.identificacao.codigo == "5672"
        assert parsed.dados_basicos is not None
        assert parsed.dados_basicos.data_nascimento == date(1976, 10, 23)
        assert parsed.dados_basicos.naturalidade == "Rio Branco"


class TestLegislaturaAtual:
    def test_prefers_matching_date(self) -> None:
        """Senador com 2 legislaturas no mandato: pega a que inclui hoje."""
        raw = load_fixture("senado_lista_atual")
        parsed = _parse_lista(raw)
        alan = parsed[0]  # 2023-2027 + 2027-2031
        atual = alan.mandato.legislatura_atual  # type: ignore[union-attr]
        assert atual is not None
        # Com data atual em 2026, a legislatura atual é a primeira (2023-2027)
        from datetime import date as _d

        assert atual.data_inicio <= _d.today() <= atual.data_fim


class TestPersistSenador:
    def _configure(self, session: FakeSession) -> None:
        session.on("FROM ufs WHERE sigla", row=(5,))
        session.on("INSERT INTO partidos", row=(1,))
        session.on("INSERT INTO parlamentares", row=("00000000-0000-0000-0000-000000000002",))
        session.on("SELECT 1 FROM legislaturas", row=(1,))
        session.on("INSERT INTO legislaturas", row=None, rowcount=1)
        session.on("INSERT INTO mandatos", row=None, rowcount=1)

    def test_persist_alan_rick(self, fake_session: FakeSession) -> None:
        self._configure(fake_session)

        resumos = _parse_lista(load_fixture("senado_lista_atual"))
        detalhe = _parse_detalhe(load_fixture("senado_detalhe_5672"))
        _persist_senador(fake_session, resumos[0], detalhe)

        parl_call = fake_session.find_call("INSERT INTO parlamentares")
        assert parl_call is not None
        assert parl_call.params["casa"] == "senado"
        assert parl_call.params["source_id"] == "5672"
        assert parl_call.params["nome"] == "Alan Rick"
        assert parl_call.params["nome_civil"] == "Alan Rick Miranda"
        assert parl_call.params["sexo"] == "M"
        assert parl_call.params["email"] == "sen.alanrick@senado.leg.br"
        assert parl_call.params["em_exercicio"] is True

        mandato_call = fake_session.find_call("INSERT INTO mandatos")
        assert mandato_call is not None
        assert mandato_call.params["casa"] == "senado"
        assert mandato_call.params["legislatura_id"] == 57
        assert mandato_call.params["tipo"] == "Titular"

    def test_persist_without_detalhe(self, fake_session: FakeSession) -> None:
        """Se o detalhe falhar, ainda persistimos os dados da lista."""
        self._configure(fake_session)

        resumos = _parse_lista(load_fixture("senado_lista_atual"))
        _persist_senador(fake_session, resumos[1], detalhe=None)  # Alessandro Vieira

        parl_call = fake_session.find_call("INSERT INTO parlamentares")
        assert parl_call is not None
        assert parl_call.params["source_id"] == "5982"
        assert parl_call.params["data_nascimento"] is None  # faltou o detalhe

    def test_feminino_normaliza(self, fake_session: FakeSession) -> None:
        self._configure(fake_session)

        resumos = _parse_lista(load_fixture("senado_lista_single_item"))
        _persist_senador(fake_session, resumos[0], detalhe=None)

        parl_call = fake_session.find_call("INSERT INTO parlamentares")
        assert parl_call is not None
        assert parl_call.params["sexo"] == "F"
        assert parl_call.params["casa"] == "senado"


@pytest.mark.asyncio
async def test_process_all_counts_stats(monkeypatch) -> None:
    """O _process_all deve contar processados corretamente."""
    import contextlib

    from etl.sources.senado import senadores as mod

    resumos = _parse_lista(load_fixture("senado_lista_atual"))
    detalhe = _parse_detalhe(load_fixture("senado_detalhe_5672"))

    async def _iter() -> AsyncIterator:
        yield resumos[0], detalhe
        yield resumos[1], None  # sem detalhe, teste de fallback

    @contextlib.contextmanager
    def fake_scope():
        session = FakeSession()
        session.on("FROM ufs WHERE sigla", row=(5,))
        session.on("INSERT INTO partidos", row=(1,))
        session.on("INSERT INTO parlamentares", row=("00000000-0000-0000-0000-000000000003",))
        session.on("SELECT 1 FROM legislaturas", row=(1,))
        session.on("INSERT INTO legislaturas", row=None, rowcount=1)
        session.on("INSERT INTO mandatos", row=None, rowcount=1)
        yield session

    monkeypatch.setattr(mod, "session_scope", fake_scope)

    stats: dict = {}
    await _process_all(client=None, stats=stats, senadores_iter=_iter())  # type: ignore[arg-type]

    assert stats["processed"] == 2
    assert stats["inserted_or_updated"] == 2
    assert stats["errors"] == 0


@pytest.mark.asyncio
async def test_run_entry_point_is_callable() -> None:
    assert callable(run)
