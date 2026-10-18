import { Badge } from '@/components/ui/badge';
import { Clock, ExternalLink, MapPin } from 'lucide-react';

export interface AgendaItem {
  id: string;
  casa: 'camara' | 'senado' | 'congresso';
  horario: string; // ISO datetime
  horarioFim?: string | null;
  titulo: string;
  descricao?: string | null;
  local?: string | null;
  orgao?: string | null;
  situacao?: string | null;
  urlExterna?: string | null;
  aoVivo?: boolean;
}

export function EventoItem({ item }: { item: AgendaItem }) {
  const casaLabel =
    item.casa === 'camara' ? 'Câmara' : item.casa === 'senado' ? 'Senado' : 'Congresso';

  return (
    <article className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">{casaLabel}</Badge>
            {item.orgao && (
              <Badge variant="secondary" className="font-mono">
                {item.orgao}
              </Badge>
            )}
            {item.aoVivo && <Badge variant="destructive">AO VIVO</Badge>}
            {item.situacao && !item.aoVivo && (
              <span className="text-muted-foreground">{item.situacao}</span>
            )}
          </div>
          <h3 className="font-medium leading-tight">{item.titulo}</h3>
          {item.descricao && item.descricao !== item.titulo && (
            <p className="text-sm text-muted-foreground">{item.descricao}</p>
          )}
          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatHora(item.horario)}
              {item.horarioFim && item.horarioFim !== item.horario && (
                <> – {formatHora(item.horarioFim)}</>
              )}
            </span>
            {item.local && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {item.local}
              </span>
            )}
          </div>
        </div>
        {item.urlExterna && (
          <a
            href={item.urlExterna}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent"
          >
            <ExternalLink className="h-3 w-3" />
            Fonte
          </a>
        )}
      </div>
    </article>
  );
}

function formatHora(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  // Formato "HH:mm" em pt-BR
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
