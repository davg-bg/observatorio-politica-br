/**
 * Card renderizando uma sessão do STF e os processos pautados nela.
 *
 * Marca materia_relevante / repercussao_geral com badges distintos pra
 * facilitar triagem visual.
 */

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  colegiadoLabel,
  formatarProcesso,
  type SessaoSTFComProcessos,
} from '@/lib/queries/stf-pautas';
import { Flame, Gavel, Star } from 'lucide-react';

interface SessaoSTFCardProps {
  sessao: SessaoSTFComProcessos;
}

export function SessaoSTFCard({ sessao }: SessaoSTFCardProps) {
  const hora = new Date(sessao.dataInicio).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

  // Processos destacados primeiro (relevantes ou repercussão geral)
  const processosOrdenados = [...sessao.processos].sort((a, b) => {
    const scoreA = (a.materiaRelevante ? 2 : 0) + (a.repercussaoGeral ? 1 : 0);
    const scoreB = (b.materiaRelevante ? 2 : 0) + (b.repercussaoGeral ? 1 : 0);
    return scoreB - scoreA;
  });

  return (
    <Card className="space-y-2 p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="default">
              <Gavel className="mr-1 h-3 w-3" />
              {colegiadoLabel(sessao.colegiadoCodigo)}
            </Badge>
            {sessao.numero && sessao.ano && (
              <Badge variant="outline" className="font-mono">
                Sessão {sessao.numero}/{sessao.ano}
              </Badge>
            )}
            <span className="font-mono text-muted-foreground">{hora}</span>
          </div>
          {sessao.observacao && (
            <p className="text-xs italic text-muted-foreground">{sessao.observacao}</p>
          )}
        </div>
        <Badge variant="outline">
          {sessao.processosCount} processo{sessao.processosCount === 1 ? '' : 's'}
        </Badge>
      </header>

      {processosOrdenados.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sem processos pautados ainda.
        </p>
      ) : (
        <ul className="space-y-2 border-t pt-2">
          {processosOrdenados.slice(0, 8).map((p) => (
            <li key={p.id} className="space-y-0.5 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="font-mono">
                  {formatarProcesso(p)}
                </Badge>
                {p.materiaRelevante && (
                  <Badge variant="warning" className="gap-1 text-[10px]">
                    <Flame className="h-2.5 w-2.5" />
                    Relevante
                  </Badge>
                )}
                {p.repercussaoGeral && (
                  <Badge variant="success" className="gap-1 text-[10px]">
                    <Star className="h-2.5 w-2.5" />
                    Rep. Geral
                  </Badge>
                )}
                {p.relator && (
                  <span className="text-muted-foreground">{normalizarRelator(p.relator)}</span>
                )}
              </div>
              {p.resumoTema && (
                <p className="line-clamp-2 text-[11px] text-muted-foreground">
                  {p.resumoTema}
                </p>
              )}
            </li>
          ))}
          {processosOrdenados.length > 8 && (
            <li className="text-[11px] text-muted-foreground">
              + {processosOrdenados.length - 8} outros processos
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}

/** "MIN. GILMAR MENDES" → "Min. Gilmar Mendes" */
function normalizarRelator(relator: string): string {
  return relator
    .toLowerCase()
    .replace(/^min\./, 'Min.')
    .replace(/\b([a-záéíóúãâôê])/g, (_, c) => c.toUpperCase())
    .replace(/Min\.?\s*/i, 'Min. ');
}
