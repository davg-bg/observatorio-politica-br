import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { SourceBadge } from '@/components/ui/source-badge';
import {
  computeStfStats,
  listMinistrosSTF,
  type MinistroSTFItem,
} from '@/lib/queries/stf';
import { Scale, Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'STF — Observatório',
  description:
    'Composição atual do Supremo Tribunal Federal: ministros, data de posse, presidente que indicou e data de aposentadoria compulsória.',
};

export const revalidate = 3600;

export default async function StfPage() {
  const ministros = await listMinistrosSTF();
  const stats = computeStfStats(ministros);

  return (
    <main className="container mx-auto max-w-6xl space-y-6 px-4 py-10">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Início
        </Link>
        <span>/</span>
        <span>STF</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Supremo Tribunal Federal</h1>
          <p className="max-w-2xl text-muted-foreground">
            Composição atual, origem política das indicações e horizonte de renovação
            por aposentadoria compulsória (75 anos).
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <Link
              href="/stf/julgamentos"
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-accent"
            >
              Julgamentos recentes
              <span className="rounded bg-amber-100 px-1 font-mono text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                experimental
              </span>
            </Link>
            <Link
              href="/agenda"
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-accent"
            >
              Agenda do plenário
            </Link>
          </div>
        </div>
        <SourceBadge source="manual" />
      </header>

      {ministros.length === 0 ? (
        <EmptyState
          icon={<Scale className="h-10 w-10" />}
          title="Composição não ingerida"
          description={
            <>
              Rode:{' '}
              <code className="rounded bg-muted px-1 font-mono text-xs">
                uv run etl run stf-composicao
              </code>
            </>
          }
        />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Em exercício" value={`${stats.emExercicio} de 11`} />
            <StatCard
              label="Vagas abertas"
              value={stats.vagas.toString()}
              tone={stats.vagas > 0 ? 'warning' : 'default'}
            />
            <StatCard
              label="Idade média"
              value={stats.idadeMediaAnos ? `${stats.idadeMediaAnos} anos` : '—'}
            />
            <StatCard
              label="Próx. aposentadoria"
              value={
                stats.anosParaProximaAposentadoria != null
                  ? `em ${stats.anosParaProximaAposentadoria} ano(s)`
                  : '—'
              }
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Users className="h-5 w-5" />
                Composição atual
              </h2>
              <Badge variant="outline">por antiguidade</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ministros.map((m) => (
                <MinistroCard key={m.id} m={m} />
              ))}
            </div>
          </section>

          {stats.vagas > 0 && (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30">
              <p className="font-semibold">
                {stats.vagas === 1 ? 'Uma vaga aberta' : `${stats.vagas} vagas abertas`}
              </p>
              <p className="text-muted-foreground">
                Cadeira de Luís Roberto Barroso, aposentado em 16/10/2025. A indicação
                de Jorge Messias foi rejeitada pelo Senado em abril de 2026 (42×34),
                primeiro caso de rejeição desde 1894.
              </p>
            </section>
          )}
        </>
      )}

      <footer className="space-y-2 border-t pt-4 text-xs text-muted-foreground">
        <p>
          Fonte: curadoria manual baseada no{' '}
          <a
            href="https://portal.stf.jus.br/ostf/ministros/ministro.asp?periodo=STF"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            portal do STF
          </a>
          . Atualizações dependem de edição de{' '}
          <code className="rounded bg-muted px-1 font-mono text-[11px]">
            services/etl/etl/sources/stf/ministros_data.py
          </code>
          .
        </p>
        <p>
          A agenda do plenário e os votos individuais virão em iterações seguintes
          (Tasks 25 e 26) — scraping deliberadamente leve, com badge de aviso.
        </p>
      </footer>
    </main>
  );
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={`text-xl font-semibold ${
            tone === 'warning' ? 'text-amber-700 dark:text-amber-400' : ''
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function MinistroCard({ m }: { m: MinistroSTFItem }) {
  const iniciais = m.nome
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const idade = m.dataNascimento ? calcularIdade(m.dataNascimento) : null;
  const aposent = m.dataAposentadoriaCompulsoria
    ? new Date(m.dataAposentadoriaCompulsoria).getFullYear()
    : null;

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start gap-3">
          <Avatar
            src={m.fotoUrl}
            alt={m.nome}
            fallback={iniciais}
            className="h-12 w-12"
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="truncate font-medium leading-tight">{m.nome}</div>
            {m.nomeCompleto && m.nomeCompleto !== m.nome && (
              <div className="truncate text-xs text-muted-foreground">
                {m.nomeCompleto}
              </div>
            )}
            <div className="flex items-center gap-1 pt-1">
              {m.cargoAtual === 'presidente' && (
                <Badge variant="default" className="text-[10px]">
                  Presidente
                </Badge>
              )}
              {m.cargoAtual === 'vice-presidente' && (
                <Badge variant="secondary" className="text-[10px]">
                  Vice-presidente
                </Badge>
              )}
              {m.ordemAntiguidade != null && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  #{m.ordemAntiguidade}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Posse</dt>
          <dd className="font-mono text-right">
            {new Date(m.dataPosse).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
          </dd>

          <dt className="text-muted-foreground">Indicação</dt>
          <dd className="text-right truncate">{m.presidenteIndicou}</dd>

          {idade != null && (
            <>
              <dt className="text-muted-foreground">Idade</dt>
              <dd className="text-right">{idade} anos</dd>
            </>
          )}

          {aposent != null && (
            <>
              <dt className="text-muted-foreground">Aposent. em</dt>
              <dd className="font-mono text-right">{aposent}</dd>
            </>
          )}
        </dl>

        {m.formacaoAcademica && (
          <p className="line-clamp-2 border-t pt-2 text-[11px] text-muted-foreground">
            {m.formacaoAcademica}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function calcularIdade(dataIso: string): number {
  const nasc = new Date(dataIso);
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade -= 1;
  return idade;
}
