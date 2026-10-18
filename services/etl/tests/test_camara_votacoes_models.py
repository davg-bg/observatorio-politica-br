"""Testa helpers de normalização dos modelos de votação."""

from __future__ import annotations

import pytest

from etl.sources.camara.votacoes_models import (
    extract_source_id_from_uri,
    normalize_tipo_voto,
)


class TestNormalizeTipoVoto:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("Sim", "Sim"),
            ("sim", "Sim"),
            ("SIM", "Sim"),
            ("  Sim  ", "Sim"),
            ("Não", "Não"),
            ("Nao", "Não"),
            ("não", "Não"),
            ("Abstenção", "Abstenção"),
            ("Abstencao", "Abstenção"),
            ("Obstrução", "Obstrução"),
            ("Artigo 17", "Artigo 17"),
            ("Art. 17", "Artigo 17"),
            ("Branco", "Branco"),
            ("", "Outro"),
            (None, "Outro"),
            ("Desconhecido", "Outro"),
        ],
    )
    def test_normalize(self, raw: str | None, expected: str) -> None:
        assert normalize_tipo_voto(raw) == expected


class TestExtractSourceId:
    def test_extracts_last_segment(self) -> None:
        assert (
            extract_source_id_from_uri(
                "https://dadosabertos.camara.leg.br/api/v2/proposicoes/2647737"
            )
            == "2647737"
        )

    def test_ignores_trailing_slash(self) -> None:
        assert extract_source_id_from_uri("https://x.com/foo/42/") == "42"

    def test_handles_none(self) -> None:
        assert extract_source_id_from_uri(None) is None


class TestVotacaoResumoProposicaoObjeto:
    """Garante que `proposicaoObjeto` aceita dict/null/string (API inconsistente)."""

    def _base_payload(self) -> dict:
        return {
            "id": "123-45",
            "data": "2026-10-01",
            "dataHoraRegistro": "2026-10-01T14:00:00",
            "descricao": "Votação qualquer",
        }

    def test_aceita_dict(self):
        from etl.sources.camara.votacoes_models import VotacaoResumo

        payload = self._base_payload()
        payload["proposicaoObjeto"] = {"id": 42, "siglaTipo": "PL"}
        v = VotacaoResumo.model_validate(payload)
        assert v.proposicao_objeto == {"id": 42, "siglaTipo": "PL"}

    def test_aceita_none(self):
        from etl.sources.camara.votacoes_models import VotacaoResumo

        v = VotacaoResumo.model_validate(self._base_payload())
        assert v.proposicao_objeto is None

    def test_string_inline_vira_none(self):
        """API às vezes retorna texto puro (ex: 'REQ 25/2026 CEXEXPLO')."""
        from etl.sources.camara.votacoes_models import VotacaoResumo

        payload = self._base_payload()
        payload["proposicaoObjeto"] = "REQ 25/2026 CEXEXPLO"
        v = VotacaoResumo.model_validate(payload)
        assert v.proposicao_objeto is None
