import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { ParlamentarListItem } from '@/lib/queries/parlamentares';

interface ParlamentarCardProps {
  parlamentar: ParlamentarListItem;
}

/** Iniciais do nome para o fallback do avatar: "João da Silva" -> "JS". */
function iniciais(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ParlamentarCard({ parlamentar: p }: ParlamentarCardProps) {
  const casaLabel = p.casa === 'camara' ? 'Deputado' : 'Senador';

  return (
    <Link
      href={`/parlamentares/${p.id}`}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
    >
      <Card className="flex h-full items-center gap-4 p-4 transition-colors hover:bg-accent/50">
        <Avatar
          src={p.fotoUrl}
          alt={p.nome}
          fallback={iniciais(p.nome)}
          className="h-14 w-14"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="truncate font-medium leading-tight">{p.nome}</div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px] font-normal uppercase">
              {casaLabel}
            </Badge>
            {p.partidoSigla && <span className="font-mono">{p.partidoSigla}</span>}
            {p.ufSigla && (
              <>
                <span>·</span>
                <span>{p.ufSigla}</span>
              </>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
