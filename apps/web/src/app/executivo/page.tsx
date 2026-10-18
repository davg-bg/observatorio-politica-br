import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { SourceBadge } from '@/components/ui/source-badge';
import {
  listMedidasProvisorias,
  listMinistrosAtuais,
  type MedidaProvisoria,
  type MinistroItem,
} from '@/lib/queries/executivo';
import { Building2, FileText, Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Executivo — Observatório',
  description:
    'Composição ministerial e Medidas Provisórias em tramitação no governo federal.',
};

export const revalidate = 3600;

export default async function ExecutivoPage() {
  const [ministros, mps] = await Promise.all([
    listMinistrosAtuais(),
    listMedidasProvisorias(50),
  ]);

  return (
    <main className="container mx-auto max-w-6xl space-y-6 px-4 py-10">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Início
        </Link>
        <span>/</span>
        <span>Executivo</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Executivo federal</h1>
          <p className="max-w-2xl text-muted-foreground">
            Composição ministerial atual e Medidas Provisórias em tramitação.
          </p>
        </div>
        <SourceBadge source="manual" />
      </header>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Users className="h-5 w-5" />
            Composição ministerial
          </h2>
          <Badge variant="outline">{ministros.length} pastas</Badge>
        </div>
        {ministros.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-10 w-10" />}
            title="Composição não ingerida"
            description={
              <>
                Rode:{' '}
                <code className="rounded bg-muted px-1 font-mono text-xs">
                  uv run etl run executivo-ministros
                </code>
              </>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ministros.map((m) => (
              <MinistroCard key={m.id} m={m} />
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Fonte: curadoria manual da equipe baseada em publicações do DOU. Atualizações
          dependem de edição do arquivo{' '}
          <code className="rounded bg-muted px-1 font-mono text-xs">
            services/etl/etl/sources/executivo/ministros_data.py
          </code>
          .
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <FileText className="h-5 w-5" />
            Medidas Provisórias em tramitação
          </h2>
          <Badge variant="outline">{mps.length} ativas</Badge>
        </div>
        {mps.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-10 w-10" />}
            title="Nenhuma MP ingerida"
            description={
              <>
                Rode o ETL de MPs:{' '}
                <code className="rounded bg-muted px-1 font-mono text-xs">
                  uv run etl run camara-mps
                </code>
                . Pode levar alguns minutos para completar.
              </>
            }
          />
        ) : (
          <div className="space-y-2">
            {mps.map((mp) => (
              <MPCard key={mp.id} mp={mp} />
            ))}
          </div>
        )}
      </section>

      <footer className="border-t pt-4 text-xs text-muted-foreground">
        Decretos presidenciais e portarias ficam fora do escopo atual — exigem integração
        com INLABS (Imprensa Nacional). Previsto como follow-up.
      </footer>
    </main>
  );
}

function MinistroCard({ m }: { m: MinistroItem }) {
  const iniciais = m.nome
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <Avatar src={m.fotoUrl} alt={m.nome} fallback={iniciais} className="h-12 w-12" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="truncate font-medium leading-tight">{m.nome}</div>
          <div className="text-xs text-muted-foreground">{m.orgaoNome}</div>
          <div className="flex items-center gap-1 pt-0.5">
            <Badge variant="outline" className="font-mono text-[10px]">
              {m.orgaoSigla}
            </Badge>
            {m.partidoSigla && (
              <Badge variant="secondary" className="font-mono text-[10px]">
                {m.partidoSigla}
              </Badge>
            )}
            {m.siteOficial && (
              <a
                href={m.siteOficial}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 text-[10px] text-muted-foreground hover:text-foreground hover:underline"
              >
                site →
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MPCard({ mp }: { mp: MedidaProvisoria }) {
  const label = `MPV ${mp.numero}/${mp.ano}`;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="font-mono">
              {label}
            </Badge>
            <StatusBadge status={mp.statusResumido} />
            {mp.siglaOrgaoAtual && (
              <Badge variant="secondary" className="font-mono">
                {mp.siglaOrgaoAtual}
              </Badge>
            )}
          </div>
          <p className="line-clamp-2 text-sm leading-snug">{mp.ementa}</p>
          {mp.descricaoSituacao && (
            <p className="text-xs text-muted-foreground">{mp.descricaoSituacao}</p>
          )}
        </div>
        <div className="shrink-0 text-right text-xs text-muted-foreground">
          {mp.dataApresentacao && (
            <div>
              Apresentada em{' '}
              {new Date(mp.dataApresentacao).toLocaleDateString('pt-BR', {
                timeZone: 'UTC',
              })}
            </div>
          )}
          {mp.dataVigenciaEstimada && (
            <div>
              Vigência est.{' '}
              <span className="font-mono">
                {new Date(mp.dataVigenciaEstimada).toLocaleDateString('pt-BR', {
                  timeZone: 'UTC',
                })}
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: MedidaProvisoria['statusResumido'] }) {
  const map: Record<MedidaProvisoria['statusResumido'], { label: string; variant: 'default' | 'destructive' | 'warning' | 'success' | 'outline' }> = {
    em_tramitacao: { label: 'Em tramitação', variant: 'default' },
    possivel_caduca: { label: 'Pode caducar', variant: 'warning' },
    caducou: { label: 'Caducou', variant: 'destructive' },
    convertida_em_lei: { label: 'Convertida em lei', variant: 'success' },
    arquivada: { label: 'Arquivada', variant: 'outline' },
  };
  const info = map[status] ?? map.em_tramitacao;
  return <Badge variant={info.variant}>{info.label}</Badge>;
}
