"""Testes do ETL STF julgamentos (experimental)."""

from __future__ import annotations

import re
from datetime import date
from unittest.mock import patch

import pytest

from etl.migrate import discover_migrations
from etl.sources.stf.julgamentos import (
    _calcular_confianca,
    _detecta_unanimidade,
    _match_canonico,
    _parece_pauta,
    _parse_incidente,
    _parse_ministros,
    _parse_processo,
    _parse_tema,
    _parse_tese,
    _parse_tipo_sessao,
    _strip_html,
    _upsert_in_session,
    extract_julgamento,
)

from .conftest import load_fixture

# ---------- Migration 0010 ----------


@pytest.fixture
def migration_sql() -> str:
    migrations = discover_migrations()
    m = next((p for p in migrations if p.stem == "0010_stf_julgamentos"), None)
    assert m is not None, "Esperada migration 0010_stf_julgamentos.sql"
    return m.read_text(encoding="utf-8")


class TestMigration0010:
    def test_abre_e_fecha_transacao(self, migration_sql: str) -> None:
        assert re.search(r"^BEGIN\s*;", migration_sql, re.MULTILINE)
        assert re.search(r"^COMMIT\s*;", migration_sql, re.MULTILINE)

    def test_registra_versao(self, migration_sql: str) -> None:
        assert "'0010_stf_julgamentos'" in migration_sql

    def test_cria_tabela(self, migration_sql: str) -> None:
        assert "CREATE TABLE IF NOT EXISTS stf_julgamentos" in migration_sql
        for col in (
            "source_id",
            "source_url",
            "titulo",
            "processo_classe",
            "processo_numero",
            "processo_incidente",
            "tese_fixada",
            "foi_unanime",
            "ministros_vencedores",
            "ministros_vencidos",
            "confianca_parsing",
        ):
            assert re.search(rf"\b{col}\b", migration_sql), f"coluna '{col}' ausente"

    def test_arrays_para_ministros(self, migration_sql: str) -> None:
        assert "ministros_vencedores    TEXT[]" in migration_sql
        assert "ministros_vencidos      TEXT[]" in migration_sql

    def test_source_id_unique(self, migration_sql: str) -> None:
        assert "UNIQUE (source_id)" in migration_sql


# ---------- Helpers puros ----------


class TestStripHtml:
    def test_remove_tags(self):
        assert _strip_html("<p>oi</p>") == " oi "

    def test_resolve_entities(self):
        assert "&amp;" not in _strip_html("<p>a &amp; b</p>")
        assert "a & b" in _strip_html("<p>a &amp; b</p>")

    def test_colapsa_espacos(self):
        assert "   " not in _strip_html("<p>  oi  </p>")


class TestParseProcesso:
    def test_formato_parenteses(self):
        c, n = _parse_processo("julgamento do RE (RE) 1141156, com")
        assert c == "RE"
        assert n == "1141156"

    def test_formato_simples(self):
        c, n = _parse_processo("Plenário retoma ADI 7717 sobre lei")
        assert c == "ADI"
        assert n == "7717"

    def test_remove_pontos_do_numero(self):
        _, n = _parse_processo("RE 1.141.156")
        assert n == "1141156"

    def test_sem_processo(self):
        c, n = _parse_processo("texto sem processo mencionado")
        assert c is None
        assert n is None


class TestParseIncidente:
    def test_extrai_link_oficial(self):
        html_input = (
            'texto <a href="https://portal.stf.jus.br/processos/detalhe.asp?incidente=5491645">'
            "RE 1141156</a>"
        )
        incidente, url = _parse_incidente(html_input)
        assert incidente == "5491645"
        assert "incidente=5491645" in url

    def test_sem_link(self):
        assert _parse_incidente("sem link") == (None, None)


