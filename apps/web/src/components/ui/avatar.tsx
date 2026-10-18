'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  fallback?: string;
}

/**
 * Avatar simplificado — sem Radix, só img com fallback para iniciais.
 * Usamos <img> nativo em vez de next/image porque muitas fotos oficiais
 * usam HTTP (Senado) ou mudam de URL com frequência.
 *
 * Client Component porque trata erro de carregamento de imagem.
 */
export function Avatar({ className, src, alt, fallback = '?', ...props }: AvatarProps) {
  const [errored, setErrored] = React.useState(false);
  const showImage = src && !errored;

  return (
    <div
      className={cn(
        'relative flex h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted',
        className,
      )}
      {...props}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt ?? 'Avatar'}
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-xs font-medium text-muted-foreground">
          {fallback.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}
