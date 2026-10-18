"""Modelos Pydantic para as respostas da API do Senado Federal.

A API do Senado nasceu em XML. Quando chamada com `Accept: application/json`
ela converte, mas mantém peculiaridades: campos opcionais aparecem/somem e
coleções com 1 item vêm como objeto (não lista). Normalizamos no parser.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Legislatura(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    numero: int = Field(alias="NumeroLegislatura")
    data_inicio: date = Field(alias="DataInicio")
    data_fim: date = Field(alias="DataFim")


class IdentificacaoParlamentar(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    codigo: str = Field(alias="CodigoParlamentar")
    nome: str = Field(alias="NomeParlamentar")
    nome_completo: str | None = Field(default=None, alias="NomeCompletoParlamentar")
    sexo: str | None = Field(default=None, alias="SexoParlamentar")  # "Masculino"/"Feminino"
    url_foto: str | None = Field(default=None, alias="UrlFotoParlamentar")
    url_pagina: str | None = Field(default=None, alias="UrlPaginaParlamentar")
    email: str | None = Field(default=None, alias="EmailParlamentar")
    sigla_partido: str | None = Field(default=None, alias="SiglaPartidoParlamentar")
    uf: str | None = Field(default=None, alias="UfParlamentar")


class MandatoSenado(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    codigo: str | None = Field(default=None, alias="CodigoMandato")
    primeira_legislatura: Legislatura | None = Field(
        default=None, alias="PrimeiraLegislaturaDoMandato"
    )
    segunda_legislatura: Legislatura | None = Field(
        default=None, alias="SegundaLegislaturaDoMandato"
    )
    descricao_participacao: str | None = Field(default=None, alias="DescricaoParticipacao")

    @property
    def legislatura_atual(self) -> Legislatura | None:
        """Retorna a legislatura cujo intervalo contém hoje; fallback = a primeira."""
        from datetime import date as _date

        hoje = _date.today()
        for leg in (self.segunda_legislatura, self.primeira_legislatura):
            if leg and leg.data_inicio <= hoje <= leg.data_fim:
                return leg
        return self.primeira_legislatura


class ParlamentarEmExercicio(BaseModel):
    """Elemento da lista /senador/lista/atual."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    identificacao: IdentificacaoParlamentar = Field(alias="IdentificacaoParlamentar")
    mandato: MandatoSenado | None = Field(default=None, alias="Mandato")


class DadosBasicosParlamentar(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    data_nascimento: date | None = Field(default=None, alias="DataNascimento")
    naturalidade: str | None = Field(default=None, alias="Naturalidade")
    uf_naturalidade: str | None = Field(default=None, alias="UfNaturalidade")
    endereco: str | None = Field(default=None, alias="EnderecoParlamentar")


class DetalheSenador(BaseModel):
    """Modelo consolidado do detalhe (mais rico que a lista)."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    identificacao: IdentificacaoParlamentar = Field(alias="IdentificacaoParlamentar")
    dados_basicos: DadosBasicosParlamentar | None = Field(
        default=None, alias="DadosBasicosParlamentar"
    )

    @field_validator("dados_basicos", mode="before")
    @classmethod
    def _handle_empty(cls, v: Any) -> Any:
        # API às vezes manda "" quando não tem dados — vira None.
        if v == "" or v is None:
            return None
        return v


# ---------- helpers de normalização ----------
def normalize_sexo(v: str | None) -> Literal["M", "F"] | None:
    """'Masculino' -> 'M', 'Feminino' -> 'F'."""
    if not v:
        return None
    first = v.strip()[:1].upper()
    return first if first in ("M", "F") else None  # type: ignore[return-value]


def unwrap_list(value: Any, key: str) -> list[Any]:
    """`value[key]` pode ser objeto, lista ou ausente. Normaliza pra lista."""
    if not isinstance(value, dict):
        return []
    inner = value.get(key)
    if inner is None:
        return []
    if isinstance(inner, list):
        return inner
    return [inner]
