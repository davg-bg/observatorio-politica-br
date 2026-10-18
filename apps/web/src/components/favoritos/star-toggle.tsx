'use client';

import { useState, useTransition } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StarToggleProps {
  /** Server action que faz o toggle no banco. */
  action: () => Promise<{ ok: boolean; favorito: boolean; error?: string }>;
  initialFavorito: boolean;
  isAuthenticated: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

/**
 * Botão de estrela cliente-side com optimistic update.
 * Quando o usuário não está autenticado, redireciona para /login.
 */
export function StarToggle({
  action,
  initialFavorito,
  isAuthenticated,
  size = 'md',
  ariaLabel = 'Favoritar',
}: StarToggleProps) {
  const [favorito, setFavorito] = useState(initialFavorito);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      // Redireciona pra login com retorno à página atual
      const next = window.location.pathname;
      window.location.href = `/login?next=${encodeURIComponent(next)}`;
      return;
    }

    // Optimistic update
    const prev = favorito;
    setFavorito(!prev);
    setError(null);

    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setFavorito(prev); // rollback
        setError(result.error ?? 'Falha ao salvar');
      } else {
        setFavorito(result.favorito);
      }
    });
  }

  const sizes = {
    sm: 'h-7 w-7 [&_svg]:size-3.5',
    md: 'h-9 w-9 [&_svg]:size-4',
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={isPending}
      aria-label={ariaLabel}
      aria-pressed={favorito}
      title={error ?? (favorito ? 'Desfavoritar' : 'Favoritar')}
      className={cn(sizes[size], 'shrink-0')}
    >
      <Star
        className={cn(
          'transition-colors',
          favorito ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground',
        )}
      />
    </Button>
  );
}
