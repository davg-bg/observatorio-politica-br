import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  icon?: React.ReactNode;
  title: string;
  description: string;
  phase: string;
  className?: string;
}

/**
 * Placeholder visual pras abas de Votações / Proposições / Emendas
 * que entram em fases futuras. Mantém o layout do perfil completo
 * desde já, com indicação clara do que vem quando.
 */
export function FutureTab({ icon, title, description, phase, className }: Props) {
  return (
    <Card className={cn('border-dashed opacity-80', className)}>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge variant="outline">Chega em: {phase}</Badge>
      </CardContent>
    </Card>
  );
}
