import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { VotoDoParlamentar } from '@/lib/queries/votacoes';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  votos: VotoDoParlamentar[];
}

export function VotacoesTab({ votos }: Props) {
  if (votos.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Este parlamentar ainda não aparece em nenhuma votação ingerida.
          <br />
          <span className="text-xs">
            Pode ser porque entrou recentemente ou porque o ETL de votações não rodou ainda.
          </span>
        </CardContent>
      </Card>
    );
  }

  const stats = summarize(votos);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 py-4 sm:grid-cols-4">
          <StatBlock
            label="Sim"
            value={stats.sim}
            total={votos.length}
            color="text-emerald-700"
          />
          <StatBlock label="Não" value={stats.nao} total={votos.length} color="text-rose-700" />
          <StatBlock
            label="Abstenção"
            value={stats.abstencao}
            total={votos.length}
            color="text-amber-700"
          />
          <StatBlock
            label="Outros"
            value={stats.outros}
            total={votos.length}
            color="text-muted-foreground"
          />
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Últimas {votos.length} votações</h3>
        <ul className="divide-y rounded-md border">
          {votos.map((v) => (
            <li key={v.votacaoId} className="flex items-start gap-3 p-3 text-sm">
              <VotoBadge tipo={v.tipoVoto} />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/votacoes/${v.votacaoId}`}
                  className="line-clamp-2 font-medium leading-snug hover:underline"
                >
                  {v.descricao}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <time>{v.dataHoraRegistro.toLocaleDateString('pt-BR')}</time>
                  <AprovacaoHint aprovacao={v.aprovacao} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function StatBlock({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div>
      <div className={`font-mono text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">
        {label} — {pct}%
      </div>
    </div>
  );
}

function VotoBadge({ tipo }: { tipo: string }) {
  const classes: Record<string, string> = {
    Sim: 'border-emerald-500/50 text-emerald-800 bg-emerald-50',
    Não: 'border-rose-500/50 text-rose-800 bg-rose-50',
    Abstenção: 'border-amber-500/50 text-amber-800 bg-amber-50',
  };
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 w-20 justify-center font-mono text-xs',
        classes[tipo] ?? 'border-slate-400/50 bg-slate-50',
      )}
    >
      {tipo}
    </Badge>
  );
}

function AprovacaoHint({ aprovacao }: { aprovacao: boolean | null }) {
  if (aprovacao === true) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        Aprovada
      </span>
    );
  }
  if (aprovacao === false) {
    return (
      <span className="inline-flex items-center gap-1 text-rose-700">
        <XCircle className="h-3 w-3" />
        Rejeitada
      </span>
    );
  }
  return null;
}

function summarize(votos: VotoDoParlamentar[]) {
  const counts = { sim: 0, nao: 0, abstencao: 0, outros: 0 };
  for (const v of votos) {
    if (v.tipoVoto === 'Sim') counts.sim++;
    else if (v.tipoVoto === 'Não') counts.nao++;
    else if (v.tipoVoto === 'Abstenção') counts.abstencao++;
    else counts.outros++;
  }
  return counts;
}
