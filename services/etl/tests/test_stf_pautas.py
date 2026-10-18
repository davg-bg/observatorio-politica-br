"""Testes do ETL STF pautas (migration 0009 + models + job)."""

from __future__ import annotations

import re
from datetime import date, datetime
from unittest.mock import AsyncMock, patch

import pytest

from etl.migrate import discover_migrations
from etl.sources.stf.models import (
    CalendarioSessao,
    IncidenteSTF,
    SessaoSTF,
    flag_sn,
)
from etl.sources.stf.pautas import _persist_calendario, _process

from .conftest import load_fixture

# ---------- Migration 0009 ----------


@pytest.fixture
def migration_sql() -> str:
    migrations = discover_migrations()
    m = next((p for p in migrations if p.stem == "0009_stf_pautas"), None)
    assert m is not None, "Esperada migration 0009_stf_pautas.sql"
    return m.read_text(encoding="utf-8")


class TestMigration0009:
    def test_abre_e_fecha_transacao(self, migration_sql: str) -> None:
        assert re.search(r"^BEGIN\s*;", migration_sql, re.MULTILINE)
        assert re.search(r"^COMMIT\s*;", migration_sql, re.MULTILINE)

    def test_registra_versao(self, migration_sql: str) -> None:
        assert "'0009_stf_pautas'" in migration_sql

    def test_cria_tabela_stf_sessoes(self, migration_sql: str) -> None:
        assert "CREATE TABLE IF NOT EXISTS stf_sessoes" in migration_sql
        for col in (
            "source_id",
            "colegiado_codigo",
            "colegiado_descricao",
            "data_inicio",
            "tipo",
            "numero",
            "ano",
            "observacao",
        ):
            assert re.search(rf"\b{col}\b", migration_sql), f"coluna '{col}' ausente"

    def test_cria_tabela_stf_pauta_processos(self, migration_sql: str) -> None:
        assert "CREATE TABLE IF NOT EXISTS stf_pauta_processos" in migration_sql
        for col in (
            "sessao_id",
            "classe",
            "numero",
            "relator",
            "destaque",
            "materia_relevante",
            "repercussao_geral",
            "resumo_tema",
        ):
            assert re.search(rf"\b{col}\b", migration_sql), f"coluna '{col}' ausente"

    def test_sessao_unique_por_source_id(self, migration_sql: str) -> None:
        assert "UNIQUE (source_id)" in migration_sql

    def test_processo_unique_por_sessao_e_source(self, migration_sql: str) -> None:
        assert "UNIQUE (sessao_id, source_id)" in migration_sql

    def test_processo_fk_cascade(self, migration_sql: str) -> None:
        assert "REFERENCES stf_sessoes(id) ON DELETE CASCADE" in migration_sql

    def test_tem_indice_de_data(self, migration_sql: str) -> None:
        assert "idx_stf_sessoes_data" in migration_sql


# ---------- flag_sn ----------


class TestFlagSN:
    def test_s_e_true(self):
        assert flag_sn("S") is True
        assert flag_sn("s") is True

    def test_n_e_false(self):
        assert flag_sn("N") is False
        assert flag_sn("n") is False

    def test_none_e_false(self):
        assert flag_sn(None) is False

    def test_vazio_e_false(self):
        assert flag_sn("") is False

    def test_outros_valores_falseiam(self):
        assert flag_sn("qualquercoisa") is False


# ---------- Models ----------


class TestSessaoSTF:
    def test_parse_data_inicio_valida(self):
        s = SessaoSTF(id="1", dataInicio="15/10/2026 14:00", tipo="E")
        dt = s.data_inicio
        assert isinstance(dt, datetime)
        assert dt.year == 2026
        assert dt.month == 10
        assert dt.day == 15
        assert dt.hour == 14
        assert dt.minute == 0

    def test_parse_data_sem_hora_funciona(self):
        s = SessaoSTF(id="1", dataInicio="15/10/2026", tipo="E")
        dt = s.data_inicio
        assert dt is not None
        assert dt.hour == 0

    def test_parse_data_invalida_retorna_none(self):
        s = SessaoSTF(id="1", dataInicio="xx/xx/xxxx", tipo="E")
        assert s.data_inicio is None

    def test_numero_ano_int(self):
        s = SessaoSTF(id="1", dataInicio="15/10/2026 14:00", tipo="E", numero="31", ano="2026")
        assert s.numero_int == 31
        assert s.ano_int == 2026

    def test_numero_ano_invalidos(self):
        s = SessaoSTF(id="1", dataInicio="15/10/2026", tipo="E", numero="N/A", ano="--")
        assert s.numero_int is None
        assert s.ano_int is None


