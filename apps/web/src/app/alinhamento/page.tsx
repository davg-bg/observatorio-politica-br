import type { Metadata } from 'next';
import Link from 'next/link';

import { CoesaoCard } from '@/components/alinhamento/coesao-sidebar';
import { MatrizAlinhamento } from '@/components/alinhamento/matriz';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SourceBadge } from '@/components/ui/source-badge';
import {
  JANELAS,
  checkAlinhamentoAvailable,
  listAlinhamento,
  listCoesao,
  parseJanela,
} from '@/lib/queries/alinhamento';
import { BarChart3, Info } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Alinhamento partidário — Observatório',
  description:
    'Matriz de similaridade cosseno entre partidos e coesão interna (Índice de Rice).',
};

export const revalidate = 3600;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function AlinhamentoPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const janela = parseJanela(pickString(sp.janela));

  const avail = await checkAlinhamentoAvailable();
  if (!avail.available) {
    return <NotAvailable reason={avail.reason} />;
  }

  const [pares, coesao] = await Promise.all([listAlinhamento(janela), listCoesao(janela)]);
  const semDados = pares.length === 0 && coesao.length === 0;

  return (
    <main className="container mx-auto max-w-6xl space-y-6 px-4 py-10">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Início
        </Link>
        <span>/</span>
        <span>Alinhamento</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Alinhamento partidário</h1>
          <p className="max-w-2xl text-muted-foreground">
            Com que frequência cada partido vota igual aos demais, e quão coeso é
            internamente. Dados derivados dos votos nominais ingeridos.
          </p>
        </div>
        <SourceBadge source="api-oficial" />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Janela:</span>
        {JANELAS.map((j) => (
          <Button
            key={j.value}
            asChild
            variant={j.value === janela ? 'default' : 'outline'}
            size="sm"
          >
            <Link href={`/alinhamento?janela=${j.value}`}>{j.label}</Link>
          </Button>
        ))}
      </div>

      {semDados ? (
        <EmptyState
          icon={<BarChart3 className="h-10 w-10" />}
          title="Sem dados nesta janela"
          description="Rode o ETL de votações (etl run camara-votacoes) e dê refresh nas views (etl refresh-views)."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">
              Matriz de concordância (% de votações iguais)
            </h2>
            <MatrizAlinhamento pares={pares} />
            <Legenda />
          </section>

          <aside>
            <CoesaoCard partidos={coesao} titulo="Coesão interna" />
          </aside>
        </div>
      )}

      <MetodologiaBox />

      <footer className="border-t pt-4 text-xs text-muted-foreground">
        Fontes: dados oficiais da Câmara dos Deputados. Métodologia documentada no
        bloco acima. Pares com menos de 10 votações comuns são omitidos (significância
        estatística baixa).
      </footer>
    </main>
  );
}

function Legenda() {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
      <span className="font-medium">Legenda:</span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded" style={{ background: 'hsl(220 70% 55%)' }} />
        Oposição (0% concordância)
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded bg-muted" />
        Indiferente (50%)
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded" style={{ background: 'hsl(145 60% 55%)' }} />
        Alinhado (100%)
      </span>
    </div>
  );
}

function MetodologiaBox() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="h-4 w-4" />
          Como esses números são calculados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          <strong>Coesão interna (Rice):</strong> em cada votação medimos |Sim − Não| ÷ (Sim +
          Não) para cada partido, só considerando bancadas com pelo menos 5 presentes. Depois
          tiramos a média sobre todas as votações da janela.
        </p>
        <p>
          <strong>Alinhamento entre partidos:</strong> para cada votação atribuímos a cada
          partido uma <em>posição</em> (+1 se maioria Sim, −1 se maioria Não, 0 se dividido ou
          abstenção majoritária). Depois calculamos a similaridade cosseno dos vetores de
          posição por par de partidos — equivale ao coeficiente de concordância Sim/Não.
        </p>
        <p>
          <strong>Por que não &ldquo;sempre vota igual&rdquo; cru?</strong> Porque abstenções e ausências
          significam coisas diferentes dependendo do contexto — isolar só as posições
          decisivas (Sim/Não) elimina ruído e permite comparar partidos de tamanhos diferentes.
        </p>
        <p className="pt-1">
          Código aberto em{' '}
          <code className="rounded bg-background px-1 font-mono text-xs">
            db/migrations/0003_alinhamento.sql
          </code>
          .
        </p>
      </CardContent>
    </Card>
  );
}

function NotAvailable({ reason }: { reason?: string }) {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-16">
      <EmptyState
        icon={<BarChart3 className="h-10 w-10" />}
        title={reason === 'db-not-configured' ? 'Banco não configurado' : 'Views de alinhamento não criadas'}
        description={
          reason === 'db-not-configured' ? (
            'Configure DATABASE_URL e rode as migrations.'
          ) : (
            <>
              Aplique a migration 0003:{' '}
              <code className="rounded bg-muted px-1 font-mono text-xs">
                cd services/etl && uv run etl migrate
              </code>
              , depois rode o ETL de votações e{' '}
              <code className="rounded bg-muted px-1 font-mono text-xs">etl refresh-views</code>.
            </>
          )
        }
      />
    </main>
  );
}
