import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Endpoint de saúde do sistema.
 *
 * Retorna:
 * - supabase: se a conexão está configurada e responde
 * - lastIngest: timestamp da última execução de ETL registrada em ingest_runs
 * - ingestRunsCount: total de execuções registradas (histórico)
 *
 * Em dev sem Supabase configurado, retorna 200 com flags falsas e uma
 * mensagem indicando que o Supabase não está configurado.
 */
export async function GET() {
  if (!isSupabaseConfigured) {
    return NextResponse.json({
      supabase: false,
      lastIngest: null,
      ingestRunsCount: 0,
      note: 'Supabase não configurado — preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY em .env',
    });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({
      supabase: false,
      lastIngest: null,
      ingestRunsCount: 0,
      note: 'Falha ao instanciar client do Supabase',
    });
  }

  // Checa conexão com uma query trivial. Se a tabela ainda não existir
  // (migrations não aplicadas), reportamos sem crashar.
  try {
    const { data, error, count } = await supabase
      .from('ingest_runs')
      .select('finished_at', { count: 'exact' })
      .order('finished_at', { ascending: false, nullsFirst: false })
      .limit(1);

    if (error) {
      const isMissingTable = error.code === '42P01' || /relation .* does not exist/i.test(error.message);
      return NextResponse.json({
        supabase: true,
        lastIngest: null,
        ingestRunsCount: 0,
        note: isMissingTable
          ? 'Supabase conectado, mas as migrations ainda não foram aplicadas (tabela ingest_runs não existe).'
          : `Supabase conectado, mas query falhou: ${error.message}`,
      });
    }

    const last = data?.[0]?.finished_at ?? null;
    return NextResponse.json({
      supabase: true,
      lastIngest: last,
      ingestRunsCount: count ?? 0,
    });
  } catch (err) {
    return NextResponse.json(
      {
        supabase: false,
        lastIngest: null,
        ingestRunsCount: 0,
        error: err instanceof Error ? err.message : 'Erro desconhecido',
      },
      { status: 500 },
    );
  }
}
