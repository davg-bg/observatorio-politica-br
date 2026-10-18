# Database — Migrations e schema

Migrations SQL **versionadas e idempotentes**. Toda alteração de schema é um novo arquivo `NNNN_descricao.sql` nesta pasta.

## Convenções

- **Nome do arquivo**: `NNNN_descricao_curta.sql`, zero-padded a 4 dígitos (0001, 0002, …).
- **Idempotência**: todo DDL usa `IF NOT EXISTS`, `OR REPLACE`, ou `DO $$ ... EXCEPTION duplicate_object $$`.
- **Transação única**: cada migration abre `BEGIN` e termina com `COMMIT`.
- **Última linha**: cada migration registra sua versão em `schema_migrations`.
- **Rollback**: não escrevemos migrations de rollback — fazemos uma nova migration para corrigir.

## Aplicando

### Via CLI do ETL (recomendado)

```bash
# Pré-requisito: DATABASE_URL configurada em .env
cd services/etl
uv run etl migrate            # aplica todas as pendentes
uv run etl migrate --dry-run  # mostra o que seria aplicado
```

### Via Supabase SQL Editor

Abra o SQL Editor do seu projeto no [dashboard Supabase](https://supabase.com/dashboard), cole o conteúdo da migration e execute.

### Via psql

```bash
psql "$DATABASE_URL" -f db/migrations/0001_init.sql
```

## Tabelas atuais

| Tabela | Função | Migration |
|---|---|---|
| `ufs` | 27 unidades da federação (seed) | 0001 |
| `partidos` | Partidos políticos (seed inicial + atualizados por ETL) | 0001 |
| `legislaturas` | 56ª, 57ª, 58ª legislaturas (seed) | 0001 |
| `parlamentares` | Deputados + senadores unificados | 0001 |
| `mandatos` | Histórico de mandatos por legislatura | 0001 |
| `ingest_runs` | Execuções do ETL (observabilidade) | 0001 |
| `schema_migrations` | Controle de migrations aplicadas | 0001 |
| `proposicoes` | PLs, PECs, MPVs e demais proposições | 0002 |
| `temas` | Taxonomia oficial de temas | 0002 |
| `proposicoes_temas` | Classificação temática (N:N) | 0002 |
| `proposicoes_autores` | Autores (parlamentares ou órgãos) | 0002 |
| `tramitacoes` | Histórico de movimentações por proposição | 0002 |
| `votacoes` | Sessões de votação nominal | 0002 |
| `votos` | Voto individual + snapshot do partido na época | 0002 |
| `orientacoes_partidarias` | Orientação do líder por votação (base da fidelidade) | 0002 |

## Views materializadas (próximas fases)

- `v_alinhamento_partidos` (Task 13) — similaridade cosseno entre partidos
- `v_coesao_partido` (Task 13) — Índice de Rice por partido
- `v_engavetados` (Task 18) — PLs parados > 180 dias
