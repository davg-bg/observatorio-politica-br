import { Card } from '@/components/ui/card';
import type { CoesaoPartido } from '@/lib/queries/alinhamento';
import { cn } from '@/lib/utils';

interface Props {
  partidos: CoesaoPartido[];
}

/** Lista ordenada por Rice descendente — maior = mais coeso. */
export function CoesaoSidebar({ partidos }: Props) {
  if (partidos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Sem dados nesta janela.</p>
    );
  }

  return (
    <ul className="space-y-1">
      {partidos.map((p) => (
        <PartidoCoesaoLine key={p.partidoId} p={p} />
      ))}
    </ul>
  );
}

function PartidoCoesaoLine({ p }: { p: CoesaoPartido }) {
  const rice = p.riceMedio ?? 0;
  const pct = Math.round(rice * 100);
  const color =
    rice >= 0.9
      ? 'bg-emerald-500'
      : rice >= 0.75
        ? 'bg-emerald-400'
        : rice >= 0.5
          ? 'bg-amber-400'
          : 'bg-rose-400';

  return (
    <li
      className="grid grid-cols-[70px_1fr_auto] items-center gap-2 rounded px-2 py-1 text-xs"
      title={`${p.partidoSigla}: Rice ${rice.toFixed(2)} em ${p.votacoesConsideradas} votações`}
    >
      <span className="truncate font-mono font-medium">{p.partidoSigla}</span>
      <div className="h-2 w-full overflow-hidden rounded bg-muted">
        <div className={cn('h-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono tabular-nums text-muted-foreground">{pct}%</span>
    </li>
  );
}

export function CoesaoCard({ partidos, titulo }: { partidos: CoesaoPartido[]; titulo: string }) {
  return (
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <p className="text-xs text-muted-foreground">
          Índice de Rice: 100% = partido sempre unido, 0% = sempre dividido.
        </p>
      </div>
      <CoesaoSidebar partidos={partidos} />
    </Card>
  );
}