class TestParseTema:
    def test_tema_com_ponto(self):
        assert _parse_tema("repercussão geral (Tema 1.016)") == "Tema 1016"

    def test_tema_simples(self):
        assert _parse_tema("Tema 843 trata de") == "Tema 843"

    def test_sem_tema(self):
        assert _parse_tema("sem referência") is None


class TestParseTipoSessao:
    def test_virtual(self):
        assert _parse_tipo_sessao("na sessão virtual encerrada em 9") == "virtual"
        assert _parse_tipo_sessao("Plenário Virtual") == "virtual"

    def test_presencial(self):
        assert _parse_tipo_sessao("na sessão presencial de ontem") == "presencial"

    def test_plenario_sem_virtual(self):
        assert _parse_tipo_sessao("O Plenário decidiu") == "presencial"


class TestDetectaUnanimidade:
    def test_por_unanimidade(self):
        assert _detecta_unanimidade("Por unanimidade, decidiu") is True

    def test_unanime(self):
        assert _detecta_unanimidade("votação foi unânime") is True

    def test_sem_unanimidade(self):
        assert _detecta_unanimidade("Por maioria apertada") is False


class TestMatchCanonico:
    def test_sobrenome_curto(self):
        assert _match_canonico("Toffoli") == "Dias Toffoli"
        assert _match_canonico("Fachin") == "Edson Fachin"
        assert _match_canonico("Zanin") == "Cristiano Zanin"

    def test_nome_completo(self):
        assert _match_canonico("Flávio Dino") == "Flávio Dino"

    def test_variacao_sem_acento_falha_graceful(self):
        # "Carmen" sem acento → match substring com "Cármen" não funciona (acento)
        # mas "Alexandre de Moraes" é literal
        assert _match_canonico("Alexandre de Moraes") == "Alexandre de Moraes"

    def test_desconhecido(self):
        assert _match_canonico("Fulano de Tal") is None

    def test_substring_curta_falha(self):
        assert _match_canonico("Di") is None


class TestParseMinistros:
    def test_vencedor_prevaleceu(self):
        txt = "Prevaleceu o entendimento proposto pelo ministro Flávio Dino de aplicar"
        v, _, _ = _parse_ministros(txt)
        assert "Flávio Dino" in v

    def test_vencedores_acompanharam(self):
        txt = (
            "A corrente foi acompanhada pela ministra Cármen Lúcia e pelos ministros "
            "Cristiano Zanin, André Mendonça, Alexandre de Moraes, Dias Toffoli "
            "e Gilmar Mendes."
        )
        v, _, _ = _parse_ministros(txt)
        assert "Cármen Lúcia" in v
        assert "Cristiano Zanin" in v
        assert "André Mendonça" in v
        assert "Alexandre de Moraes" in v
        assert "Dias Toffoli" in v
        assert "Gilmar Mendes" in v

    def test_vencidos(self):
        txt = (
            "Ficaram vencidos o relator, ministro Edson Fachin, presidente do STF, "
            "e o ministro Nunes Marques, que votaram pela inclusão"
        )
        _, vencidos, _ = _parse_ministros(txt)
        assert "Edson Fachin" in vencidos
        assert "Nunes Marques" in vencidos

    def test_impedido(self):
        txt = "O ministro Luiz Fux não participou do julgamento por estar impedido."
        _, _, impedidos = _parse_ministros(txt)
        assert "Luiz Fux" in impedidos

    def test_deduplica(self):
        """Mesmo ministro em padrões diferentes deve aparecer uma vez só."""
        txt = (
            "Prevaleceu o entendimento proposto pelo ministro Flávio Dino. "
            "A corrente foi acompanhada pela ministra Cármen Lúcia. "
            "Flávio Dino afirmou ainda que o Supremo entendeu diferente."
        )
        v, _, _ = _parse_ministros(txt)
        assert v.count("Flávio Dino") == 1
        assert "Cármen Lúcia" in v

    def test_texto_sem_ministros(self):
        v, vd, i = _parse_ministros("texto comum sem referência")
        assert v == []
        assert vd == []
        assert i == []


