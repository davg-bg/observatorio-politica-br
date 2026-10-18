import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  /** Caminho base da rota (sem query string). */
  basePath: string;
  /** Query params atuais (serão preservados além de `page`). */
  searchParams: Record<string, string | undefined>;
}

export function Pagination({ currentPage, totalPages, basePath, searchParams }: PaginationProps) {
  if (totalPages <= 1) return null;

  const buildHref = (page: number): string => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v) params.set(k, v);
    }
    if (page > 1) {
      params.set('page', String(page));
    } else {
      params.delete('page');
    }
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  // Mostra uma faixa compacta: primeira, última, atual, +/- 1 vizinho.
  const pages = buildPageWindow(currentPage, totalPages);

  const prev = currentPage - 1;
  const next = currentPage + 1;
  const canPrev = prev >= 1;
  const canNext = next <= totalPages;

  return (
    <nav aria-label="Paginação" className="flex items-center justify-center gap-1">
      <Link
        href={canPrev ? buildHref(prev) : '#'}
        aria-label="Anterior"
        aria-disabled={!canPrev}
        className={cn(
          buttonVariants({ variant: 'outline', size: 'icon' }),
          !canPrev && 'pointer-events-none opacity-50',
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>

      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="px-2 text-sm text-muted-foreground">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(p)}
            aria-current={p === currentPage ? 'page' : undefined}
            className={cn(
              buttonVariants({
                variant: p === currentPage ? 'default' : 'outline',
                size: 'icon',
              }),
              'w-9',
            )}
          >
            {p}
          </Link>
        ),
      )}

      <Link
        href={canNext ? buildHref(next) : '#'}
        aria-label="Próxima"
        aria-disabled={!canNext}
        className={cn(
          buttonVariants({ variant: 'outline', size: 'icon' }),
          !canNext && 'pointer-events-none opacity-50',
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </nav>
  );
}

function buildPageWindow(current: number, total: number): Array<number | '…'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const windowSet = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = Array.from(windowSet)
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);

  const out: Array<number | '…'> = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push('…');
    out.push(n);
    prev = n;
  }
  return out;
}
