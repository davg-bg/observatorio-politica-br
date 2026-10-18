"""Modelos Pydantic para endpoints de votações da Câmara."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class VotacaoResumo(BaseModel):
    """Elemento de GET /votacoes (lista)."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    id: str  # formato "2236186-60"
    data: date
    data_hora_registro: datetime = Field(alias="dataHoraRegistro")
    sigla_orgao: str | None = Field(default=None, alias="siglaOrgao")
    descricao: str
    aprovacao: int | None = None  # 0 ou 1
    uri_evento: str | None = Field(default=None, alias="uriEvento")
    uri_proposicao_objeto: str | None = Field(default=None, alias="uriProposicaoObjeto")
    # API às vezes retorna string ("REQ 25/2026 ...") em vez de dict quando é requerimento
    # inline sem link estruturado. Normalizamos pra dict ou None.
    proposicao_objeto: dict | None = Field(default=None, alias="proposicaoObjeto")
    uri: str | None = None

    @field_validator("proposicao_objeto", mode="before")
    @classmethod
    def _normalize_proposicao_objeto(cls, v: Any) -> Any:
        """Aceita dict, None ou string (devolvendo None pra string)."""
        if v is None or isinstance(v, dict):
            return v
        if isinstance(v, str):
            # Requerimentos inline não têm dict com uri. Descartamos — só queremos
            # proposições identificáveis via uri.
            return None
        return None


class VotoCamaraDeputado(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    id: int
    nome: str
    sigla_partido: str | None = Field(default=None, alias="siglaPartido")
    sigla_uf: str | None = Field(default=None, alias="siglaUf")


class VotoCamara(BaseModel):
    """Elemento de GET /votacoes/{id}/votos."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    tipo_voto: str = Field(alias="tipoVoto")
    data_registro: datetime | None = Field(default=None, alias="dataRegistroVoto")
    deputado: VotoCamaraDeputado = Field(alias="deputado_")

    @field_validator("tipo_voto", mode="before")
    @classmethod
    def _strip(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip() or "Outro"
        return v


class OrientacaoCamara(BaseModel):
    """Elemento de GET /votacoes/{id}/orientacoes.

    Blocos (`codTipoLideranca='B'`) são agregações sem partido_id resolvível —
    o job filtra pra manter só orientações partidárias (tipo P).
    """

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    orientacao_voto: str = Field(default="", alias="orientacaoVoto")
    cod_tipo_lideranca: str | None = Field(default=None, alias="codTipoLideranca")
    sigla_partido_bloco: str | None = Field(default=None, alias="siglaPartidoBloco")
    cod_partido_bloco: int | None = Field(default=None, alias="codPartidoBloco")


# ---------- Helpers de normalização ----------

CANONIC_VOTO = {
    "sim": "Sim",
    "não": "Não",
    "nao": "Não",
    "abstenção": "Abstenção",
    "abstencao": "Abstenção",
    "obstrução": "Obstrução",
    "obstrucao": "Obstrução",
    "artigo 17": "Artigo 17",
    "art. 17": "Artigo 17",
    "branco": "Branco",
}


def normalize_tipo_voto(raw: str | None) -> str:
    """Normaliza para um dos valores canônicos ou 'Outro'."""
    if not raw:
        return "Outro"
    key = raw.strip().lower()
    return CANONIC_VOTO.get(key, "Outro")


def extract_source_id_from_uri(uri: str | None) -> str | None:
    """Extrai o último segmento numérico de uma URI tipo
    `https://dadosabertos.camara.leg.br/api/v2/proposicoes/2647737`."""
    if not uri:
        return None
    tail = uri.rstrip("/").rsplit("/", 1)[-1]
    return tail if tail else None