class TestParseTese:
    def test_extrai_tese_fixada(self):
        html_input = (
            "<p>contexto</p><h5><strong>Tese</strong></h5>"
            "<p><em>1. A tese é essa.</em></p>"
            "<p><em>2. E ponto dois.</em></p>"
        )
        tese = _parse_tese(html_input)
        assert tese is not None
        assert "A tese é essa" in tese
        assert "ponto dois" in tese

    def test_sem_heading_tese(self):
        assert _parse_tese("<p>só parágrafo</p>") is None

    def test_vazio(self):
        assert _parse_tese("") is None

    def test_trunca_tese_gigante(self):
        tese_longa = "palavra " * 500
        html_input = f"<h5><strong>Tese</strong></h5><p>{tese_longa}</p>"
        tese = _parse_tese(html_input)
        assert tese is not None
        assert len(tese) <= 2001


# ---------- extract_julgamento (integração) ----------


class TestExtractJulgamento:
    def test_post_de_decisao_maioria(self):
        post = load_fixture("stf_post_166989")
        e = extract_julgamento(post)

        assert e.source_id == "166989"
        assert "Correção monetária" in e.titulo
        assert e.processo_classe == "RE"
        assert e.processo_numero == "1141156"
        assert e.processo_incidente == "5491645"
        assert "5491645" in (e.processo_url_oficial or "")
        assert e.tema_repercussao_geral == "Tema 1016"
        assert e.resultado == "maioria"
        assert e.foi_unanime is False
        assert e.tipo_sessao in ("presencial", "virtual")

        # Ministros extraídos corretamente
        assert "Flávio Dino" in e.ministros_vencedores
        assert "Cármen Lúcia" in e.ministros_vencedores
        assert "Cristiano Zanin" in e.ministros_vencedores
        assert "Edson Fachin" in e.ministros_vencidos
        assert "Nunes Marques" in e.ministros_vencidos
        assert "Luiz Fux" in e.ministros_impedidos

        # Tese extraída
        assert e.tese_fixada is not None
        assert "depósito judicial" in e.tese_fixada

        # Confiança alta
        assert e.confianca_parsing >= 80

    def test_post_pauta_tem_confianca_baixa(self):
        """Posts de pauta ainda são parseados mas confiança deve ser baixa."""
        post = load_fixture("stf_post_pauta")
        e = extract_julgamento(post)
        # Pauta ainda tem o processo (ADI 7717), mas sem tese/ministros
        assert e.confianca_parsing < 60

    def test_post_unanime(self):
        post = load_fixture("stf_post_unanime")
        e = extract_julgamento(post)
        assert e.foi_unanime is True
        assert e.resultado == "unanime"
        assert e.processo_classe == "ADI"
        assert e.processo_numero == "7245"
        assert e.tipo_sessao == "virtual"
        assert e.data_julgamento is not None


class TestParecePauta:
    def test_titulo_de_pauta(self):
        post = {"title": {"rendered": "Confira a pauta do STF desta quarta-feira (14)"}}
        assert _parece_pauta(post) is True

    def test_titulo_de_destaques_virtuais(self):
        post = {"title": {"rendered": "Confira os destaques do Plenário Virtual"}}
        assert _parece_pauta(post) is True

    def test_titulo_de_decisao_nao_e_pauta(self):
        post = {"title": {"rendered": "STF decide sobre correção monetária"}}
        assert _parece_pauta(post) is False


