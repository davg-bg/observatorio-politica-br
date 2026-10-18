import { StarToggle } from './star-toggle';
import { getCurrentUser } from '@/lib/supabase/server-auth';
import {
  isParlamentarFavorito,
  toggleFavoritoParlamentar,
} from '@/lib/queries/favoritos';

interface Props {
  parlamentarId: string;
  size?: 'sm' | 'md';
}

/**
 * Server Component que verifica se já é favorito e passa a server action para
 * o StarToggle. O bind da action garante que o parlamentarId é fixado no
 * server (não vem do cliente).
 */
export async function FavoritarParlamentar({ parlamentarId, size = 'md' }: Props) {
  const user = await getCurrentUser();
  const isAuthenticated = Boolean(user);
  const favorito = isAuthenticated ? await isParlamentarFavorito(parlamentarId) : false;

  const action = async () => {
    'use server';
    return toggleFavoritoParlamentar(parlamentarId);
  };

  return (
    <StarToggle
      action={action}
      initialFavorito={favorito}
      isAuthenticated={isAuthenticated}
      size={size}
      ariaLabel={favorito ? 'Desfavoritar parlamentar' : 'Favoritar parlamentar'}
    />
  );
}
