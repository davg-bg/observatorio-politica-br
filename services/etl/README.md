# Observatório ETL

Serviço de ingestão de dados oficiais que alimenta o banco Postgres do Observatório da Política Brasileira.

## Princípios

- **Idempotência**: todo job pode rodar várias vezes no mesmo dia produzindo o mesmo estado final no banco (via upsert).
- **Fail safely**: se uma fonte estiver fora do ar, o job falha somente para aquela fonte; demais jobs seguem.
- **Rate limit respeitoso**: ≤ 10 req/s para APIs públicas, com retry exponencial em 429 e 5xx.
- **Observabilidade**: toda execução grava uma linha em `ingest_runs` com contagens e timestamps.

## Setup

Pré-requisito: [uv](https://docs.astral.sh/uv/) e Python 3.11+.

```bash
cd services/etl
uv sync
cp ../../.env.example ../../.env   # preencher
```

## Uso

```bash
# Rodar todos os jobs diários
uv run etl run daily

# Rodar um job específico
uv run etl run camara-deputados
uv run etl run senado-senadores

# Dry-run (não grava no banco)
uv run etl run camara-deputados --dry-run

# Listar jobs disponíveis
uv run etl jobs
```

## Estrutura

```
etl/
├── cli.py              # Entry point (typer)
├── config.py           # Settings via pydantic-settings
├── db.py               # SQLAlchemy session + helpers
├── http.py             # Cliente HTTP com rate limit e retry
├── ingest_runs.py      # Logging de execuções
└── sources/
    ├── camara/
    │   ├── client.py       # Client API Câmara
    │   ├── deputados.py    # Job de deputados
    │   └── votacoes.py     # Job de votações (Fase 2)
    └── senado/
        ├── client.py       # Client API Senado (XML)
        └── senadores.py    # Job de senadores
```

## Testes

```bash
uv run pytest -v
```
