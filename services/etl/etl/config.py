"""Configuração centralizada via pydantic-settings.

Lê de env vars (prefixo opcional) e opcionalmente de .env na raiz do monorepo.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# A raiz do monorepo é 3 diretórios acima deste arquivo:
# services/etl/etl/config.py -> services/etl -> services -> raiz
MONOREPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent


class Settings(BaseSettings):
    """Configuração do ETL.

    Variáveis obrigatórias em produção; opcionais em dev para permitir
    rodar testes e CLI sem credenciais.
    """

    model_config = SettingsConfigDict(
        env_file=str(MONOREPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Banco
    database_url: str | None = Field(
        default=None,
        description="Postgres connection string (postgresql://...)",
    )

    # Supabase (alternativa via REST, caso DATABASE_URL não esteja setada)
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None

    # Portal da Transparência (Fase 4)
    transparencia_api_token: str | None = None

    # DOU / INLABS (Fase 4)
    inlabs_email: str | None = None
    inlabs_password: str | None = None

    # Flags de execução
    etl_dry_run: bool = False
    etl_limit: int | None = None

    # Rate limit (req/s por fonte)
    rate_limit_camara: float = 10.0
    rate_limit_senado: float = 5.0
    rate_limit_transparencia: float = 2.0

    # Timeout HTTP padrão (segundos)
    http_timeout: float = 30.0


# Instância global importável
settings = Settings()
