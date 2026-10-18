# Observatório da Política Brasileira

Plataforma web para acompanhar de forma imparcial o Legislativo federal (Câmara, Senado), o Executivo (Presidência, ministérios) e o STF, consumindo dados oficiais, com histórico persistido e análises comparativas (alinhamento partidário, histórico de votação, emendas, projetos engavetados).

## Princípio editorial

Não há ranking subjetivo nem opinião. Exibimos o dado bruto oficial com link para a fonte, sinalizamos a origem (API oficial vs scraping) e documentamos a metodologia aberta em `/sobre`.

## Arquitetura

```
┌────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Fontes        │───▶│  services/etl    │───▶│  Supabase       │
│  (Câmara,      │    │  (Python)        │    │  PostgreSQL     │
│  Senado, etc)  │    │  jobs diários    │    │                 │
└────────────────┘    └──────────────────┘    └────────┬────────┘
                              ▲                        │
                              │ cron                   │ reads
                      ┌───────┴────────┐      ┌────────▼────────┐
                      │ GitHub Actions │      │ apps/web        │
                      └────────────────┘      │ (Next.js 15)    │
                                              └─────────────────┘
```

## Monorepo

- `apps/web/` — Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + Tremor + Drizzle ORM.
- `services/etl/` — Python 3.11 + httpx + pydantic + SQLAlchemy. Jobs idempotentes por fonte.
- `db/migrations/` — Schema SQL versionado, único entre web e ETL.
- `.github/workflows/` — CI (lint/typecheck) e cron de ETL.

## Setup rápido

Pré-requisitos: Node 20+, pnpm 9+, Python 3.11+, [uv](https://docs.astral.sh/uv/) para o ETL, e uma conta Supabase (free tier).

```bash
# 1. Instalar dependências do monorepo
pnpm install

# 2. Instalar dependências do ETL
cd services/etl && uv sync && cd ../..

# 3. Copiar o template de env e preencher
cp .env.example .env

# 4. Aplicar migrations no Supabase
# Abra o Supabase SQL Editor e cole db/migrations/0001_init.sql

# 5. Rodar o web
pnpm dev
```

Acesse `http://localhost:3000`.

## Status do projeto

Em desenvolvimento, seguindo o plano em `docs/plano.md`. Fase atual: **Fase 0 (Fundação)**.

## Licença

MIT.
