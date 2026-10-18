import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isSupabaseConfigured } from '@/lib/env';
import { getCurrentUser } from '@/lib/supabase/server-auth';
import { Database, Lock, Mail } from 'lucide-react';

import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Entrar — Observatório',
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  if (!isSupabaseConfigured) {
    return (
      <main className="container mx-auto max-w-md px-4 py-16">
        <EmptyState
          icon={<Database className="h-10 w-10" />}
          title="Autenticação indisponível"
          description="Supabase não está configurado neste ambiente. O site funciona em modo somente-leitura."
          action={
            <Button asChild variant="outline">
              <Link href="/">Voltar à Home</Link>
            </Button>
          }
        />
      </main>
    );
  }

  const user = await getCurrentUser();
  if (user) {
    const sp = await searchParams;
    const next = (sp.next as string | undefined) ?? '/me/favoritos';
    redirect(next);
  }

  return (
    <main className="container mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Entrar</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Enviaremos um link de acesso para seu email. Sem senha.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <LoginForm />
          <div className="relative py-2">
            <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
            <span className="relative mx-auto flex w-fit items-center bg-card px-2 text-xs uppercase text-muted-foreground">
              <Mail className="mr-1 h-3 w-3" />
              Login sem senha
            </span>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Só a sua autenticação precisa de login. Todo o conteúdo público do site
            continua acessível sem conta —{' '}
            <Link href="/" className="underline">
              voltar à home
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
