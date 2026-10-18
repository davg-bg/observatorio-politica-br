import { redirect } from 'next/navigation';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/supabase/server-auth';
import { LogoutButton } from '@/components/auth/logout-button';
import { Star, User } from 'lucide-react';

/**
 * Layout do segmento /me/*. Verifica autenticação server-side.
 * O middleware já redireciona, mas verificamos aqui como defesa em
 * profundidade.
 */
export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?next=/me/favoritos');
  }

  return (
    <main className="container mx-auto max-w-5xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              Início
            </Link>
            <span>/</span>
            <span>Minha área</span>
          </div>
          <div className="flex items-center gap-2 pt-1 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{user.email}</span>
            <Badge variant="outline" className="text-[10px]">
              autenticado
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/me/favoritos">
              <Star className="h-4 w-4" />
              Favoritos
            </Link>
          </Button>
          <LogoutButton />
        </div>
      </header>

      {children}
    </main>
  );
}
