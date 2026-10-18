import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/empty-state';
import { EventoItem, type AgendaItem } from '@/components/agenda/evento-item';
import { SessaoSTFCard } from '@/components/agenda/stf-pauta';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SourceBadge } from '@/components/ui/source-badge';
import {
  camaraEventoUrl,
  listEventosCamara,
  type EventoCamara,
} from '@/lib/sources/camara';
import { listReunioesSenado, type ReuniaoSenado } from '@/lib/sources/senado';
import { listSessoesSTFPorData } from '@/lib/queries/stf-pautas';
import { ArrowRight, Calendar, RefreshCcw, Scale } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Agenda — Observatório da Política Brasileira',
  description: 'O que está acontecendo hoje no Congresso Nacional.',
};

// Agenda muda rápido — revalida a cada 10 min.
export const revalidate = 600;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function AgendaPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const dataParam = pickString(sp.data);
  const data = dataParam ?? todayIsoDate();

  const [eventosCamara, reunioesSenado, sessoesStf] = await Promise.all([
    listEventosCamara({ dataInicio: data, dataFim: data }),
    listReunioesSenado({ data }),
    listSessoesSTFPorData(data),
  ]);

  const items: AgendaItem[] = [
    ...eventosCamara.map(camaraToItem),
    ...reunioesSenado.map(senadoToItem),
  ].sort((a, b) => a.horario.localeCompare(b.horario));

  // Agrupamento por casa pra visão lado-a-lado.
  const camara = items.filter((i) => i.casa !== 'senado');
  const senado = items.filter((i) => i.casa === 'senado');

  const totalEventos = items.length + sessoesStf.length;

  return (
    <main className="container mx-auto max-w-6xl space-y-6 px-4 py-10">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Início
        </Link>
        <span>/</span>
        <span>Agenda</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agenda do Congresso</h1>
          <p className="text-muted-foreground">
            Sessões plenárias, reuniões de comissões e eventos deliberativos.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <SourceBadge source="api-oficial" />
          <DateSelector current={data} />
        </div>
      </header>

      <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-3 text-sm">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{formatDataLonga(data)}</span>
          <Badge variant="outline">
            {totalEventos} evento{totalEventos === 1 ? '' : 's'}
          </Badge>
        </div>
        <Link
          href={`/agenda?data=${data}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCcw className="h-3 w-3" />
          Atualizar
        </Link>
      </div>

      {totalEventos === 0 ? (
        <EmptyState
          icon={<Calendar className="h-10 w-10" />}
          title="Nenhum evento neste dia"
          description="Pode ser fim de semana, recesso ou simplesmente um dia sem atividade registrada nas APIs oficiais."
          action={
            <Button asChild variant="outline">
              <Link href={`/agenda?data=${proximoDiaUtil(data)}`}>
                Próximo dia útil <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Câmara dos Deputados</h2>
            {camara.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem eventos.</p>
            ) : (
              <div className="space-y-3">
                {camara.map((item) => (
                  <EventoItem key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Senado Federal</h2>
            {senado.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem eventos.</p>
            ) : (
              <div className="space-y-3">
                {senado.map((item) => (
                  <EventoItem key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Scale className="h-4 w-4" />
              STF
            </h2>
            {sessoesStf.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem sessão nesta data.</p>
            ) : (
              <div className="space-y-3">
                {sessoesStf.map((s) => (
                  <SessaoSTFCard key={s.id} sessao={s} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <footer className="border-t pt-4 text-xs text-muted-foreground">
        Fontes: dadosabertos.camara.leg.br/api/v2/eventos,
        legis.senado.leg.br/dadosabertos/agendareuniao e
        portal.stf.jus.br/pauta/services/calendario-service.asp. Página atualiza a cada
        10 min.
      </footer>
    </main>
  );
}

function DateSelector({ current }: { current: string }) {
  const d = new Date(current + 'T00:00:00Z');
  const prev = new Date(d);
  prev.setUTCDate(prev.getUTCDate() - 1);
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + 1);
  const toIso = (x: Date) => x.toISOString().slice(0, 10);

  return (
    <div className="flex items-center gap-1">
      <Button asChild variant="outline" size="sm">
        <Link href={`/agenda?data=${toIso(prev)}`}>← Anterior</Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link href="/agenda">Hoje</Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link href={`/agenda?data=${toIso(next)}`}>Próximo →</Link>
      </Button>
    </div>
  );
}

function camaraToItem(e: EventoCamara): AgendaItem {
  const inicio = new Date(e.dataHoraInicio);
  const fim = e.dataHoraFim ? new Date(e.dataHoraFim) : null;
  const now = new Date();
  const aoVivo =
    e.situacao?.toLowerCase().startsWith('iniciada') ||
    (fim !== null && inicio <= now && now <= fim && !e.situacao?.toLowerCase().startsWith('encerr'));

  const orgao = e.orgaos?.[0];
  const casaPorOrgao: 'camara' | 'senado' | 'congresso' = (() => {
    if (!orgao) return 'camara';
    const sigla = orgao.sigla?.toUpperCase() ?? '';
    if (sigla === 'SF') return 'senado';
    if (sigla === 'CN') return 'congresso';
    return 'camara';
  })();

  return {
    id: `camara-${e.id}`,
    casa: casaPorOrgao,
    horario: e.dataHoraInicio,
    horarioFim: e.dataHoraFim,
    titulo: e.descricao || e.descricaoTipo,
    descricao: e.descricaoTipo,
    local: e.localCamara?.nome || e.localExterno || null,
    orgao: orgao?.nomeResumido || orgao?.sigla || null,
    situacao: e.situacao,
    urlExterna: camaraEventoUrl(e.id),
    aoVivo: Boolean(aoVivo),
  };
}

function senadoToItem(r: ReuniaoSenado): AgendaItem {
  return {
    id: `senado-${r.codigo}`,
    casa: 'senado',
    horario: r.dataInicio,
    titulo: r.titulo,
    descricao: r.descricao,
    local: r.local,
    orgao: r.colegiadoCriador?.sigla ?? null,
    situacao: r.status || r.situacao,
    urlExterna: null,
    aoVivo: r.status?.toLowerCase() === 'realizando',
  };
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDataLonga(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function proximoDiaUtil(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}
