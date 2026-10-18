import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/empty-state';
import { Pagination } from '@/components/pagination';
import { VotacaoCard } from '@/components/votacoes/votacao-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { SourceBadge } from '@/components/ui/source-badge';
import { listVotacoes } from '@/lib/queries/votacoes';
import { Database, Search, Vote, X } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Votações — Observatório da Política Brasileira',
  description: 'Últimas votações nominais no Congresso.',
};

export const revalidate = 1800;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function VotacoesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const casa = pickString(sp.casa);
  const descricao = pickString(sp.q);
  const dias = pickString(sp.dias);
  const pageRaw = pickString(sp.page);
  const page = pageRaw ? Math.max(1, parseInt(pageRaw, 10) || 1) : 1;

  const result = await listVotacoes({
    casa: casa === 'camara' || casa === 'senado' ? casa : undefined,
    descricao,
    dias: dias ? parseInt(dias, 10) || 90 : 90,
    page,
  });

  const activeFilters = { casa, q: descricao, dias };
  const hasFilter = Boolean(casa || descricao);

  return (
    <main className="container mx-auto max-w-6xl space-y-6 px-4 py-10">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Início
        </Link>
        <span>/</span>
        <span>Votações</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Votações recentes</h1>
          <p className="text-muted-foreground">
            Votações nominais com breakdown por partido e voto individual.
          </p>
        </div>
        <SourceBadge source="api-oficial" />
      </header>

      <form
        method="GET"
        action="/votacoes"
        className="grid gap-3 rounded-lg border bg-card p-4 shadow-sm sm:grid-cols-[2fr_1fr_1fr_auto]"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            placeholder="Buscar na descrição…"
            defaultValue={descricao ?? ''}
            className="pl-8"
            aria-label="Buscar"
          />
        </div>
        <NativeSelect name="casa" defaultValue={casa ?? ''} aria-label="Casa">
          <option value="">Todas as casas</option>
          <option value="camara">Câmara dos Deputados</option>
          <option value="senado">Senado Federal</option>
        </NativeSelect>
        <NativeSelect name="dias" defaultValue={dias ?? '90'} aria-label="Janela temporal">
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
          <option value="365">Último ano</option>
        </NativeSelect>
        <div className="flex items-center gap-2">
          <Button type="submit">Filtrar</Button>
          {hasFilter && (
            <Button type="button" variant="ghost" size="icon" asChild>
              <Link href="/votacoes" aria-label="Limpar">
                <X className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </form>

      {!result.dbConfigured ? (
        <EmptyState
          icon={<Database className="h-10 w-10" />}
          title="Banco não configurado"
          description="Configure DATABASE_URL e rode as migrations."
        />
      ) : result.items.length === 0 ? (
        <EmptyState
          icon={<Vote className="h-10 w-10" />}
          title="Nenhuma votação encontrada"
          description={
            hasFilter
              ? 'Ajuste os filtros ou amplie a janela temporal.'
              : 'O ETL de votações ainda não rodou. Dispare em Actions → ETL Daily.'
          }
          action={
            hasFilter ? (
              <Button asChild variant="outline">
                <Link href="/votacoes">Limpar filtros</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {result.items.map((v) => (
              <VotacaoCard key={v.id} votacao={v} />
            ))}
          </div>

          <div className="flex flex-col items-center gap-3 pt-4 text-xs text-muted-foreground">
            <Pagination
              currentPage={result.page}
              totalPages={result.totalPages}
              basePath="/votacoes"
              searchParams={activeFilters}
            />
            <p>
              {result.total} votações — página {result.page} de {result.totalPages}
            </p>
          </div>
        </>
      )}
    </main>
  );
}
