import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { PartidoBreakdown } from '@/lib/queries/votacoes';

interface Props {
  breakdowns: PartidoBreakdown[];
}

export function BreakdownPartido({ breakdowns }: Props) {
  if (breakdowns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Sem votos individuais registrados.</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 border-b pb-2 text-xs font-medium text-muted-foreground">
        <span>Partido</span>
        <span>Distribuição</span>
        <span className="text-right">Total</span>
      </div>
      {breakdowns.map((b) => (
        <PartidoRow key={b.partidoSigla} b={b} />
      ))}
    </div>
  );
}

function PartidoRow({ b }: { b: PartidoBreakdown }) {
  const pct = (n: number) => (b.total === 0 ? 0 : (n / b.total) * 100);
  const majoritario = pickMajority(b);

  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 rounded-md border p-2 text-sm">
      <div className="flex min-w-20 flex-col gap-1">
        <span className="font-mono text-sm font-medium">{b.partidoSigla}</span>
        {b.orientacao && (
          <Badge
            variant="outline"
            className={cn(
              'justify-center text-[10px] font-normal',
              b.orientacao.toLowerCase() === 'sim' && 'border-emerald-500/50 text-emerald-700',
              b.orientacao.toLowerCase() === 'não' && 'border-rose-500/50 text-rose-700',
            )}
            title="Orientação do líder"
          >
            L: {b.orientacao}
          </Badge>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          {b.sim > 0 && <div className="bg-emerald-500" style={{ width: `${pct(b.sim)}%` }} />}
          {b.nao > 0 && <div className="bg-rose-500" style={{ width: `${pct(b.nao)}%` }} />}
          {b.abstencao > 0 && (
            <div className="bg-amber-400" style={{ width: `${pct(b.abstencao)}%` }} />
          )}
          {b.outros > 0 && (
            <div className="bg-slate-400" style={{ width: `${pct(b.outros)}%` }} />
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {b.sim > 0 && <span className="text-emerald-700">Sim {b.sim}</span>}
          {b.nao > 0 && <span className="text-rose-700">Não {b.nao}</span>}
          {b.abstencao > 0 && <span>Abst {b.abstencao}</span>}
          {b.outros > 0 && <span>Outros {b.outros}</span>}
          {majoritario && (
            <span className="ml-auto italic">
              Posição majoritária: <strong>{majoritario}</strong>
            </span>
          )}
        </div>
      </div>
      <div className="text-right font-mono text-sm text-muted-foreground">{b.total}</div>
    </div>
  );
}

function pickMajority(b: PartidoBreakdown): string | null {
  const entries: Array<[string, number]> = [
    ['Sim', b.sim],
    ['Não', b.nao],
    ['Abstenção', b.abstencao],
    ['Outros', b.outros],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  if (entries[0][1] === 0) return null;
  // Empate em primeiro lugar
  if (entries[1] && entries[0][1] === entries[1][1]) return 'dividido';
  return entries[0][0];
}

/** Para uso dentro da Card do shadcn. */
export function BreakdownCard({ breakdowns }: Props) {
  return (
    <Card className="p-4">
      <BreakdownPartido breakdowns={breakdowns} />
    </Card>
  );
}
