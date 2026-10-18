/**
 * Queries sobre alinhamento partidário.
 *
 * Alimentadas pelas views materializadas v_coesao_partido e
 * v_alinhamento_partidos criadas em db/migrations/0003_alinhamento.sql.
 *
 * Dado que são views, NÃO estão espelhadas no Drizzle schema; usamos
 * SQL puro via db.execute().
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

export type Janela = '30d' | '90d' | '365d';

export const JANELAS: Array<{ value: Janela; label: string }> = [
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: '365d', label: 'Último ano' },
];

export function parseJanela(raw: string | undefined): Janela {
  if (raw === '30d' || raw === '90d' || raw === '365d') return raw;
  return '90d';
}

// ---------------------------------------------------------------------------
// Coesão interna (Rice)
// ---------------------------------------------------------------------------

export interface CoesaoPartido {
  partidoId: number;
  partidoSigla: string;
  janela: Janela;
  votacoesConsideradas: number;
  riceMedio: number | null; // 0 a 1
  totalSim: number;
  totalNao: number;
  totalAbstencao: number;
}

export interface AlinhamentoAvailability {
  available: boolean;
  reason?: string;
}

/**
 * Normaliza o retorno de `db.execute` em uma lista de objetos.
 * Drizzle+postgres-js devolve array; drizzle+node-postgres devolve {rows}.
 */
function unwrapRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: T[] }).rows ?? [];
  }
  return [];
}

async function queryExists(viewName: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    const result = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT FROM pg_matviews WHERE matviewname = ${viewName}
      ) AS exists
    `);
    const rows = unwrapRows<{ exists: boolean }>(result);
    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  }
}

export async function checkAlinhamentoAvailable(): Promise<AlinhamentoAvailability> {
  const db = getDb();
  if (!db) return { available: false, reason: 'db-not-configured' };

  const [a, b] = await Promise.all([
    queryExists('v_coesao_partido'),
    queryExists('v_alinhamento_partidos'),
  ]);
  if (!a || !b) return { available: false, reason: 'views-not-created' };
  return { available: true };
}

type CoesaoRow = {
  partido_id: string | number;
  partido_sigla: string;
  janela: string;
  votacoes_consideradas: string | number;
  rice_medio: string | number | null;
  total_sim: string | number;
  total_nao: string | number;
  total_abstencao: string | number;
} & Record<string, unknown>;

export async function listCoesao(janela: Janela): Promise<CoesaoPartido[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const result = await db.execute<CoesaoRow>(sql`
      SELECT partido_id, partido_sigla, janela,
             votacoes_consideradas, rice_medio,
             total_sim, total_nao, total_abstencao
        FROM v_coesao_partido
       WHERE janela = ${janela}
         AND votacoes_consideradas > 0
       ORDER BY rice_medio DESC NULLS LAST
    `);
    const rows = unwrapRows<CoesaoRow>(result);
    return rows.map((r) => ({
      partidoId: Number(r.partido_id),
      partidoSigla: r.partido_sigla,
      janela: r.janela as Janela,
      votacoesConsideradas: Number(r.votacoes_consideradas),
      riceMedio: r.rice_medio == null ? null : Number(r.rice_medio),
      totalSim: Number(r.total_sim),
      totalNao: Number(r.total_nao),
      totalAbstencao: Number(r.total_abstencao),
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) return [];
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Matriz de alinhamento (similaridade cosseno)
// ---------------------------------------------------------------------------

export interface ParAlinhamento {
  partidoASigla: string;
  partidoBSigla: string;
  votacoesComuns: number;
  similaridade: number; // -1 a +1
  pctConcordancia: number; // 0 a 100
}

type AlinhamentoRow = {
  partido_a_sigla: string;
  partido_b_sigla: string;
  votacoes_comuns: string | number;
  similaridade: string | number;
  pct_concordancia: string | number;
} & Record<string, unknown>;

export async function listAlinhamento(janela: Janela): Promise<ParAlinhamento[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const result = await db.execute<AlinhamentoRow>(sql`
      SELECT partido_a_sigla, partido_b_sigla, votacoes_comuns,
             similaridade, pct_concordancia
        FROM v_alinhamento_partidos
       WHERE janela = ${janela}
       ORDER BY similaridade DESC
    `);
    const rows = unwrapRows<AlinhamentoRow>(result);
    return rows.map((r) => ({
      partidoASigla: r.partido_a_sigla,
      partidoBSigla: r.partido_b_sigla,
      votacoesComuns: Number(r.votacoes_comuns),
      similaridade: Number(r.similaridade),
      pctConcordancia: Number(r.pct_concordancia),
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) return [];
    throw err;
  }
}

/** Lista única de siglas presentes na matriz (ordenadas alfabeticamente). */
export function siglasOrdenadas(pares: ParAlinhamento[]): string[] {
  const set = new Set<string>();
  for (const p of pares) {
    set.add(p.partidoASigla);
    set.add(p.partidoBSigla);
  }
  return Array.from(set).sort();
}

/** Lookup rápido de similaridade por par (não-direcional). */
export function buildSimLookup(
  pares: ParAlinhamento[],
): Map<string, ParAlinhamento> {
  const map = new Map<string, ParAlinhamento>();
  for (const p of pares) {
    const key = keyPar(p.partidoASigla, p.partidoBSigla);
    map.set(key, p);
  }
  return map;
}

export function keyPar(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
