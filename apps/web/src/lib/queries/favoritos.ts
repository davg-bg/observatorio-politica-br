/**
 * Queries e server actions sobre favoritos.
 *
 * Toda escrita passa pela sessão do usuário (Supabase RLS garante isolamento).
 */

import 'server-only';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, getCurrentUser } from '@/lib/supabase/server-auth';

export interface FavoritoParlamentar {
  parlamentarId: string;
  nome: string;
  fotoUrl: string | null;
  partidoSigla: string | null;
  ufSigla: string | null;
  casa: 'camara' | 'senado';
  criadoEm: string;
}

export interface FavoritoProposicao {
  proposicaoId: string;
  siglaTipo: string;
  numero: number;
  ano: number;
  ementa: string;
  casa: 'camara' | 'senado';
  criadoEm: string;
}

/** Verifica se um parlamentar está favoritado pelo user atual. */
export async function isParlamentarFavorito(parlamentarId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;
  const { data } = await supabase
    .from('favoritos_parlamentares')
    .select('parlamentar_id')
    .eq('parlamentar_id', parlamentarId)
    .maybeSingle();
  return Boolean(data);
}

export async function listFavoritosParlamentares(): Promise<FavoritoParlamentar[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  // RLS filtra automaticamente pelo user_id
  const { data, error } = await supabase
    .from('favoritos_parlamentares')
    .select(
      'parlamentar_id, criado_em, parlamentares(nome, foto_url, casa, partidos(sigla), ufs(sigla))',
    )
    .order('criado_em', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => {
    const parl = row.parlamentares as unknown as {
      nome: string;
      foto_url: string | null;
      casa: 'camara' | 'senado';
      partidos: { sigla: string } | null;
      ufs: { sigla: string } | null;
    } | null;
    return {
      parlamentarId: row.parlamentar_id,
      nome: parl?.nome ?? '(removido)',
      fotoUrl: parl?.foto_url ?? null,
      partidoSigla: parl?.partidos?.sigla ?? null,
      ufSigla: parl?.ufs?.sigla ?? null,
      casa: parl?.casa ?? 'camara',
      criadoEm: row.criado_em,
    };
  });
}

export async function listFavoritosProposicoes(): Promise<FavoritoProposicao[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('favoritos_proposicoes')
    .select(
      'proposicao_id, criado_em, proposicoes(sigla_tipo, numero, ano, ementa, casa)',
    )
    .order('criado_em', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => {
    const prop = row.proposicoes as unknown as {
      sigla_tipo: string;
      numero: number;
      ano: number;
      ementa: string;
      casa: 'camara' | 'senado';
    } | null;
    return {
      proposicaoId: row.proposicao_id,
      siglaTipo: prop?.sigla_tipo ?? '?',
      numero: prop?.numero ?? 0,
      ano: prop?.ano ?? 0,
      ementa: prop?.ementa ?? '(removida)',
      casa: prop?.casa ?? 'camara',
      criadoEm: row.criado_em,
    };
  });
}

// ---------------------------------------------------------------------------
// Server actions (chamadas via <form action={}> ou toggleParlamentar(id))
// ---------------------------------------------------------------------------

export interface ToggleResult {
  ok: boolean;
  favorito: boolean;
  error?: string;
}

export async function toggleFavoritoParlamentar(
  parlamentarId: string,
): Promise<ToggleResult> {
  'use server';
  const user = await getCurrentUser();
  if (!user) return { ok: false, favorito: false, error: 'not_authenticated' };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, favorito: false, error: 'supabase_unavailable' };

  const { data: existing } = await supabase
    .from('favoritos_parlamentares')
    .select('parlamentar_id')
    .eq('parlamentar_id', parlamentarId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('favoritos_parlamentares')
      .delete()
      .eq('parlamentar_id', parlamentarId);
    revalidatePath('/me/favoritos');
    revalidatePath(`/parlamentares/${parlamentarId}`);
    return { ok: !error, favorito: false, error: error?.message };
  }

  const { error } = await supabase
    .from('favoritos_parlamentares')
    .insert({ user_id: user.id, parlamentar_id: parlamentarId });
  revalidatePath('/me/favoritos');
  revalidatePath(`/parlamentares/${parlamentarId}`);
  return { ok: !error, favorito: true, error: error?.message };
}

export async function toggleFavoritoProposicao(
  proposicaoId: string,
): Promise<ToggleResult> {
  'use server';
  const user = await getCurrentUser();
  if (!user) return { ok: false, favorito: false, error: 'not_authenticated' };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, favorito: false, error: 'supabase_unavailable' };

  const { data: existing } = await supabase
    .from('favoritos_proposicoes')
    .select('proposicao_id')
    .eq('proposicao_id', proposicaoId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('favoritos_proposicoes')
      .delete()
      .eq('proposicao_id', proposicaoId);
    revalidatePath('/me/favoritos');
    return { ok: !error, favorito: false, error: error?.message };
  }

  const { error } = await supabase
    .from('favoritos_proposicoes')
    .insert({ user_id: user.id, proposicao_id: proposicaoId });
  revalidatePath('/me/favoritos');
  return { ok: !error, favorito: true, error: error?.message };
}
