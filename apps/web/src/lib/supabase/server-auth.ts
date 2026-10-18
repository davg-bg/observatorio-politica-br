/**
 * Supabase client com persistência de sessão via cookies (@supabase/ssr).
 * Usado em Server Components, Server Actions e Route Handlers.
 *
 * Separado de `./server.ts` porque esse último é um client anon stateless
 * usado para consultas públicas; esse aqui carrega a sessão do usuário.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv, isSupabaseConfigured } from '@/lib/env';

export async function createSupabaseServerClient() {
  if (!isSupabaseConfigured) return null;
  const cookieStore = await cookies();
  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL!,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Em Server Components puros não dá pra escrever cookies —
            // o middleware já faz esse trabalho antes.
          }
        },
      },
    },
  );
}

/** Retorna o usuário logado ou null. Server-only. */
export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