class TestIncidenteSTF:
    def test_parse_do_fixture(self):
        inc = IncidenteSTF.model_validate(
            {
                "classe": "RE",
                "numero": "590880",
                "relator": "MIN. ELLEN GRACIE",
                "destaque": "MIN. GILMAR MENDES",
                "materiaRelevante": "S",
                "repercussaoGeral": "S",
                "idInformacaoPautaProcesso": "12352",
                "resumoTema": "Recurso...",
            }
        )
        assert inc.classe == "RE"
        assert inc.destaque == "MIN. GILMAR MENDES"
        assert inc.materia_relevante == "S"
        assert inc.repercussao_geral == "S"
        assert inc.id_informacao_pauta_processo == "12352"

    def test_ignora_campos_extras(self):
        """O schema real tem campos como 'cadeia' que a gente ignora."""
        inc = IncidenteSTF.model_validate(
            {
                "cadeia": None,
                "classe": "ADI",
                "numero": "4395",
                "idInformacaoPautaProcesso": "79023",
            }
        )
        assert inc.classe == "ADI"


class TestCalendarioSessao:
    def test_parse_do_fixture_com_sessoes(self):
        data = load_fixture("stf_calendario_15_10_2026")
        cal = CalendarioSessao.model_validate(data)
        assert cal.data == "15/10/2026"
        assert cal.tipo == "PRESENCIAL"
        assert len(cal.colegiados) == 2

        plenario = cal.colegiados[0]
        assert plenario.codigo == "TP"
        assert plenario.descricao == "Plenário"
        assert len(plenario.sessoes) == 1

        sessao = plenario.sessoes[0]
        assert sessao.id == "87059"
        assert sessao.numero_int == 31
        assert len(sessao.incidentes) == 2
        assert sessao.incidentes[0].classe == "ADI"
        assert sessao.incidentes[1].destaque == "MIN. GILMAR MENDES"

    def test_parse_do_fixture_vazio(self):
        data = load_fixture("stf_calendario_vazio")
        cal = CalendarioSessao.model_validate(data)
        assert cal.data == "20/11/2026"
        assert cal.colegiados == []


# ---------- _persist_calendario ----------


