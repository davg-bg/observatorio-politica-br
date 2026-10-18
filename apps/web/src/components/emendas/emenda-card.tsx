import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { EmendaListItem } from '@/lib/queries/emendas';
import { formatBRL } from '@/lib/utils';

interface Props {
  emenda: EmendaListItem;
}

export function EmendaCard({ emenda: e }: Props) {
  return (
    <Card className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{e.ano}</Badge>
            {e.tipoEmenda && <Badge variant="outline">{e.tipoEmenda}</Badge>}
            {e.funcao && <span className="text-muted-foreground">{e.funcao}</span>}
          </div>
          <div className="truncate font-medium">
            {e.parlamentarId && e.parlamentarNome ? (
              <Link
                href={`/parlamentares/${e.parlamentarId}`}
                className="hover:underline"
              >
                {e.parlamentarNome}
              </Link>
            ) : (
              <span>{e.autorLivre}</span>
            )}
          </div>
          {e.localidadeDoGasto && (
            <p className="text-xs text-muted-foreground">
              Localidade: {e.localidadeDoGasto}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-lg font-bold text-emerald-700">
            {formatBRL(e.valorPago)}
          </div>
          <div className="text-xs text-muted-foreground">pago</div>
          <div className="text-xs text-muted-foreground">
            empenhado: <span className="font-mono">{formatBRL(e.valorEmpenhado)}</span>
          </div>
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground">
        Código: <span className="font-mono">{e.codigoEmenda}</span>
      </div>
    </Card>
  );
}
