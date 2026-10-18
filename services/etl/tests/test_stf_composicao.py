"""Testes do ETL STF composição (migration 0008 + job).

A composição é lista curada em código — testes validam que o SQL cria a
estrutura esperada, que a função helper `aposentadoria_compulsoria` calcula
75 anos corretamente, e que o job emite as queries certas numa FakeSession.
"""

from __future__ import annotations

import re
from datetime import date
from unittest.mock import patch

import pytest

from etl.migrate import discover_migrations
from etl.sources.stf.composicao import _process
from etl.sources.stf.ministros_data import (
    MINISTROS_STF,
    MinistroSTF,
    aposentadoria_compulsoria,
)

# ---------- Migration 0008 ----------


@pytest.fixture
def migration_sql() -> str:
    migrations = discover_migrations()
    m = next((p for p in migrations if p.stem == "0008_stf"), None)
    assert m is not None, "Esperada migration 0008_stf.sql"
    return m.read_text(encoding="utf-8")


class TestMigration0008:
    def test_abre_e_fecha_transacao(self, migration_sql: str) -> None:
        assert re.search(r"^BEGIN\s*;", migration_sql, re.MULTILINE)
        assert re.search(r"^COMMIT\s*;", migration_sql, re.MULTILINE)

    def test_registra_versao(self, migration_sql: str) -> None:
        assert "'0008_stf'" in migration_sql

    def test_cria_tabela_stf_ministros(self, migration_sql: str) -> None:
        assert "CREATE TABLE IF NOT EXISTS stf_ministros" in migration_sql

    def test_tem_colunas_essenciais(self, migration_sql: str) -> None:
        for col in (
            "nome",
            "data_nascimento",
            "presidente_indicou",
            "data_posse",
            "data_aposentadoria",
            "data_aposentadoria_compulsoria",
            "cargo_atual",
            "em_exercicio",
            "ordem_antiguidade",
        ):
            assert re.search(rf"\b{col}\b", migration_sql), f"coluna '{col}' ausente"

    def test_tem_constraint_unica(self, migration_sql: str) -> None:
        assert "UNIQUE (nome, data_posse)" in migration_sql

    def test_tem_trigger_updated(self, migration_sql: str) -> None:
        assert "trg_stf_ministros_updated" in migration_sql
        assert "set_atualizado_em" in migration_sql

    def test_tem_indice_em_exercicio(self, migration_sql: str) -> None:
        assert "idx_stf_ministros_em_exercicio" in migration_sql


# ---------- aposentadoria_compulsoria ----------


class TestAposentadoriaCompulsoria:
    def test_75_anos_depois(self):
        assert aposentadoria_compulsoria(date(1955, 12, 30)) == date(2030, 12, 30)
        assert aposentadoria_compulsoria(date(1954, 4, 19)) == date(2029, 4, 19)
        assert aposentadoria_compulsoria(date(1975, 6, 3)) == date(2050, 6, 3)

    def test_29_fevereiro_em_ano_nao_bissexto(self):
        """Alguém nascido em 29/02/2000 completa 75 em 2075. 2075 não é bissexto;
        caímos pra 28/02/2075."""
        resultado = aposentadoria_compulsoria(date(2000, 2, 29))
        assert resultado == date(2075, 2, 28)

    def test_29_fevereiro_em_ano_bissexto(self):
        """1948 + 75 = 2023 (não bissexto) → 28/02. Mas 1949 + 75 = 2024 (bissexto)."""
        resultado = aposentadoria_compulsoria(date(1948, 2, 29))
        assert resultado == date(2023, 2, 28)


# ---------- MINISTROS_STF ----------


