import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/empty-state';
import { Pagination } from '@/components/pagination';
import { ParlamentarCard } from '@/components/parlamentar-card';
import { ParlamentaresFilters } from '@/components/parlamentares-filters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SourceBadge } from '@/components/ui/source-badge';
import { listFilterOptions, listParlamentares } from '@/lib/queries/parlamentares';
import { Database, SearchX, Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Parlamentares — Observatório da Política Brasileira',
  description: 'Lista completa de deputados federais e senadores em exercício.',
};

// Revalida a cada hora; o ETL diário atualiza os dados.
export const revalidate = 3600;

interface PageProps {
  // Next 15 passa searchParams como Promise em Server Components.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function ParlamentaresPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const casa = pickString(params.casa);
  const uf = pickString(params.uf);
  const partido = pickString(params.partido);
  const nome = pickString(params.nome);
  const pageRaw = pickString(params.page);
  const page = pageRaw ? Math.max(1, parseInt(pageRaw, 10) || 1) : 1;

  const [result, options] = await Promise.all([
    listParlamentares({
      casa: casa === 'camara' || casa === 'senado' ? casa : undefined,
      ufSigla: uf,
      partidoSigla: partido,
      nome,
      page,
    }),
    listFilterOptions(),
  ]);

  const activeFilters = { casa, uf, partido, nome };
  const hasActiveFilter = Boolean(casa || uf || partido || nome);

  return (
    <main className="container mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Início
          </Link>
          <span>/</span>
          <span>Parlamentares</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Parlamentares</h1>
            <p className="text-muted-foreground">
              Deputados federais e senadores em exercício, com dados oficiais da Câmara e do
              Senado.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <SourceBadge source="api-oficial" />
            {result.dbConfigured && result.total > 0 && (
              <Badge variant="secondary">{result.total} em exercício</Badge>
            )}
          </div>
        </div>
      </header>

      <ParlamentaresFilters
        currentFilters={activeFilters}
        availableUfs={options.ufs}
        availablePartidos={options.partidos}
      />

      {!result.dbConfigured ? (
        <EmptyState
          icon={<Database className="h-10 w-10" />}
          title="Banco de dados não configurado"
          description="Configure DATABASE_URL em .env e aplique as migrations para começar a popular a tabela de parlamentares."
          action={
            <Button asChild variant="outline">
              <Link href="/">Voltar à Home</Link>
            </Button>
          }
        />
      ) : result.items.length === 0 && hasActiveFilter ? (
        <EmptyState
          icon={<SearchX className="h-10 w-10" />}
          title="Nenhum parlamentar encontrado"
          description="Ajuste os filtros ou limpe a busca."
          action={
            <Button asChild variant="outline">
              <Link href="/parlamentares">Limpar filtros</Link>
            </Button>
          }
        />
      ) : result.items.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="Nenhum parlamentar ingerido ainda"
          description={
            <>
              Rode o ETL para popular o banco:{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                cd services/etl && uv run etl run daily
              </code>
            </>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((p) => (
              <ParlamentarCard key={p.id} parlamentar={p} />
            ))}
          </div>

          <div className="flex flex-col items-center gap-3 pt-4 text-xs text-muted-foreground">
            <Pagination
              currentPage={result.page}
              totalPages={result.totalPages}
              basePath="/parlamentares"
              searchParams={activeFilters}
            />
            <p>
              Mostrando {result.items.length} de {result.total} resultados — página {result.page}{' '}
              de {result.totalPages}
            </p>
          </div>
        </>
      )}
    </main>
  );
}
