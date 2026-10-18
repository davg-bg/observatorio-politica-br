import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface Tab {
  key: string;
  label: string;
  disabled?: boolean;
}

interface UrlTabsProps {
  tabs: Tab[];
  activeKey: string;
  /** Caminho base (sem query string). */
  basePath: string;
  /** Nome do search param — default `tab`. */
  paramName?: string;
  /** Outros search params a preservar nos links. */
  searchParams?: Record<string, string | undefined>;
  className?: string;
}

/**
 * Barra de abas controlada pela URL (search param). Sem estado cliente.
 * Clicar numa aba navega para a mesma rota com `?tab=X`, permitindo
 * link direto e back/forward funcionarem.
 */
export function UrlTabs({
  tabs,
  activeKey,
  basePath,
  paramName = 'tab',
  searchParams,
  className,
}: UrlTabsProps) {
  const buildHref = (key: string): string => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams ?? {})) {
      if (v) params.set(k, v);
    }
    // Primeira aba fica como URL "limpa" (sem param), demais usam o param.
    if (key !== tabs[0]?.key) {
      params.set(paramName, key);
    }
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div
      role="tablist"
      aria-label="Abas do perfil"
      className={cn(
        'inline-flex h-9 items-center justify-start gap-1 rounded-lg bg-muted p-1 text-muted-foreground',
        className,
      )}
    >
      {tabs.map((t) => {
        const isActive = t.key === activeKey;
        if (t.disabled) {
          return (
            <span
              key={t.key}
              role="tab"
              aria-selected={false}
              aria-disabled
              className="inline-flex cursor-not-allowed items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium opacity-50"
            >
              {t.label}
            </span>
          );
        }
        return (
          <Link
            key={t.key}
            role="tab"
            aria-selected={isActive}
            href={buildHref(t.key)}
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all',
              isActive
                ? 'bg-background text-foreground shadow'
                : 'hover:bg-background/50 hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
