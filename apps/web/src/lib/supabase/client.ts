'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv, isSupabaseConfigured } from '@/lib/env';

let cached: SupabaseClient | null = null;

/**
 * Supabase client para uso no browser (Client Components).
 * Singleton — reaproveita a mesma instância durante a vida da aba.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (cached) return cached;
  cached = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL!, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return cached;
}
