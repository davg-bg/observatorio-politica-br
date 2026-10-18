import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AnaliseTab } from '@/components/profile/analise-tab';
import { DadosPessoais } from '@/components/profile/dados-pessoais';
import { EmendasTab } from '@/components/profile/emendas-tab';
import { FavoritarParlamentar } from '@/components/favoritos/favoritar-parlamentar';
import { FutureTab } from '@/components/profile/future-tab';
import { MandatosTimeline } from '@/components/profile/mandatos-timeline';
import { RedesSociaisList } from '@/components/profile/redes-sociais-list';
import { VotacoesTab } from '@/components/profile/votacoes-tab';
import { getEmendasDoParlamentar } from '@/lib/queries/emendas';
import { getAnaliseParlamentar, getVotosDoParlamentar } from '@/lib/queries/votacoes';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SourceBadge } from '@/components/ui/source-badge';
import { UrlTabs } from '@/components/url-tabs';
import { formatRelativeDate } from '@/lib/utils';
import {
  getParlamentarById,
  sourceUrl,
  type ParlamentarDetalhe,
} from '@/lib/queries/parlamentares';
import { ExternalLink, FileText } from 'lucide-react';

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const p = await getParlamentarById(id);
  if (!p) return { title: 'Parlamentar não encontrado' };
  const casaLabel = p.casa === 'camara' ? 'Deputado(a) Federal' : 'Senador(a)';
  const partidoUf = [p.partido?.sigla, p.uf?.sigla].filter(Boolean).join('-');
  return {
    title: `${p.nome} (${partidoUf}) — ${casaLabel}`,
    description: `Perfil completo de ${p.nome} com biografia, mandatos e redes sociais oficiais.`,
  };
}

const TABS = [
  { key: 'visao-geral', label: 'Visão geral' },
  { key: 'votacoes', label: 'Votações' },
  { key: 'analise', label: 'Análise' },
  { key: 'emendas', label: 'Emendas' },
  { key: 'proposicoes', label: 'Proposições', disabled: true },
] as const;

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function ParlamentarPerfilPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = pickString(sp.tab) ?? 'visao-geral';

  const parlamentar = await getParlamentarById(id);
  if (!parlamentar) notFound();

  return (
    <main className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Início
        </Link>
        <span>/</span>
        <Link href="/parlamentares" className="hover:text-foreground">
          Parlamentares
        </Link>
        <span>/</span>
        <span className="truncate">{parlamentar.nome}</span>
      </nav>

      <ProfileHeader parlamentar={parlamentar} />

      <UrlTabs
        tabs={[...TABS]}
        activeKey={tab}
        basePath={`/parlamentares/${parlamentar.id}`}
      />

      {tab === 'visao-geral' && <VisaoGeralTab parlamentar={parlamentar} />}
      {tab === 'votacoes' && <VotacoesTabWrapper parlamentarId={parlamentar.id} />}
      {tab === 'analise' && <AnaliseTabWrapper parlamentarId={parlamentar.id} />}
      {tab === 'emendas' && <EmendasTabWrapper parlamentarId={parlamentar.id} />}
      {tab === 'proposicoes' && (
        <FutureTab
          icon={<FileText className="h-10 w-10" />}
          title="Proposições de autoria"
          description="PLs, PECs e requerimentos propostos por este parlamentar, com status de tramitação."
          phase="Fase 2"
        />
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <SourceBadge source="api-oficial" />
          <span>Dados atualizados {formatRelativeDate(parlamentar.atualizadoEm)}</span>
        </div>
        <a
          href={sourceUrl(parlamentar.casa, parlamentar.sourceId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
        >
          Página oficial
          <ExternalLink className="h-3 w-3" />
        </a>
      </footer>
    </main>
  );
}

function ProfileHeader({ parlamentar: p }: { parlamentar: ParlamentarDetalhe }) {
  const casaLabel = p.casa === 'camara' ? 'Deputado(a) Federal' : 'Senador(a)';
  return (
    <header className="flex flex-col gap-6 rounded-xl border bg-card p-6 shadow-sm sm:flex-row sm:items-start">
      <Avatar
        src={p.fotoUrl}
        alt={p.nome}
        fallback={p.nome
          .split(/\s+/)
          .filter(Boolean)
          .map((n) => n[0])
          .slice(0, 2)
          .join('')}
        className="h-28 w-28 sm:h-32 sm:w-32"
      />
      <div className="flex-1 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-muted-foreground">{casaLabel}</div>
            <h1 className="text-3xl font-bold tracking-tight">{p.nome}</h1>
            {p.nomeCivil && p.nomeCivil !== p.nome && (
              <p className="text-sm text-muted-foreground">{p.nomeCivil}</p>
            )}
          </div>
          <FavoritarParlamentar parlamentarId={p.id} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.partido && (
            <Badge variant="secondary" className="font-mono text-sm">
              {p.partido.sigla}
            </Badge>
          )}
          {p.uf && (
            <Badge variant="outline">
              {p.uf.sigla} · {p.uf.regiao}
            </Badge>
          )}
          {p.situacao && (
            <Badge variant={p.emExercicio ? 'success' : 'outline'}>{p.situacao}</Badge>
          )}
        </div>
      </div>
    </header>
  );
}

async function VotacoesTabWrapper({ parlamentarId }: { parlamentarId: string }) {
  const votos = await getVotosDoParlamentar(parlamentarId, 30);
  return <VotacoesTab votos={votos} />;
}

async function AnaliseTabWrapper({ parlamentarId }: { parlamentarId: string }) {
  const analise = await getAnaliseParlamentar(parlamentarId, 365);
  return <AnaliseTab analise={analise} />;
}

async function EmendasTabWrapper({ parlamentarId }: { parlamentarId: string }) {
  const resumo = await getEmendasDoParlamentar(parlamentarId);
  return <EmendasTab resumo={resumo} />;
}

function VisaoGeralTab({ parlamentar: p }: { parlamentar: ParlamentarDetalhe }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados pessoais</CardTitle>
        </CardHeader>
        <CardContent>
          <DadosPessoais parlamentar={p} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Redes e contato</CardTitle>
        </CardHeader>
        <CardContent>
          <RedesSociaisList redes={p.redes} website={p.site} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Mandatos</CardTitle>
        </CardHeader>
        <CardContent>
          <MandatosTimeline mandatos={p.mandatos} />
        </CardContent>
      </Card>
    </div>
  );
}
