import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { EngavetadoItem } from '@/lib/queries/engavetados';
import { Clock } from 'lucide-react';

interface Props {
  item: EngavetadoItem;
}

export function EngavetadoCard({ item: e }: Props) {
  const propId = `${e.siglaTipo} ${e.numero}/${e.ano}`;
  const anosParado = (e.diasSemTramitacao / 365).toFixed(1);
  const corDias =
    e.diasSemTramitacao >= 1095
      ? 'text-rose-700'
      : e.diasSemTramitacao >= 730
        ? 'text-orange-700'
        : e.diasSemTramitacao >= 365
          ? 'text-amber-700'
          : 'text-muted-foreground';

  return (
    <Card className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="font-mono">
              {propId}
            </Badge>
            <Badge variant="secondary">{e.casa === 'camara' ? 'Câmara' : 'Senado'}</Badge>
            {e.siglaOrgaoAtual && (
              <Badge variant="outline" className="font-mono">
                {e.siglaOrgaoAtual}
              </Badge>
            )}
          </div>
          <p className="line-clamp-3 text-sm font-medium leading-snug">{e.ementa}</p>
          {e.descricaoSituacao && (
            <p className="text-xs text-muted-foreground">
              Situação: {e.descricaoSituacao}
            </p>
          )}
          {e.nomeAutorPrincipal && (
            <p className="text-xs text-muted-foreground">
              Autor: {e.nomeAutorPrincipal}
            </p>
          )}
          {e.temas.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {e.temas.slice(0, 4).map((t) => (
                <Badge key={t} variant="outline" className="text-[10px] font-normal">
                  {t}
                </Badge>
              ))}
              {e.temas.length > 4 && (
                <span className="text-[10px] text-muted-foreground">
                  +{e.temas.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className={`inline-flex items-center gap-1 font-mono text-lg font-bold ${corDias}`}>
            <Clock className="h-4 w-4" />
            {e.diasSemTramitacao}
          </div>
          <div className="text-xs text-muted-foreground">dias parado</div>
          <div className="text-[11px] text-muted-foreground">({anosParado} anos)</div>
        </div>
      </div>
    </Card>
  );
}
