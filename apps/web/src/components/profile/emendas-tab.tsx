import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { EmendasParlamentarResumo } from '@/lib/queries/emendas';
import { formatBRL } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Props {
  resumo: EmendasParlamentarResumo;
}

export function EmendasTab({ resumo }: Props) {
  if (resumo.countGeral === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Este parlamentar não tem emendas vinculadas no banco.
          <br />
          <span className="text-xs">
            Pode ser porque o ETL de emendas não rodou ou o nome dele não casa com nenhuma
            emenda registrada no Portal da Transparência.
          </span>
        </CardContent>
      </Card>
    );
  }

  const maxPorAno = Math.max(1, ...resumo.porAno.map((r) => r.total));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="space-y-1 py-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Total pago
            </div>
            <div className="font-mono text-3xl font-bold text-emerald-700">
              {formatBRL(resumo.totalGeral)}
            </div>
            <p className="text-xs text-muted-foreground">
              Em {resumo.countGeral} emenda{resumo.countGeral === 1 ? '' : 's'} nos anos
              ingeridos.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pago por ano</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {resumo.porAno.map((r) => (
              <div key={r.ano} className="grid grid-cols-[48px_1fr_auto] items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground">{r.ano}</span>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${(r.total / maxPorAno) * 100}%` }}
                  />
                </div>
                <span className="font-mono tabular-nums">{formatBRL(r.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Top 20 emendas (ordenadas por valor pago)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-md border">
            {resumo.topRecentes.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 p-3 text-sm"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary">{e.ano}</Badge>
                    {e.tipoEmenda && <Badge variant="outline">{e.tipoEmenda}</Badge>}
                    {e.funcao && <span className="text-muted-foreground">{e.funcao}</span>}
                  </div>
                  <div className="truncate text-muted-foreground">
                    {e.localidadeDoGasto ?? '—'}
                  </div>
                </div>
                <div
                  className={cn(
                    'shrink-0 text-right font-mono',
                    e.valorPago > 0 ? 'text-emerald-700' : 'text-muted-foreground',
                  )}
                >
                  {formatBRL(e.valorPago)}
                </div>
              </li>
            ))}
          </ul>
          <p className="pt-2 text-xs text-muted-foreground">
            <Link href={`/emendas?parlamentar=${resumo.topRecentes[0]?.id ?? ''}`} className="hover:underline">
              Ver todas as emendas →
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
