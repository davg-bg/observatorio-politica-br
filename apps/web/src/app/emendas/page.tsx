import type { Metadata } from 'next';
import Link from 'next/link';

import { EmendaCard } from '@/components/emendas/emenda-card';
import { RankingTable } from '@/components/emendas/ranking-table';
import { EmptyState } from '@/components/empty-state';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { SourceBadge } from '@/components/ui/source-badge';
import { formatBRL } from '@/lib/utils';
import {
  getEmendasStats,
  getRankingEmendadores,
  listEmendas,
} from '@/lib/queries/emendas';
import { Database, Megaphone, Search, X } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Emendas parlamentares — Observatório',
  description:
    'Ranking de emendas parlamentares por autor, com valores executados vindos do Portal da Transparência.',
};

export const revalidate = 3600;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function EmendasPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const stats = await getEmendasStats();

  const anoParam = pickString(sp.ano);
  const ano = anoParam
    ? parseInt(anoParam, 10)
    : stats.anoCorrente ?? new Date().getFullYear();
  const tipo = pickString(sp.tipo);
  const autor = pickString(sp.autor);
  const pageRaw = pickString(sp.page);
  const page = pageRaw ? Math.max(1, parseInt(pageRaw, 10) || 1) : 1;

  const activeFilters = { ano: String(ano), tipo, autor };
  const hasFilter = Boolean(tipo || autor);

  const [ranking, listResult] = await Promise.all([
    getRankingEmendadores(ano, 20),
    listEmendas({ ano, tipoEmenda: tipo, autor, page }),
  ]);

  return (
    <main className="container mx-auto max-w-6xl space-y-6 px-4 py-10">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Início
        </Link>
        <span>/</span>
        <span>Emendas</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Emendas parlamentares</h1>
          <p className="max-w-2xl text-muted-foreground">
            Dotações destinadas por parlamentares individualmente ou por bancadas, com valores
            executados pelo governo federal.
          </p>
        </div>
        <SourceBadge source="api-oficial" />
      </header>

      {!listResult.dbConfigured ? (
        <EmptyState
          icon={<Database className="h-10 w-10" />}
          title="Banco não configurado"
          description="Configure DATABASE_URL e rode as migrations."
        />
      ) : stats.anosDisponiveis.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" />}
          title="Nenhuma emenda ingerida ainda"
          description={
            <>
              Rode o ETL de emendas:{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                cd services/etl && uv run etl run transparencia-emendas
              </code>
              <br />
              Requer{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                TRANSPARENCIA_API_TOKEN
              </code>{' '}
              no .env (cadastro gratuito).
            </>
          }
        />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Ano" valor={String(ano)} secondary="selecionado" />
            <StatCard
              label="Total pago"
              valor={formatBRL(stats.totalPagoAno)}
              secondary={`em ${stats.numEmendasAno} emendas`}
            />
            <StatCard
              label="Total empenhado"
              valor={formatBRL(stats.totalEmpenhadoAno)}
              secondary="recursos reservados"
            />
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Ano:</span>
            {stats.anosDisponiveis.map((a) => (
              <Button
                key={a}
                asChild
                variant={a === ano ? 'default' : 'outline'}
                size="sm"
              >
                <Link href={`/emendas?ano=${a}`}>{a}</Link>
              </Button>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top 20 autores em {ano}</CardTitle>
            </CardHeader>
            <CardContent>
              <RankingTable ranking={ranking} />
              <p className="pt-2 text-xs text-muted-foreground">
                Apenas emendas vinculadas a parlamentares com match confirmado por nome.
                Emendas de bancada e autor desconhecido aparecem na lista completa abaixo.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Todas as emendas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                method="GET"
                action="/emendas"
                className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]"
              >
                <input type="hidden" name="ano" value={ano} />
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    name="autor"
                    placeholder="Buscar por autor…"
                    defaultValue={autor ?? ''}
                    className="pl-8"
                    aria-label="Buscar autor"
                  />
                </div>
                <NativeSelect name="tipo" defaultValue={tipo ?? ''} aria-label="Tipo">
                  <option value="">Todos os tipos</option>
                  {stats.tiposDisponiveis.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </NativeSelect>
                <div className="flex items-center gap-2">
                  <Button type="submit">Filtrar</Button>
                  {hasFilter && (
                    <Button type="button" variant="ghost" size="icon" asChild>
                      <Link href={`/emendas?ano=${ano}`} aria-label="Limpar">
                        <X className="h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </div>
              </form>

              {listResult.items.length === 0 ? (
                <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhuma emenda corresponde aos filtros.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    {listResult.items.map((e) => (
                      <EmendaCard key={e.id} emenda={e} />
                    ))}
                  </div>
                  <div className="flex flex-col items-center gap-2 pt-2 text-xs text-muted-foreground">
                    <Pagination
                      currentPage={listResult.page}
                      totalPages={listResult.totalPages}
                      basePath="/emendas"
                      searchParams={activeFilters}
                    />
                    <p>
                      {listResult.total.toLocaleString('pt-BR')} emendas · página{' '}
                      {listResult.page} de {listResult.totalPages}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <footer className="border-t pt-4 text-xs text-muted-foreground">
        Fonte: Portal da Transparência da CGU (api.portaldatransparencia.gov.br). Valores em
        reais, atualizados conforme a execução orçamentária do governo federal.
      </footer>
    </main>
  );
}

function StatCard({
  label,
  valor,
  secondary,
}: {
  label: string;
  valor: string;
  secondary: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="font-mono text-2xl font-bold">{valor}</div>
        <p className="text-xs text-muted-foreground">{secondary}</p>
        {/* Badge para quando o valor é "0" */}
        {valor === 'R$ 0' && <Badge variant="outline">sem dados</Badge>}
      </CardContent>
    </Card>
  );
}