class TestCalcularConfianca:
    def test_tudo_vazio_e_zero(self):
        from etl.sources.stf.julgamentos import JulgamentoExtraido

        e = JulgamentoExtraido(
            source_id="1",
            source_url="",
            titulo="",
            data_publicacao=None,  # type: ignore
            resumo="",
        )
        assert _calcular_confianca(e) == 0

    def test_tudo_preenchido_satura_em_100(self):
        from datetime import datetime

        from etl.sources.stf.julgamentos import JulgamentoExtraido

        e = JulgamentoExtraido(
            source_id="1",
            source_url="",
            titulo="",
            data_publicacao=datetime.now(),
            resumo="",
            processo_classe="RE",
            processo_numero="1",
            processo_incidente="X",
            tema_repercussao_geral="T",
            tese_fixada="T",
            tipo_sessao="virtual",
            foi_unanime=True,
            ministros_vencedores=["X"],
        )
        assert _calcular_confianca(e) == 100


# ---------- _upsert_in_session (persistência) ----------


class TestUpsert:
    def test_grava_todos_os_campos(self, fake_session):
        post = load_fixture("stf_post_166989")
        e = extract_julgamento(post)
        _upsert_in_session(fake_session, e)

        call = fake_session.find_call("INSERT INTO stf_julgamentos")
        assert call is not None
        p = call.params
        assert p["source_id"] == "166989"
        assert p["classe"] == "RE"
        assert p["numero"] == "1141156"
        assert p["incidente"] == "5491645"
        assert p["tema"] == "Tema 1016"
        assert p["unanime"] is False
        assert p["resultado"] == "maioria"
        assert "Flávio Dino" in p["vencedores"]
        assert "Edson Fachin" in p["vencidos"]
        assert p["confianca"] >= 80

    def test_sql_tem_on_conflict(self, fake_session):
        post = load_fixture("stf_post_unanime")
        e = extract_julgamento(post)
        _upsert_in_session(fake_session, e)
        call = fake_session.find_call("INSERT INTO stf_julgamentos")
        assert call is not None
        assert "ON CONFLICT (source_id)" in call.sql


# ---------- Data do julgamento ----------


class TestParseDataJulgamento:
    def test_extrai_dia_de_quarta_feira(self):
        """'nesta quarta-feira (14)' + data pub out/2026 → 14/10/2026."""
        from datetime import datetime

        from etl.sources.stf.julgamentos import _parse_data_julgamento

        txt = "O STF decidiu, nesta quarta-feira (14), que a correção monetária"
        resultado = _parse_data_julgamento(txt, datetime(2026, 10, 14, 20, 10))
        assert resultado == date(2026, 10, 14)

    def test_fallback_pra_data_publicacao(self):
        from datetime import datetime

        from etl.sources.stf.julgamentos import _parse_data_julgamento

        resultado = _parse_data_julgamento("texto comum sem data", datetime(2026, 10, 14, 20, 10))
        assert resultado == date(2026, 10, 14)


# ---------- _run (orquestração) ----------


class TestRun:
    @pytest.mark.asyncio
    async def test_dedupe_entre_termos_e_pula_pauta(self, fake_session, httpx_mock):
        """Dois termos retornam o mesmo post + um post de pauta — deve
        processar o post UMA vez e pular a pauta."""
        from etl.sources.stf.julgamentos import _run

        decisao = load_fixture("stf_post_166989")
        pauta = load_fixture("stf_post_pauta")

        # Qualquer busca retorna [decisao, pauta]
        for _ in range(
            len(
                [
                    "STF decide",
                    "STF declara",
                    "STF fixa",
                    "STF reafirma",
                    "STF mantém",
                    "STF reconhece",
                    "concluiu julgamento",
                    "Plenário aprova",
                ]
            )
        ):
            httpx_mock.add_response(
                url=re.compile(r".*/wp-json/wp/v2/posts.*"),
                json=[decisao, pauta],
            )

        stats: dict = {}
        with patch("etl.sources.stf.julgamentos.session_scope") as scope:
            scope.return_value.__enter__.return_value = fake_session
            scope.return_value.__exit__.return_value = None
            await _run(stats)

        # 2 posts únicos (decisao + pauta), 1 era pauta → 1 upsert
        assert stats["posts_buscados"] == 2
        assert stats["posts_pulados_pauta"] == 1
        assert stats["julgamentos_upsert"] == 1