class TestPersistCalendario:
    def test_grava_sessoes_e_processos(self, fake_session):
        # Simula o RETURNING id pra cada upsert de sessão
        fake_session.on("INSERT INTO stf_sessoes", row=("uuid-sessao-1",))

        data = load_fixture("stf_calendario_15_10_2026")
        cal = CalendarioSessao.model_validate(data)
        stats = {"sessoes_upsert": 0, "processos_upsert": 0}

        with patch("etl.sources.stf.pautas.session_scope") as scope:
            scope.return_value.__enter__.return_value = fake_session
            scope.return_value.__exit__.return_value = None
            _persist_calendario(cal, stats)

        # 2 sessões (plenário + 1T), 2 processos (ambos no plenário)
        assert fake_session.count_calls("INSERT INTO stf_sessoes") == 2
        assert fake_session.count_calls("INSERT INTO stf_pauta_processos") == 2
        assert stats["sessoes_upsert"] == 2
        assert stats["processos_upsert"] == 2

    def test_params_das_sessoes_tem_colegiado_correto(self, fake_session):
        fake_session.on("INSERT INTO stf_sessoes", row=("uuid-1",))

        data = load_fixture("stf_calendario_15_10_2026")
        cal = CalendarioSessao.model_validate(data)

        with patch("etl.sources.stf.pautas.session_scope") as scope:
            scope.return_value.__enter__.return_value = fake_session
            scope.return_value.__exit__.return_value = None
            _persist_calendario(cal, {"sessoes_upsert": 0, "processos_upsert": 0})

        sessao_calls = [c for c in fake_session.calls if "INSERT INTO stf_sessoes" in c.sql]
        codigos = {c.params["codigo"] for c in sessao_calls}
        assert codigos == {"TP", "1T"}

    def test_params_flag_s_vira_true(self, fake_session):
        """RE 590880 tem materiaRelevante=S e repercussaoGeral=S."""
        fake_session.on("INSERT INTO stf_sessoes", row=("uuid-1",))

        data = load_fixture("stf_calendario_15_10_2026")
        cal = CalendarioSessao.model_validate(data)

        with patch("etl.sources.stf.pautas.session_scope") as scope:
            scope.return_value.__enter__.return_value = fake_session
            scope.return_value.__exit__.return_value = None
            _persist_calendario(cal, {"sessoes_upsert": 0, "processos_upsert": 0})

        processos = [c for c in fake_session.calls if "INSERT INTO stf_pauta_processos" in c.sql]
        re_590880 = next(c for c in processos if c.params["numero"] == "590880")
        assert re_590880.params["relevante"] is True
        assert re_590880.params["rg"] is True

        adi_4395 = next(c for c in processos if c.params["numero"] == "4395")
        assert adi_4395.params["relevante"] is False
        assert adi_4395.params["rg"] is False

    def test_sessao_sem_data_valida_e_pulada(self, fake_session):
        """Se dataInicio é inválido, a sessão não é upsertada."""
        cal = CalendarioSessao(
            data="01/01/2026",
            tipo="PRESENCIAL",
            colegiados=[
                {
                    "codigo": "TP",
                    "descricao": "Plenário",
                    "sessoes": [
                        {"id": "x", "dataInicio": "xx/xx/xxxx", "tipo": "E", "incidentes": []}
                    ],
                }
            ],
        )

        with patch("etl.sources.stf.pautas.session_scope") as scope:
            scope.return_value.__enter__.return_value = fake_session
            scope.return_value.__exit__.return_value = None
            _persist_calendario(cal, {"sessoes_upsert": 0, "processos_upsert": 0})

        assert fake_session.count_calls("INSERT INTO stf_sessoes") == 0

    def test_data_inicio_convertida_pra_utc(self, fake_session):
        """UTC-3 (Brasília) → +3h pra UTC. 14:00 BRT = 17:00 UTC."""
        fake_session.on("INSERT INTO stf_sessoes", row=("uuid-1",))

        data = load_fixture("stf_calendario_15_10_2026")
        cal = CalendarioSessao.model_validate(data)

        with patch("etl.sources.stf.pautas.session_scope") as scope:
            scope.return_value.__enter__.return_value = fake_session
            scope.return_value.__exit__.return_value = None
            _persist_calendario(cal, {"sessoes_upsert": 0, "processos_upsert": 0})

        sessao_tp = next(
            c
            for c in fake_session.calls
            if "INSERT INTO stf_sessoes" in c.sql and c.params["codigo"] == "TP"
        )
        dt = sessao_tp.params["data_inicio"]
        assert dt.hour == 17  # 14 BRT + 3h = 17 UTC
        assert dt.day == 15
        assert dt.month == 10


# ---------- _process (loop de dias) ----------


class TestProcess:
    @pytest.mark.asyncio
    async def test_pula_fim_de_semana(self, fake_session):
        """O loop deve ignorar sábados e domingos."""
        from etl.config import settings

        fake_session.on("INSERT INTO stf_sessoes", row=("uuid-1",))

        client_mock = AsyncMock()
        client_mock.get_calendario_presencial.return_value = CalendarioSessao(
            data="01/01/2026", tipo="PRESENCIAL", colegiados=[]
        )

        settings.etl_limit = 14  # 2 semanas

        with patch("etl.sources.stf.pautas.session_scope") as scope:
            scope.return_value.__enter__.return_value = fake_session
            scope.return_value.__exit__.return_value = None
            with patch("etl.sources.stf.pautas.date") as date_mock:
                # Força 'hoje' pra 2026-10-12 (segunda-feira) — determinístico
                date_mock.today.return_value = date(2026, 10, 12)
                date_mock.side_effect = lambda *a, **kw: date(*a, **kw)
                stats: dict = {}
                await _process(client_mock, stats)

        # 14 dias a partir de segunda = 10 dias úteis (não conta 2 sábados + 2 domingos)
        assert stats["dias_consultados"] == 10
        settings.etl_limit = None

    @pytest.mark.asyncio
    async def test_erros_sao_contados_e_nao_abortam(self, fake_session):
        from etl.config import settings

        client_mock = AsyncMock()
        client_mock.get_calendario_presencial.side_effect = RuntimeError("timeout")

        settings.etl_limit = 5

        with patch("etl.sources.stf.pautas.session_scope") as scope:
            scope.return_value.__enter__.return_value = fake_session
            scope.return_value.__exit__.return_value = None
            with patch("etl.sources.stf.pautas.date") as date_mock:
                date_mock.today.return_value = date(2026, 10, 12)
                date_mock.side_effect = lambda *a, **kw: date(*a, **kw)
                stats: dict = {}
                await _process(client_mock, stats)

        assert stats["errors"] > 0
        settings.etl_limit = None
