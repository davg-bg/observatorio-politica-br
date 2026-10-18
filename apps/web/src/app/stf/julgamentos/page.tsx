import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { SourceBadge } from '@/components/ui/source-badge';
import {
  computeJulgStats,
  listJulgamentosSTF,
  resultadoLabel,
  type JulgamentoSTFItem,
} from '@/lib/queries/stf-julgamentos';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Flame,
  Gavel,
  Scale,
  Users,
  UserX,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'STF — Julgamentos (experimental)',
  description:
    'Julgamentos recentes do STF extraídos do Portal de Notícias. Dados experimentais — podem conter erros.',
};

export const revalidate = 3600;

export default async function StfJulgamentosPage() {
  const julgamentos = await listJulgamentosSTF({ limit: 50 });
  const stats = computeJulgStats(julgamentos);

  return (
    <main className="container mx-auto max-w-5xl space-y-6 px-4 py-10">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Início
        </Link>
        <span>/</span>
        <Link href="/stf" className="hover:text-foreground">
          STF
        </Link>
        <span>/</span>
        <span>Julgamentos</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Julgamentos recentes do STF
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Decisões recentes com alinhamento inferido dos ministros a partir das
            notícias oficiais. Dados experimentais — podem conter erros.
          </p>
        </div>
        <SourceBadge source="scraping" />
      </header>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              Aviso: dados experimentais extraídos por scraping
            </p>
            <p className="text-amber-900/80 dark:text-amber-200/90">
              Os ministros vencedores/vencidos são{' '}
              <strong>inferência textual</strong> das notícias publicadas em{' '}
              <code className="rounded bg-amber-100 px-1 font-mono text-[11px] dark:bg-amber-900/40">
                noticias.stf.jus.br
              </code>
              . Para consulta oficial, use sempre o link para o processo no portal
              do STF em cada card. O índice de confiança indica quantos campos
              foram extraídos — menos de 70 significa que a inferência é
              particularmente incompleta.
            </p>
          </div>
        </div>
      </section>

      {julgamentos.length === 0 ? (
        <EmptyState
          icon={<Scale className="h-10 w-10" />}
          title="Nenhum julgamento ingerido ainda"
          description={
            <>
              Rode:{' '}
              <code className="rounded bg-muted px-1 font-mono text-xs">
                uv run etl run stf-julgamentos
              </code>
            </>
          }
        />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-4">
            <StatCard label="Julgamentos" value={stats.total.toString()} />
            <StatCard label="Por unanimidade" value={stats.unanimes.toString()} />
            <StatCard
              label="Com placar inferido"
              value={stats.comPlacar.toString()}
            />
            <StatCard
              label="Confiança ≥ 70%"
              value={`${stats.pctConfiancaAlta}%`}
            />
          </section>

          <section className="space-y-3">
            {julgamentos.map((j) => (
              <JulgamentoCard key={j.id} j={j} />
            ))}
          </section>
        </>
      )}

      <footer className="border-t pt-4 text-xs text-muted-foreground">
        Fonte: <code className="font-mono">noticias.stf.jus.br/wp-json/wp/v2/posts</code>.
        Parser aberto em{' '}
        <code className="font-mono">services/etl/etl/sources/stf/julgamentos.py</code>.
        Atualizado semanalmente via GitHub Actions.
      </footer>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function JulgamentoCard({ j }: { j: JulgamentoSTFItem }) {
  const data = new Date(j.dataPublicacao).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  });
  const processo =
    j.processoClasse && j.processoNumero ? `${j.processoClasse} ${j.processoNumero}` : null;

  return (
    <Card className="p-4">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="font-medium leading-tight">{j.titulo}</h2>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {processo && (
                <Badge variant="secondary" className="font-mono">
                  <Gavel className="mr-1 h-3 w-3" />
                  {processo}
                </Badge>
              )}
              {j.temaRepercussaoGeral && (
                <Badge variant="outline" className="font-mono">
                  {j.temaRepercussaoGeral}
                </Badge>
              )}
              <ResultadoBadge resultado={j.resultado} unanime={j.foiUnanime} />
              {j.tipoSessao && (
                <Badge variant="outline">
                  {j.tipoSessao === 'virtual' ? 'Virtual' : 'Presencial'}
                </Badge>
              )}
              <span className="text-muted-foreground">{data}</span>
            </div>
          </div>
          <ConfiancaBadge valor={j.confiancaParsing} />
        </div>

        <p className="text-sm text-muted-foreground">{j.resumo}</p>

        {/* Ministros */}
        {(j.ministrosVencedores.length > 0 ||
          j.ministrosVencidos.length > 0 ||
          j.ministrosImpedidos.length > 0) && (
          <div className="space-y-1.5 border-t pt-2 text-xs">
            {j.ministrosVencedores.length > 0 && (
              <ListaMinistros
                icon={<CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                label={j.foiUnanime ? 'Participaram' : 'Prevaleceu com'}
                ministros={j.ministrosVencedores}
                color="text-emerald-700 dark:text-emerald-400"
              />
            )}
            {j.ministrosVencidos.length > 0 && (
              <ListaMinistros
                icon={<Users className="h-3 w-3 text-rose-600" />}
                label="Divergiram"
                ministros={j.ministrosVencidos}
                color="text-rose-700 dark:text-rose-400"
              />
            )}
            {j.ministrosImpedidos.length > 0 && (
              <ListaMinistros
                icon={<UserX className="h-3 w-3 text-slate-500" />}
                label="Impedidos/não participaram"
                ministros={j.ministrosImpedidos}
                color="text-slate-500 dark:text-slate-400"
              />
            )}
          </div>
        )}

        {/* Tese */}
        {j.teseFixada && (
          <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-2 text-xs italic text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
            <div className="mb-0.5 flex items-center gap-1 not-italic font-semibold">
              <Flame className="h-3 w-3" />
              Tese fixada
            </div>
            {j.teseFixada}
          </div>
        )}

        {/* Links */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-xs">
          <a
            href={j.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
          >
            Notícia original <ExternalLink className="h-3 w-3" />
          </a>
          {j.processoUrlOficial && (
            <a
              href={j.processoUrlOficial}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
            >
              Processo no portal do STF <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}

function ResultadoBadge({
  resultado,
  unanime,
}: {
  resultado: string | null;
  unanime: boolean;
}) {
  if (unanime) {
    return <Badge variant="success">Unanimidade</Badge>;
  }
  if (resultado === 'maioria') {
    return <Badge variant="default">Maioria</Badge>;
  }
  if (resultado === 'modulada') {
    return <Badge variant="warning">Modulada</Badge>;
  }
  return <Badge variant="outline">{resultadoLabel(resultado)}</Badge>;
}

function ConfiancaBadge({ valor }: { valor: number }) {
  const tone =
    valor >= 70
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
      : valor >= 40
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
        : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200';
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] ${tone}`}
      title="Score de confiança do parser (quantos campos foram extraídos)"
    >
      conf. {valor}
    </span>
  );
}

function ListaMinistros({
  icon,
  label,
  ministros,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  ministros: string[];
  color: string;
}) {
  return (
    <div className="flex flex-wrap items-start gap-1">
      <span className={`flex items-center gap-1 font-semibold ${color}`}>
        {icon}
        {label}:
      </span>
      <span className="text-muted-foreground">{ministros.join(', ')}</span>
    </div>
  );
}
