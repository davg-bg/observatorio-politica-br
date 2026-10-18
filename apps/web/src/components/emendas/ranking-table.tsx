import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { RankingEmendador } from '@/lib/queries/emendas';
import { formatBRL } from '@/lib/utils';

interface Props {
  ranking: RankingEmendador[];
}

function iniciais(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function RankingTable({ ranking }: Props) {
  if (ranking.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Sem ranking disponível. Rode o ETL (
        <code className="font-mono">etl run transparencia-emendas</code>) e refresque as views.
      </p>
    );
  }

  const maiorValor = Math.max(1, ...ranking.map((r) => r.totalPago));

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="p-3 text-left">#</th>
            <th className="p-3 text-left">Parlamentar</th>
            <th className="p-3 text-right">Emendas</th>
            <th className="p-3 text-right">Pago</th>
            <th className="p-3 text-left">Barra</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((r, i) => {
            const pct = (r.totalPago / maiorValor) * 100;
            return (
              <tr key={r.parlamentarId} className="border-t hover:bg-accent/40">
                <td className="p-3 font-mono text-muted-foreground">{i + 1}</td>
                <td className="p-3">
                  <Link
                    href={`/parlamentares/${r.parlamentarId}`}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <Avatar
                      src={null}
                      alt={r.nome}
                      fallback={iniciais(r.nome)}
                      className="h-8 w-8"
                    />
                    <div>
                      <div className="font-medium leading-tight">{r.nome}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {r.casa === 'camara' ? 'Dep' : 'Sen'}
                        </Badge>
                        {r.partidoSigla && <span className="font-mono">{r.partidoSigla}</span>}
                        {r.ufSigla && (
                          <>
                            <span>·</span>
                            <span>{r.ufSigla}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="p-3 text-right font-mono text-muted-foreground">
                  {r.numEmendas}
                </td>
                <td className="p-3 text-right font-mono font-medium">
                  {formatBRL(r.totalPago)}
                </td>
                <td className="w-48 p-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${pct}%` }}
                      aria-label={`${pct.toFixed(0)}%`}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
