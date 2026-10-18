'use client';

import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

export function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'sent' }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const [, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus({ kind: 'sending' });
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus({ kind: 'error', message: 'Supabase não configurado.' });
      return;
    }

    const next = searchParams.get('next') ?? '/me/favoritos';
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });

    startTransition(() => {
      if (error) {
        setStatus({ kind: 'error', message: error.message });
      } else {
        setStatus({ kind: 'sent' });
      }
    });
  }

  if (status.kind === 'sent') {
    return (
      <div className="rounded-md border border-emerald-500/40 bg-emerald-50 p-4 text-sm dark:bg-emerald-900/20">
        <p className="font-medium text-emerald-900 dark:text-emerald-100">
          Link enviado!
        </p>
        <p className="mt-1 text-emerald-800 dark:text-emerald-200">
          Verifique a caixa de entrada de <strong>{email}</strong> e clique no link para
          entrar. Ele é válido por 1 hora.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Input
        type="email"
        placeholder="voce@exemplo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        autoFocus
        aria-label="Email"
      />
      <Button type="submit" className="w-full" disabled={status.kind === 'sending'}>
        {status.kind === 'sending' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Enviando link…
          </>
        ) : (
          'Enviar link de acesso'
        )}
      </Button>
      {status.kind === 'error' && (
        <p className="text-xs text-destructive">{status.message}</p>
      )}
    </form>
  );
}
