# Plano de Implementação — Observatório da Política Brasileira

> Status: **26/26 tasks concluídas**. Documento canônico do roadmap entregue.

## Problem Statement

Criar uma plataforma web pessoal (com caminho pra se tornar pública) que agrega dados oficiais do Legislativo federal (Câmara, Senado), Executivo (Presidência, ministérios) e Judiciário (STF), permitindo acompanhar atividades diárias, perfis de parlamentares e ministros, votações, emendas, projetos parados e padrões de alinhamento partidário — sem viés editorial, apenas servindo o dado bruto oficial organizado de forma analisável.

## Requirements

- **R1** — Dashboard web navegável (não CLI, não bot). ✓
- **R2** — ETL diário com histórico em PostgreSQL (dados "quentes" e "frios" ambos persistidos). ✓
- **R3** — Escopo: Legislativo federal + Executivo + STF. ✓
- **R4** — Features em fases incrementais: perfis, agenda, votações, alinhamento, histórico, engavetados, emendas, busca, alertas. ✓
- **R5** — Alinhamento partidário com Índice de Rice + similaridade cosseno/Jaccard. ✓
- **R6** — API oficial prioritária; scraping sinalizado como tal na UI. ✓
- **R7** — Começa monousuário; infra prevê multi-user (Supabase Auth) desde a fundação. ✓
- **R8** — Hospedagem free tier: Vercel + Supabase + GitHub Actions. ✓

## Fontes

### Oficiais (API, estável)

| Fonte | Endpoint | Formato | Status |
|---|---|---|---|
| Câmara dos Deputados | `dadosabertos.camara.leg.br/api/v2` | REST JSON | ✓ integrado |
| Senado Federal | `legis.senado.leg.br/dadosabertos` | REST XML/JSON | ✓ integrado |
| Portal da Transparência | `api.portaldatransparencia.gov.br/api-de-dados` | REST JSON (token) | ✓ integrado |

### Complementares (scraping / cadastro)

| Fonte | Método | Status |
|---|---|---|
| STF composição | Lista curada em código | ✓ versionada |
| STF agenda | API JSON em `portal.stf.jus.br/pauta/services` | ✓ integrada |
| STF votos em julgamentos | Scraping do `noticias.stf.jus.br` com parser conservador | ✓ experimental |
| DOU | INLABS (cadastro gratuito) | não escopado nesta fase |
| TSE | `dadosabertos.tse.jus.br` (CSVs) | não escopado nesta fase |

## Stack

- **Front**: Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + Drizzle ORM. ✓
- **ETL**: Python 3.13 + httpx + pydantic + SQLAlchemy + typer. ✓
- **DB**: Supabase PostgreSQL (free tier). ✓
- **CI/Cron**: GitHub Actions (`etl-daily.yml` cron 06:00 UTC + `etl-weekly.yml` cron seg 10:00 UTC). ✓
- **Deploy**: Vercel (web) + Supabase (banco). ✓

## Roadmap

### Fase 0 — Fundação

- [x] **Task 1** — Setup monorepo e infra base
- [x] **Task 2** — Schema inicial e migrations (0001_init)

### Fase 1 — Perfis dos parlamentares

- [x] **Task 3** — ETL Câmara deputados
- [x] **Task 4** — ETL Senado senadores
- [x] **Task 5** — Página de listagem
- [x] **Task 6** — Página de perfil
- [x] **Task 7** — GH Actions diário

### Fase 2 — O que tá acontecendo agora

- [x] **Task 8** — Schema de proposições/votações (0002)
- [x] **Task 9** — ETL de votações recentes
- [x] **Task 10** — Página Agenda do dia
- [x] **Task 11** — Página Votações recentes
- [x] **Task 12** — Integração perfil ↔ votações

### Fase 3 — Análise comparativa

- [x] **Task 13** — Cálculos de alinhamento (0003: Rice + similaridade cosseno em views materializadas)
- [x] **Task 14** — Página de matriz NxN
- [x] **Task 15** — Histórico individual + fidelidade

### Fase 4 — Transparência profunda

- [x] **Task 16** — ETL de emendas (0004)
- [x] **Task 17** — Página de emendas
- [x] **Task 18** — Detecção de engavetados (0005)
- [x] **Task 19** — Página de engavetados
- [x] **Task 20** — ETL do Executivo (0006: ministros + MPVs)

### Fase 5 — Auth e alertas

- [x] **Task 21** — Supabase Auth (`@supabase/ssr` + middleware)
- [x] **Task 22** — Favoritar com RLS (0007)
- [x] **Task 23** — Alertas por email (digest Resend, workflow weekly)

### Fase 6 — STF

- [x] **Task 24** — ETL composição (0008 + lista curada dos 11 ministros)
- [x] **Task 25** — Agenda do plenário (0009 + endpoint JSON do portal.stf.jus.br)
- [x] **Task 26** — Votos em julgamentos (0010, experimental; scraping do noticias.stf.jus.br com índice de confiança)

## Imparcialidade — princípios estruturais

1. Mostramos dado bruto, não ranking.
2. Fonte visível em cada bloco (badge `Fonte oficial` vs `Scraping — pode conter erros` vs `Dado manual`).
3. Metodologia aberta em `/sobre`.
4. Código open-source — qualquer um pode auditar.
5. Dados experimentais (ex: julgamentos do STF) carregam índice de confiança explícito e aviso visível.

## Entregáveis finais

- **17 rotas** no frontend (Next.js 15): `/`, `/parlamentares`, `/parlamentares/[id]`, `/votacoes`, `/votacoes/[id]`, `/agenda`, `/alinhamento`, `/emendas`, `/engavetados`, `/executivo`, `/stf`, `/stf/julgamentos`, `/login`, `/auth/callback`, `/me/favoritos`, `/api/status`.
- **10 migrations SQL** idempotentes versionadas em `db/migrations/`.
- **9 jobs ETL** (`etl run <job>`): camara-deputados, senado-senadores, camara-votacoes, camara-proposicoes, camara-mps, executivo-ministros, transparencia-emendas, stf-composicao, stf-pautas, stf-julgamentos, alertas-digest.
- **305 testes Python** cobrindo migrations, parsers, upserts e orquestração.
- **2 workflows GitHub Actions**: `etl-daily.yml` (06:00 UTC) e `etl-weekly.yml` (seg 10:00 UTC).
- **Documentação operacional** completa em `docs/ops.md` (Supabase, Vercel, GH Secrets).
