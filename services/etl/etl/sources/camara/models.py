"""Modelos Pydantic para as respostas da API da Câmara.

Mantemos modelos permissivos (campos opcionais, extra='allow') porque a
API ocasionalmente adiciona ou omite campos. Falha em um campo opcional
não deve derrubar a ingestão de 500 outros deputados.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DeputadoResumo(BaseModel):
    """Resposta de GET /deputados — item resumido da lista."""

    model_config = ConfigDict(extra="allow")

    id: int
    nome: str
    sigla_partido: str | None = Field(default=None, alias="siglaPartido")
    sigla_uf: str | None = Field(default=None, alias="siglaUf")
    id_legislatura: int | None = Field(default=None, alias="idLegislatura")
    url_foto: str | None = Field(default=None, alias="urlFoto")
    email: str | None = None


class Gabinete(BaseModel):
    model_config = ConfigDict(extra="allow")

    nome: str | None = None
    predio: str | None = None
    sala: str | None = None
    andar: str | None = None
    telefone: str | None = None
    email: str | None = None


class UltimoStatus(BaseModel):
    """Objeto `ultimoStatus` dentro de GET /deputados/{id}."""

    model_config = ConfigDict(extra="allow")

    id: int
    nome: str
    sigla_partido: str | None = Field(default=None, alias="siglaPartido")
    sigla_uf: str | None = Field(default=None, alias="siglaUf")
    id_legislatura: int = Field(alias="idLegislatura")
    url_foto: str | None = Field(default=None, alias="urlFoto")
    email: str | None = None
    data: date | None = None
    nome_eleitoral: str | None = Field(default=None, alias="nomeEleitoral")
    gabinete: Gabinete | None = None
    situacao: str | None = None
    condicao_eleitoral: str | None = Field(default=None, alias="condicaoEleitoral")


class DeputadoDetalhe(BaseModel):
    """Resposta de GET /deputados/{id}."""

    model_config = ConfigDict(extra="allow")

    id: int
    nome_civil: str | None = Field(default=None, alias="nomeCivil")
    ultimo_status: UltimoStatus = Field(alias="ultimoStatus")
    cpf: str | None = None
    sexo: Literal["M", "F"] | None = None
    url_website: str | None = Field(default=None, alias="urlWebsite")
    rede_social: list[str] = Field(default_factory=list, alias="redeSocial")
    data_nascimento: date | None = Field(default=None, alias="dataNascimento")
    data_falecimento: date | None = Field(default=None, alias="dataFalecimento")
    uf_nascimento: str | None = Field(default=None, alias="ufNascimento")
    municipio_nascimento: str | None = Field(default=None, alias="municipioNascimento")
    escolaridade: str | None = None


class ListResponse(BaseModel):
    """Envelope de resposta de endpoints de listagem."""

    model_config = ConfigDict(extra="allow")

    dados: list[dict]  # mantemos dict genérico; cada caller valida com o modelo apropriado
    links: list[dict] = Field(default_factory=list)


class DetailResponse(BaseModel):
    """Envelope de resposta de endpoints de detalhe."""

    model_config = ConfigDict(extra="allow")

    dados: dict
    links: list[dict] = Field(default_factory=list)
