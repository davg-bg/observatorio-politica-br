import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv, isSupabaseConfigured } from '@/lib/env';

/**
 * Supabase client para uso em Server Components, Route Handlers e Server Actions.
 * Usa a chave anon (respeitando RLS). Para operações privilegiadas (ETL ou
 * webhooks com service role), use `getAdminSupabase()`.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  return createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL!, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}

/**
 * Client com service role — ignora RLS. NUNCA expor ao browser.
 * Usado em route handlers que precisam de acesso admin, mas prefira
 * manter esse tipo de operação no serviço de ETL.
 */
export function getAdminSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL!, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
