import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Vote } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-16">
      <EmptyState
        icon={<Vote className="h-10 w-10" />}
        title="Votação não encontrada"
        description="O identificador não existe no banco. Verifique a URL ou volte à lista."
        action={
          <Button asChild>
            <Link href="/votacoes">Voltar à lista</Link>
          </Button>
        }
      />
    </main>
  );
}
