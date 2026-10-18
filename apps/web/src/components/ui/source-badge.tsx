import { Badge } from '@/components/ui/badge';
import { Database, FileWarning } from 'lucide-react';

interface SourceBadgeProps {
  source: 'api-oficial' | 'scraping' | 'manual';
}

/**
 * Indicador visual de origem do dado — parte do princípio editorial
 * de deixar explícito quando um dado vem de API oficial versus scraping.
 */
export function SourceBadge({ source }: SourceBadgeProps) {
  if (source === 'api-oficial') {
    return (
      <Badge variant="success" className="gap-1">
        <Database className="h-3 w-3" />
        Fonte oficial
      </Badge>
    );
  }
  if (source === 'scraping') {
    return (
      <Badge variant="warning" className="gap-1">
        <FileWarning className="h-3 w-3" />
        Scraping — pode conter erros
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      Dado manual
    </Badge>
  );
}