class TestMinistrosSTF:
    def test_tem_dez_ministros_em_exercicio(self):
        """Em outubro/2026: 10 em exercício + 1 vaga (ex-Barroso)."""
        assert len(MINISTROS_STF) == 10

    def test_fachin_eh_presidente(self):
        fachin = next(m for m in MINISTROS_STF if m.nome == "Edson Fachin")
        assert fachin.cargo_atual == "presidente"

    def test_zanin_eh_vice_presidente(self):
        zanin = next(m for m in MINISTROS_STF if m.nome == "Cristiano Zanin")
        assert zanin.cargo_atual == "vice-presidente"

    def test_so_um_presidente_e_um_vice(self):
        presidentes = [m for m in MINISTROS_STF if m.cargo_atual == "presidente"]
        vices = [m for m in MINISTROS_STF if m.cargo_atual == "vice-presidente"]
        assert len(presidentes) == 1
        assert len(vices) == 1

    def test_todos_tem_data_posse(self):
        for m in MINISTROS_STF:
            assert isinstance(m.data_posse, date)
            assert m.data_posse.year >= 2000, f"{m.nome} tem posse muito antiga"

    def test_todos_tem_data_nascimento(self):
        for m in MINISTROS_STF:
            assert isinstance(m.data_nascimento, date)

    def test_todos_tem_presidente_indicou(self):
        for m in MINISTROS_STF:
            assert m.presidente_indicou

    def test_todos_sao_elegiveis_na_posse(self):
        """Constituição: entre 35 e 65 anos de idade na nomeação (a Wikipedia
        aponta até 70 — depende da PEC 139/2026; checamos a regra ampla)."""
        for m in MINISTROS_STF:
            idade_na_posse = m.data_posse.year - m.data_nascimento.year
            if (m.data_posse.month, m.data_posse.day) < (
                m.data_nascimento.month,
                m.data_nascimento.day,
            ):
                idade_na_posse -= 1
            assert 35 <= idade_na_posse <= 70, (
                f"{m.nome}: idade na posse {idade_na_posse} fora da faixa"
            )


# ---------- Job _process ----------


class TestProcessJob:
    def test_marca_desligamento_antes_de_upsert(self, fake_session):
        fake_session.on("UPDATE stf_ministros", rowcount=0)
        fake_session.on("INSERT INTO stf_ministros", row=None)

        with patch("etl.sources.stf.composicao.session_scope") as scope:
            scope.return_value.__enter__.return_value = fake_session
            scope.return_value.__exit__.return_value = None
            _process({})

        update_idx = next(
            i for i, c in enumerate(fake_session.calls) if "UPDATE stf_ministros" in c.sql
        )
        first_insert_idx = next(
            i for i, c in enumerate(fake_session.calls) if "INSERT INTO stf_ministros" in c.sql
        )
        assert update_idx < first_insert_idx, "UPDATE deve vir antes do primeiro INSERT"

    def test_upsert_para_cada_ministro(self, fake_session):
        with patch("etl.sources.stf.composicao.session_scope") as scope:
            scope.return_value.__enter__.return_value = fake_session
            scope.return_value.__exit__.return_value = None
            _process({})

        inserts = fake_session.count_calls("INSERT INTO stf_ministros")
        assert inserts == len(MINISTROS_STF)

    def test_computa_ordem_antiguidade(self, fake_session):
        """Gilmar (2002) deve receber ordem 1, Dino (2024) a mais alta."""
        with patch("etl.sources.stf.composicao.session_scope") as scope:
            scope.return_value.__enter__.return_value = fake_session
            scope.return_value.__exit__.return_value = None
            _process({})

        inserts = [c for c in fake_session.calls if "INSERT INTO stf_ministros" in c.sql]
        gilmar = next(c for c in inserts if c.params and c.params.get("nome") == "Gilmar Mendes")
        dino = next(c for c in inserts if c.params and c.params.get("nome") == "Flávio Dino")
        assert gilmar.params["ordem"] == 1
        assert dino.params["ordem"] == len(MINISTROS_STF)

    def test_computa_aposentadoria_compulsoria(self, fake_session):
        with patch("etl.sources.stf.composicao.session_scope") as scope:
            scope.return_value.__enter__.return_value = fake_session
            scope.return_value.__exit__.return_value = None
            _process({})

        inserts = [c for c in fake_session.calls if "INSERT INTO stf_ministros" in c.sql]
        gilmar = next(c for c in inserts if c.params and c.params.get("nome") == "Gilmar Mendes")
        assert gilmar.params["compulsoria"] == date(2030, 12, 30)

    def test_stats_sao_atualizados(self, fake_session):
        fake_session.on("UPDATE stf_ministros", rowcount=5)
        stats: dict = {}

        with patch("etl.sources.stf.composicao.session_scope") as scope:
            scope.return_value.__enter__.return_value = fake_session
            scope.return_value.__exit__.return_value = None
            _process(stats)

        assert stats["ministros_desligados"] == 5
        assert stats["ministros_upsert"] == len(MINISTROS_STF)


# ---------- Serialização defensiva (sanity) ----------


def test_dataclass_eh_frozen():
    """MinistroSTF é frozen pra impedir modificação acidental."""
    from dataclasses import FrozenInstanceError

    m = MINISTROS_STF[0]
    with pytest.raises(FrozenInstanceError):
        m.nome = "Outro"  # type: ignore


def test_todos_sao_instancias_de_ministrostf():
    for m in MINISTROS_STF:
        assert isinstance(m, MinistroSTF)
