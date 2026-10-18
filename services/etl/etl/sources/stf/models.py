"""Modelos Pydantic pra pautas do STF."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class IncidenteSTF(BaseModel):
    """Processo listado em uma sessão de julgamento."""

    classe: str
    numero: str
    relator: str | None = None
    ministro_vista: str | None = Field(None, alias="ministroVista")
    destaque: str | None = None
    materia_relevante: str | None = Field(None, alias="materiaRelevante")
    repercussao_geral: str | None = Field(None, alias="repercussaoGeral")
    assuncao_competencia: str | None = Field(None, alias="assuncaoCompetencia")
    situacao_processo_sessao: str | None = Field(None, alias="situacaoProcessoSessao")
    id_informacao_pauta_processo: str = Field(..., alias="idInformacaoPautaProcesso")
    resumo_tema: str | None = Field(None, alias="resumoTema")

    model_config = {"populate_by_name": True, "extra": "ignore"}


class SessaoSTF(BaseModel):
    """Sessão de julgamento (plenário ou turma)."""

    id: str
    data_inicio_str: str = Field(..., alias="dataInicio")  # "15/10/2026 14:00"
    tipo: str  # "E" ou "O"
    numero: str | None = None
    ano: str | None = None
    observacao: str | None = None
    incidentes: list[IncidenteSTF] = Field(default_factory=list)

    model_config = {"populate_by_name": True, "extra": "ignore"}

    @property
    def data_inicio(self) -> datetime | None:
        """Parse de 'DD/MM/YYYY HH:MM' pra datetime (naive)."""
        try:
            return datetime.strptime(self.data_inicio_str, "%d/%m/%Y %H:%M")
        except (ValueError, TypeError):
            try:
                return datetime.strptime(self.data_inicio_str, "%d/%m/%Y")
            except (ValueError, TypeError):
                return None

    @property
    def numero_int(self) -> int | None:
        try:
            return int(self.numero) if self.numero else None
        except (ValueError, TypeError):
            return None

    @property
    def ano_int(self) -> int | None:
        try:
            return int(self.ano) if self.ano else None
        except (ValueError, TypeError):
            return None


class ColegiadoSTF(BaseModel):
    """Agrupa sessões por colegiado (plenário, turmas)."""

    codigo: str  # "TP", "1T", "2T"
    descricao: str  # "Plenário", "Primeira Turma", "Segunda Turma"
    sessoes: list[SessaoSTF] = Field(default_factory=list)

    model_config = {"extra": "ignore"}


class CalendarioSessao(BaseModel):
    """Resposta do endpoint calendario-service.asp?dados=sessao-presencial."""

    data: str  # "15/10/2026"
    tipo: str  # "PRESENCIAL"
    colegiados: list[ColegiadoSTF] = Field(default_factory=list)

    model_config = {"extra": "ignore"}


def flag_sn(valor: str | None) -> bool:
    """Normaliza flag 'S'/'N' da API em bool."""
    return str(valor or "").strip().upper() == "S"
