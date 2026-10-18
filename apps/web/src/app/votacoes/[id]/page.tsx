import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BreakdownPartido } from '@/components/votacoes/breakdown-partido';
import { VoteBar } from '@/components/votacoes/votacao-card';
import { VotosLista } from '@/components/votacoes/votos-lista';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SourceBadge } from '@/components/ui/source-badge';
import {
  getBreakdownPorPartido,
  getVotacaoById,
  listVotosByVotacao,
} from '@/lib/queries/votacoes';
import { CheckCircle2, ExternalLink, HelpCircle, XCircle } from 'lucide-react';

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const v = await getVotacaoById(id);
  if (!v) return { title: 'Votação não encontrada' };
  return {
    title: `${resumoCurto(v.descricao)} — Votação`,
    description: v.descricao,
  };
}

export default async function VotacaoPerfilPage({ params }: PageProps) {
  const { id } = await params;

  const votacao = await getVotacaoById(id);
  if (!votacao) notFound();

  const [votos, breakdowns] = await Promise.all([
    listVotosByVotacao(id),
    getBreakdownPorPartido(id),
  ]);

  const total = votacao.votosSim + votacao.votosNao + votacao.votosAbstencao + votacao.votosOutros;

  return (
    <main className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Início
        </Link>
        <span>/</span>
        <Link href="/votacoes" className="hover:text-foreground">
          Votações
        </Link>
        <span>/</span>
        <span className="truncate">{votacao.sourceId}</span>
      </nav>

      {/* Cabeçalho */}
      <header className="space-y-3 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">
            {votacao.casa === 'camara' ? 'Câmara dos Deputados' : 'Senado Federal'}
          </Badge>
          {votacao.siglaOrgao && (
            <Badge variant="secondary" className="font-mono">
              {votacao.siglaOrgao}
            </Badge>
          )}
          <AprovacaoBadge aprovacao={votacao.aprovacao} />
          <time className="text-muted-foreground">
            {votacao.dataHoraRegistro.toLocaleString('pt-BR')}
          </time>
        </div>
        <h1 className="text-xl font-semibold leading-tight">{votacao.descricao}</h1>

        {votacao.proposicao && (
          <Link
            href={`/votacoes?q=${encodeURIComponent(
              `${votacao.proposicao.siglaTipo} ${votacao.proposicao.numero}`,
            )}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Proposição:
            <Badge variant="outline" className="font-mono">
              {votacao.proposicao.siglaTipo} {votacao.proposicao.numero}/{votacao.proposicao.ano}
            </Badge>
            <span className="line-clamp-1">{votacao.proposicao.ementa}</span>
          </Link>
        )}
      </header>

      {/* Resumo agregado */}
      {total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <VoteBar
              sim={votacao.votosSim}
              nao={votacao.votosNao}
              abstencao={votacao.votosAbstencao}
              outros={votacao.votosOutros}
            />
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <ResultadoBlock label="Sim" valor={votacao.votosSim} color="text-emerald-700" />
              <ResultadoBlock label="Não" valor={votacao.votosNao} color="text-rose-700" />
              <ResultadoBlock
                label="Abstenção"
                valor={votacao.votosAbstencao}
                color="text-amber-700"
              />
              <ResultadoBlock
                label="Outros"
                valor={votacao.votosOutros}
                color="text-muted-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Total registrado: <strong>{total}</strong>{' '}
              {total === votos.length
                ? '(idêntico ao número de votos individuais)'
                : `· ${votos.length} votos individuais listados`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Breakdown por partido */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como cada partido votou</CardTitle>
        </CardHeader>
        <CardContent>
          <BreakdownPartido breakdowns={breakdowns} />
        </CardContent>
      </Card>

      {/* Votos individuais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Votos individuais</CardTitle>
        </CardHeader>
        <CardContent>
          <VotosLista votos={votos} />
        </CardContent>
      </Card>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground">
        <SourceBadge source="api-oficial" />
        {votacao.uri && (
          <a
            href={votacao.uri}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
          >
            Fonte oficial
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </footer>
    </main>
  );
}

function AprovacaoBadge({ aprovacao }: { aprovacao: boolean | null }) {
  if (aprovacao === true) {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Aprovada
      </Badge>
    );
  }
  if (aprovacao === false) {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        Rejeitada
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <HelpCircle className="h-3 w-3" />
      Sem resultado
    </Badge>
  );
}

function ResultadoBlock({
  label,
  valor,
  color,
}: {
  label: string;
  valor: number;
  color: string;
}) {
  return (
    <div className="rounded-md border bg-muted/40 p-2">
      <div className={`font-mono text-2xl font-bold ${color}`}>{valor}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function resumoCurto(descricao: string): string {
  if (descricao.length <= 60) return descricao;
  return descricao.slice(0, 57) + '...';
}
