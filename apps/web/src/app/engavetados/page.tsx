import type { Metadata } from 'next';
import Link from 'next/link';

import { EngavetadoCard } from '@/components/engavetados/engavetado-card';
import { EmptyState } from '@/components/empty-state';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { SourceBadge } from '@/components/ui/source-badge';
import {
  getEngavetadosStats,
  listEngavetados,
} from '@/lib/queries/engavetados';
import { Archive, Database, Search, X } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Engavetados — Observatório',
  description:
    'Projetos de lei parados há mais de 180 dias sem tramitação, com filtros por tema e autor.',
};

export const revalidate = 3600;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function EngavetadosPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const casa = pickString(sp.casa);
  const tema = pickString(sp.tema);
  const autor = pickString(sp.autor);
  const minDiasRaw = pickString(sp.minDias);
  const minDias = minDiasRaw ? parseInt(minDiasRaw, 10) || 180 : 180;
  const pageRaw = pickString(sp.page);
  const page = pageRaw ? Math.max(1, parseInt(pageRaw, 10) || 1) : 1;

  const activeFilters = {
    casa,
    tema,
    autor,
    minDias: String(minDias),
  };
  const hasFilter = Boolean(casa || tema || autor || minDiasRaw);

  const [stats, result] = await Promise.all([
    getEngavetadosStats(),
    listEngavetados({
      casa: casa === 'camara' || casa === 'senado' ? casa : undefined,
      tema,
      autor,
      minDias,
      page,
    }),
  ]);

  return (
    <main className="container mx-auto max-w-6xl space-y-6 px-4 py-10">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Início
        </Link>
        <span>/</span>
        <span>Engavetados</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projetos engavetados</h1>
          <p className="max-w-2xl text-muted-foreground">
            Proposições parados há mais de 180 dias sem tramitação, apresentados há mais
            de 1 ano e ainda não arquivados.
          </p>
        </div>
        <SourceBadge source="api-oficial" />
      </header>

      {!result.dbConfigured ? (
        <EmptyState
          icon={<Database className="h-10 w-10" />}
          title="Banco não configurado"
          description="Configure DATABASE_URL e rode as migrations."
        />
      ) : !result.viewAvailable || stats.total === 0 ? (
        <EmptyState
          icon={<Archive className="h-10 w-10" />}
          title="Nenhuma proposição engavetada registrada"
          description={
            <>
              Aplique a migration 0005 e rode o ETL de proposições:
              <br />
              <code className="rounded bg-muted px-1 font-mono text-xs">
                cd services/etl && uv run etl migrate && uv run etl run camara-proposicoes
              </code>
            </>
          }
        />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-4">
            <StatCard label="Total" valor={stats.total.toLocaleString('pt-BR')} />
            <StatCard
              label="Câmara"
              valor={stats.totalCamara.toLocaleString('pt-BR')}
              hint={`${pctOf(stats.totalCamara, stats.total)}% do total`}
            />
            <StatCard
              label="Senado"
              valor={stats.totalSenado.toLocaleString('pt-BR')}
              hint={`${pctOf(stats.totalSenado, stats.total)}% do total`}
            />
            <StatCard
              label="Média parado"
              valor={`${stats.mediaDiasParado} dias`}
              hint={`~${(stats.mediaDiasParado / 365).toFixed(1)} anos`}
            />
          </section>

          <form
            method="GET"
            action="/engavetados"
            className="grid gap-2 rounded-lg border bg-card p-4 shadow-sm sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
          >
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
            <NativeSelect name="casa" defaultValue={casa ?? ''} aria-label="Casa">
              <option value="">Todas as casas</option>
              <option value="camara">Câmara</option>
              <option value="senado">Senado</option>
            </NativeSelect>
            <NativeSelect name="tema" defaultValue={tema ?? ''} aria-label="Tema">
              <option value="">Todos os temas</option>
              {stats.temasDisponiveis.map((t) => (
                <option key={t.tema} value={t.tema}>
                  {t.tema} ({t.count})
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              name="minDias"
              defaultValue={String(minDias)}
              aria-label="Tempo mínimo parado"
            >
              <option value="180">6 meses</option>
              <option value="365">1 ano</option>
              <option value="730">2 anos</option>
              <option value="1095">3 anos</option>
              <option value="1825">5 anos</option>
            </NativeSelect>
            <div className="flex items-center gap-2">
              <Button type="submit">Filtrar</Button>
              {hasFilter && (
                <Button type="button" variant="ghost" size="icon" asChild>
                  <Link href="/engavetados" aria-label="Limpar">
                    <X className="h-4 w-4" />
                  </Link>
                </Button>
              )}
            </div>
          </form>

          {result.items.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma proposição corresponde aos filtros.
            </p>
          ) : (
            <>
              <div className="space-y-3">
                {result.items.map((item) => (
                  <EngavetadoCard key={item.proposicaoId} item={item} />
                ))}
              </div>

              <div className="flex flex-col items-center gap-2 pt-4 text-xs text-muted-foreground">
                <Pagination
                  currentPage={result.page}
                  totalPages={result.totalPages}
                  basePath="/engavetados"
                  searchParams={activeFilters}
                />
                <p>
                  {result.total.toLocaleString('pt-BR')} engavetados · página{' '}
                  {result.page} de {result.totalPages}
                </p>
              </div>
            </>
          )}
        </>
      )}

      <footer className="border-t pt-4 text-xs text-muted-foreground">
        Fonte: Câmara dos Deputados. Metodologia: proposições com data_ultima_tramitacao
        &gt; 180 dias atrás, apresentação &gt; 1 ano atrás, e situação não arquivada.
      </footer>
    </main>
  );
}

function StatCard({
  label,
  valor,
  hint,
}: {
  label: string;
  valor: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="font-mono text-2xl font-bold">{valor}</div>
        {hint && (
          <p className="text-xs text-muted-foreground">
            <Badge variant="outline" className="font-normal">
              {hint}
            </Badge>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function pctOf(part: number, total: number): string {
  if (total === 0) return '0';
  return ((part / total) * 100).toFixed(0);
}
