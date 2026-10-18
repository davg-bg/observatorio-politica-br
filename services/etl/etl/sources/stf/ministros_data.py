"""Composição atual do Supremo Tribunal Federal (STF).

A API/portal do STF não oferece endpoint estável listando a composição.
Mantemos a lista aqui, versionada no código, e atualizamos quando houver
posse ou aposentadoria.

**Como atualizar**:
    1. Edite `MINISTROS_STF` abaixo.
    2. Rode `etl run stf-composicao` (local ou via workflow) pra sincronizar.
    3. Commit.

Fontes de referência:
    - https://portal.stf.jus.br/ostf/ministros/ministro.asp?periodo=STF
    - https://pt.wikipedia.org/wiki/Supremo_Tribunal_Federal

Última atualização manual: outubro de 2026.
Estado: 10 ministros em exercício + 1 vaga (Barroso aposentou em 16/10/2025;
indicação de Jorge Messias rejeitada pelo Senado em abril/2026 — vaga aberta).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class MinistroSTF:
    nome: str
    nome_completo: str
    data_nascimento: date
    local_nascimento: str
    presidente_indicou: str
    partido_indicacao: str | None
    data_posse: date
    cargo_atual: str | None = None  # "presidente", "vice-presidente" ou None
    formacao_academica: str | None = None
    em_exercicio: bool = True


# ------------------------------------------------------------
# Ministros em exercício (ordem decrescente de antiguidade)
# ------------------------------------------------------------
# `ordem_antiguidade` é computada no ETL com base em data_posse ascendente.

MINISTROS_STF: list[MinistroSTF] = [
    MinistroSTF(
        nome="Gilmar Mendes",
        nome_completo="Gilmar Ferreira Mendes",
        data_nascimento=date(1955, 12, 30),
        local_nascimento="Diamantino, MT",
        presidente_indicou="Fernando Henrique Cardoso",
        partido_indicacao="PSDB",
        data_posse=date(2002, 6, 20),
        formacao_academica=(
            "Graduação e mestrado em Direito pela UnB; "
            "mestrado e doutorado em Direito pela Universidade de Münster (Alemanha)."
        ),
    ),
    MinistroSTF(
        nome="Cármen Lúcia",
        nome_completo="Cármen Lúcia Antunes Rocha",
        data_nascimento=date(1954, 4, 19),
        local_nascimento="Montes Claros, MG",
        presidente_indicou="Luiz Inácio Lula da Silva",
        partido_indicacao="PT",
        data_posse=date(2006, 6, 21),
        formacao_academica=(
            "Graduação em Direito pela PUC Minas; mestrado em Direito Constitucional pela UFMG."
        ),
    ),
    MinistroSTF(
        nome="Dias Toffoli",
        nome_completo="José Antonio Dias Toffoli",
        data_nascimento=date(1967, 11, 15),
        local_nascimento="Marília, SP",
        presidente_indicou="Luiz Inácio Lula da Silva",
        partido_indicacao="PT",
        data_posse=date(2009, 10, 23),
        formacao_academica=("Graduação em Direito pela USP; especialização em Direito Processual."),
    ),
    MinistroSTF(
        nome="Luiz Fux",
        nome_completo="Luiz Fux",
        data_nascimento=date(1953, 4, 26),
        local_nascimento="Rio de Janeiro, RJ",
        presidente_indicou="Dilma Rousseff",
        partido_indicacao="PT",
        data_posse=date(2011, 3, 3),
        formacao_academica=(
            "Graduação, mestrado, doutorado e livre-docência em Direito pela UERJ."
        ),
    ),
    MinistroSTF(
        nome="Edson Fachin",
        nome_completo="Luiz Edson Fachin",
        data_nascimento=date(1958, 2, 8),
        local_nascimento="Rondinha, RS",
        presidente_indicou="Dilma Rousseff",
        partido_indicacao="PT",
        data_posse=date(2015, 6, 16),
        cargo_atual="presidente",
        formacao_academica=(
            "Graduação em Direito pela UFPR; mestrado e doutorado em Direito pela PUC-SP."
        ),
    ),
    MinistroSTF(
        nome="Alexandre de Moraes",
        nome_completo="Alexandre de Moraes",
        data_nascimento=date(1968, 12, 13),
        local_nascimento="São Paulo, SP",
        presidente_indicou="Michel Temer",
        partido_indicacao="MDB",
        data_posse=date(2017, 3, 22),
        formacao_academica=("Graduação, mestrado e doutorado em Direito do Estado pela USP."),
    ),
    MinistroSTF(
        nome="Nunes Marques",
        nome_completo="Kassio Nunes Marques",
        data_nascimento=date(1972, 5, 7),
        local_nascimento="Teresina, PI",
        presidente_indicou="Jair Bolsonaro",
        partido_indicacao="PL",
        data_posse=date(2020, 11, 5),
        formacao_academica=(
            "Graduação em Direito pelo Centro de Ensino Unificado de Teresina (CEUT); "
            "mestrado em Direito Constitucional pela Universidade de Lisboa."
        ),
    ),
    MinistroSTF(
        nome="André Mendonça",
        nome_completo="André Luiz de Almeida Mendonça",
        data_nascimento=date(1972, 12, 20),
        local_nascimento="Santos, SP",
        presidente_indicou="Jair Bolsonaro",
        partido_indicacao="PL",
        data_posse=date(2021, 12, 16),
        formacao_academica=(
            "Graduação em Direito pela Universidade de Brasília (UnB); "
            "mestrado em Direito Econômico pela UFPB e doutorado pelo IDP."
        ),
    ),
    MinistroSTF(
        nome="Cristiano Zanin",
        nome_completo="Cristiano Zanin Martins",
        data_nascimento=date(1975, 6, 3),
        local_nascimento="Ribeirão Preto, SP",
        presidente_indicou="Luiz Inácio Lula da Silva",
        partido_indicacao="PT",
        data_posse=date(2023, 8, 3),
        cargo_atual="vice-presidente",
        formacao_academica=("Graduação em Direito pela PUC-SP; mestrado em Direito pela PUC-SP."),
    ),
    MinistroSTF(
        nome="Flávio Dino",
        nome_completo="Flávio Dino de Castro e Costa",
        data_nascimento=date(1968, 6, 30),
        local_nascimento="São Luís, MA",
        presidente_indicou="Luiz Inácio Lula da Silva",
        partido_indicacao="PT",
        data_posse=date(2024, 2, 22),
        formacao_academica=(
            "Graduação em Direito pela UFMA; mestrado em Direito Público pela UFPE."
        ),
    ),
]


def aposentadoria_compulsoria(nascimento: date) -> date:
    """Retorna a data em que o ministro completa 75 anos (aposentadoria compulsória).

    Lida com 29 de fevereiro em anos não bissextos retornando 28/02.
    """
    try:
        return nascimento.replace(year=nascimento.year + 75)
    except ValueError:
        # 29/02 em ano que o +75 não é bissexto
        return nascimento.replace(month=2, day=28, year=nascimento.year + 75)


# Vagas abertas (histórico documentado)
VAGAS_ABERTAS: list[dict[str, str]] = [
    {
        "cadeira_de": "Luís Roberto Barroso",
        "aposentou_em": "2025-10-16",
        "ultima_indicacao_rejeitada": "Jorge Messias (abril/2026)",
    },
]
