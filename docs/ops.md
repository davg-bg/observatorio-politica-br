# Guia operacional

Setup, deploy e troubleshooting das peças que ficam fora do código: Supabase, GitHub Actions, Vercel.

## 1. Supabase (banco de dados)

### Criar o projeto

1. Entre em [supabase.com](https://supabase.com) e crie um projeto no free tier.
2. Escolha a região `South America (São Paulo)` para menor latência.
3. Guarde a senha do Postgres gerada — você vai usar na connection string.

### Obter credenciais

No dashboard, abra **Settings → API** e **Settings → Database**:

| Credencial | Onde achar | Para que serve |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | API → Project URL | Client-side e server-side |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | API → anon public | Client-side (respeita RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | API → service_role (secret) | Server-side admin (ETL) |
| `DATABASE_URL` | Database → Connection string → Transaction pooler | ETL e migrations |

Use **Transaction pooler** (porta 6543) — não a conexão direta (5432), que tem limite de conexões baixo.

### Aplicar migrations

Opções (em ordem de preferência):

```bash
# Via CLI do ETL (recomendado)
cd services/etl && uv run etl migrate

# Ou direto via psql
psql "$DATABASE_URL" -f db/migrations/0001_init.sql
```

Depois valide no SQL Editor do Supabase: `SELECT COUNT(*) FROM ufs;` deve retornar 27.

## 2. GitHub Actions (ETL diário)

### Secrets do repositório

Em **Settings → Secrets and variables → Actions → New repository secret**, adicione:

| Nome | Valor | Fase |
|---|---|---|
| `DATABASE_URL` | Transaction pooler do Supabase | 0 |
| `SUPABASE_URL` | URL do projeto | 0 (opcional) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | 5+ |
| `TRANSPARENCIA_API_TOKEN` | Token do Portal da Transparência | 4 |
| `RESEND_API_KEY` | Chave da Resend (emails) — se ausente, digest fica dry-run | 5 |
| `ALERT_FROM_EMAIL` | Remetente dos digests (ex: `observatorio@seudominio.com`) | 5 |

### Workflows disponíveis

- `.github/workflows/ci.yml` — lint + testes em PR.
- `.github/workflows/etl-daily.yml` — ETL diário (cron `0 6 * * *` UTC = 03:00 BRT): deputados, senadores, votações, proposições e MPs.
- `.github/workflows/etl-weekly.yml` — ETL semanal (cron `0 10 * * 1` UTC = 07:00 BRT segunda-feira): emendas, ministros e envio do digest de alertas.

### Disparo manual

Em **Actions → ETL Daily → Run workflow** você pode escolher:

- **target**: `daily` (ambas as casas), `camara-deputados` ou `senado-senadores`
- **dry_run**: `true` para rodar sem gravar no banco
- **skip_migrate**: `true` para pular `etl migrate` antes do ETL (útil se já aplicou manualmente)

Em **Actions → ETL Weekly → Run workflow**:

- **target**: `weekly` (tudo), `transparencia-emendas`, `executivo-ministros` ou `alertas-digest`
- **dry_run**: idem

### Digest de alertas (email semanal)

O job `alertas-digest` envia um resumo semanal via [Resend](https://resend.com) para cada usuário com pelo menos um parlamentar ou proposição favoritados em `/me/favoritos`.

- **Sem `RESEND_API_KEY`**: o job entra em modo dry-run e só loga os destinatários/conteúdos — útil pra testar.
- **Com a chave**: configure também `ALERT_FROM_EMAIL` (ex: `observatorio@seudominio.com`) com um domínio verificado na conta Resend.

A query lê de `auth.users`, então o `DATABASE_URL` do job precisa ter permissão de leitura nesse schema (use a connection string do pooler com `postgres` role — por padrão o Supabase já concede).

### Monitoramento

Falha envia email para o dono do repo automaticamente (padrão GitHub). O resumo da execução fica em **Actions → <run> → Summary**.

Para ver o histórico persistido no banco:

```sql
SELECT source, job, status, started_at, finished_at, stats
FROM ingest_runs
ORDER BY started_at DESC
LIMIT 20;
```

## 3. Vercel (frontend)

### Primeiro deploy

1. Conecte o repositório GitHub em [vercel.com](https://vercel.com).
2. **Framework preset**: Next.js (detectado automaticamente).
3. **Root Directory**: `apps/web`.
4. **Install Command**: `pnpm install` (em Project → Settings → General).

### Variáveis de ambiente

Em **Settings → Environment Variables**:

| Nome | Scope |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview |
| `DATABASE_URL` | Production, Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | Production (apenas) |

### ISR e cache

As páginas usam `revalidate = 3600` (1 hora). Após o ETL diário, cada página se re-renderiza no primeiro acesso após a janela.

Para forçar invalidação manual, use **Deployments → Latest → Redeploy** sem rebuild de código.

## 4. Troubleshooting

### `relation "parlamentares" does not exist`

Migrations não foram aplicadas no banco atual. Rode `uv run etl migrate`.

### `ECONNREFUSED` / `could not translate host name`

`DATABASE_URL` está apontando pro host errado. Deve ser o pooler (`aws-0-<region>.pooler.supabase.com:6543`), não o host direto.

### GitHub Action falha com `DATABASE_URL não configurada`

Secret não foi definido ou foi definido no escopo errado (environment em vez de repository). Verifique **Settings → Secrets → Actions**.

### Timeout do ETL

Rate limit interno é de 10 req/s para Câmara, 5 req/s para Senado. 513 deputados × ~0.15s ≈ 80s. Se ultrapassar 20min, há problema de rede ou API fora. Reduza `rate_limit_camara` em `etl/config.py` se necessário.

### Página mostra "Nenhum parlamentar ingerido ainda"

O banco tá configurado mas o ETL ainda não rodou. Dispare manualmente via **Actions → ETL Daily → Run workflow**.
