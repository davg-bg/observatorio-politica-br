import type { MandatoDetalhe } from '@/lib/queries/parlamentares';
import { Badge } from '@/components/ui/badge';

interface Props {
  mandatos: MandatoDetalhe[];
}

export function MandatosTimeline({ mandatos }: Props) {
  if (mandatos.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum mandato registrado.</p>;
  }

  return (
    <ol className="space-y-3">
      {mandatos.map((m) => {
        const emCurso = !m.dataFim || new Date(m.dataFim) > new Date();
        return (
          <li
            key={m.id}
            className="rounded-lg border bg-card p-3 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">
                  {m.legislaturaNumero}ª legislatura
                  {m.tipo && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({m.tipo})
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatRange(m.dataInicio, m.dataFim)}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {m.partidoSigla && (
                  <Badge variant="outline" className="font-mono">
                    {m.partidoSigla}
                  </Badge>
                )}
                {m.ufSigla && <Badge variant="outline">{m.ufSigla}</Badge>}
                {emCurso && <Badge variant="success">Em curso</Badge>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function formatRange(inicio: string, fim: string | null): string {
  const start = new Date(inicio + 'T00:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  const end = fim
    ? new Date(fim + 'T00:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' })
    : 'em exercício';
  return `${start} — ${end}`;
}
