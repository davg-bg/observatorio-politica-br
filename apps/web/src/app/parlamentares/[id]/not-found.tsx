import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { UserX } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-16">
      <EmptyState
        icon={<UserX className="h-10 w-10" />}
        title="Parlamentar não encontrado"
        description="O identificador informado não existe no banco. Verifique a URL ou volte à lista."
        action={
          <Button asChild>
            <Link href="/parlamentares">Voltar à lista</Link>
          </Button>
        }
      />
    </main>
  );
}
