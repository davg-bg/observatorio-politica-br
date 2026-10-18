import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { VotacaoListItem } from '@/lib/queries/votacoes';
import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react';

interface Props {
  votacao: VotacaoListItem;
}

export function VotacaoCard({ votacao: v }: Props) {
  const total = v.votosSim + v.votosNao + v.votosAbstencao + v.votosOutros;
  const propLabel = v.proposicaoSigla
    ? `${v.proposicaoSigla} ${v.proposicaoNumero}/${v.proposicaoAno}`
    : null;

  return (
    <Link href={`/votacoes/${v.id}`} className="focus-visible:outline-none">
      <Card className="space-y-3 p-4 transition-colors hover:bg-accent/40">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{v.casa === 'camara' ? 'Câmara' : 'Senado'}</Badge>
              {v.siglaOrgao && (
                <Badge variant="secondary" className="font-mono">
                  {v.siglaOrgao}
                </Badge>
              )}
              {propLabel && <Badge variant="outline">{propLabel}</Badge>}
              <AprovacaoBadge aprovacao={v.aprovacao} />
            </div>
            <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug">{v.descricao}</p>
          </div>
          <time className="shrink-0 text-xs text-muted-foreground">
            {v.dataHoraRegistro.toLocaleDateString('pt-BR')}{' '}
            <span className="font-mono">
              {v.dataHoraRegistro.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </time>
        </div>

        {total > 0 && (
          <>
            <VoteBar
              sim={v.votosSim}
              nao={v.votosNao}
              abstencao={v.votosAbstencao}
              outros={v.votosOutros}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                <strong className="text-emerald-700">Sim</strong> {v.votosSim}
              </span>
              <span>
                <strong className="text-rose-700">Não</strong> {v.votosNao}
              </span>
              {v.votosAbstencao > 0 && (
                <span>
                  <strong>Abstenção</strong> {v.votosAbstencao}
                </span>
              )}
              {v.votosOutros > 0 && (
                <span>
                  <strong>Outros</strong> {v.votosOutros}
                </span>
              )}
              <span className="ml-auto">
                Total: <strong>{total}</strong>
              </span>
            </div>
          </>
        )}
      </Card>
    </Link>
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

export function VoteBar({
  sim,
  nao,
  abstencao,
  outros,
}: {
  sim: number;
  nao: number;
  abstencao: number;
  outros: number;
}) {
  const total = sim + nao + abstencao + outros;
  if (total === 0) return null;
  const pct = (n: number) => (n / total) * 100;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      {sim > 0 && (
        <div
          className="bg-emerald-500"
          style={{ width: `${pct(sim)}%` }}
          aria-label={`Sim: ${sim}`}
        />
      )}
      {nao > 0 && (
        <div
          className="bg-rose-500"
          style={{ width: `${pct(nao)}%` }}
          aria-label={`Não: ${nao}`}
        />
      )}
      {abstencao > 0 && (
        <div
          className="bg-amber-400"
          style={{ width: `${pct(abstencao)}%` }}
          aria-label={`Abstenção: ${abstencao}`}
        />
      )}
      {outros > 0 && (
        <div
          className="bg-slate-400"
          style={{ width: `${pct(outros)}%` }}
          aria-label={`Outros: ${outros}`}
        />
      )}
    </div>
  );
}
