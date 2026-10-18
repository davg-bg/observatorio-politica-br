"""Modelos Pydantic para respostas do Portal da Transparência."""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _parse_brl(raw: str | int | float | None) -> Decimal:
    """Converte '1.234.567,89' (padrão BRL) ou número puro para Decimal.

    Valores ausentes ou vazios viram 0.
    """
    if raw is None or raw == "":
        return Decimal("0")
    if isinstance(raw, (int, float)):
        return Decimal(str(raw))
    s = raw.strip()
    if not s:
        return Decimal("0")
    # Padrão BRL: "1.234,56" → "1234.56"
    s = s.replace(".", "").replace(",", ".")
    try:
        return Decimal(s)
    except Exception:
        return Decimal("0")


class EmendaDTO(BaseModel):
    """Resposta de GET /api-de-dados/emendas (ConsultaEmendasDTO)."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    codigo_emenda: str = Field(alias="codigoEmenda")
    ano: int
    tipo_emenda: str | None = Field(default=None, alias="tipoEmenda")
    autor: str | None = None  # igual a nomeAutor em geral
    nome_autor: str | None = Field(default=None, alias="nomeAutor")
    numero_emenda: str | None = Field(default=None, alias="numeroEmenda")
    localidade_do_gasto: str | None = Field(default=None, alias="localidadeDoGasto")
    funcao: str | None = None
    subfuncao: str | None = None

    valor_empenhado: Decimal = Field(default=Decimal("0"), alias="valorEmpenhado")
    valor_liquidado: Decimal = Field(default=Decimal("0"), alias="valorLiquidado")
    valor_pago: Decimal = Field(default=Decimal("0"), alias="valorPago")
    valor_resto_inscrito: Decimal = Field(default=Decimal("0"), alias="valorRestoInscrito")
    valor_resto_cancelado: Decimal = Field(default=Decimal("0"), alias="valorRestoCancelado")
    valor_resto_pago: Decimal = Field(default=Decimal("0"), alias="valorRestoPago")

    @field_validator(
        "valor_empenhado",
        "valor_liquidado",
        "valor_pago",
        "valor_resto_inscrito",
        "valor_resto_cancelado",
        "valor_resto_pago",
        mode="before",
    )
    @classmethod
    def _parse_valor(cls, v):
        return _parse_brl(v)

    @property
    def autor_normalizado(self) -> str:
        """Prefere `nomeAutor` sobre `autor`; retorna '' se ambos vazios."""
        return (self.nome_autor or self.autor or "").strip()


# Expose para testes
parse_brl = _parse_brl
