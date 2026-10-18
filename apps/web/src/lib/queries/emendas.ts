/**
 * Queries sobre emendas parlamentares.
 */

import { and, count, desc, eq, ilike, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { emendas, parlamentares, partidos, ufs } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Tipos retornados (valores em BRL como number)
// ---------------------------------------------------------------------------

export interface EmendaListItem {
  id: string;
  codigoEmenda: string;
  numeroEmenda: string | null;
  ano: number;
  tipoEmenda: string | null;
  autorLivre: string;
  parlamentarId: string | null;
  parlamentarNome: string | null;
  parlamentarFoto: string | null;
  parlamentarCasa: 'camara' | 'senado' | null;
  funcao: string | null;
  localidadeDoGasto: string | null;
  valorPago: number;
  valorEmpenhado: number;
  valorLiquidado: number;
}

export interface ListEmendasFilters {
  ano?: number;
  tipoEmenda?: string;
  autor?: string;
  page?: number;
  pageSize?: number;
  parlamentarId?: string;
}

export interface ListEmendasResult {
  items: EmendaListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  dbConfigured: boolean;
}

const DEFAULT_PAGE_SIZE = 20;

function toNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function listEmendas(
  filters: ListEmendasFilters = {},
): Promise<ListEmendasResult> {
  const db = getDb();
  if (!db) {
    return {
      items: [],
      total: 0,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: 0,
      dbConfigured: false,
    };
  }

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (filters.ano) conditions.push(eq(emendas.ano, filters.ano));
  if (filters.tipoEmenda) conditions.push(eq(emendas.tipoEmenda, filters.tipoEmenda));
  if (filters.autor?.trim()) {
    conditions.push(ilike(emendas.autorLivre, `%${filters.autor.trim()}%`));
  }
  if (filters.parlamentarId) {
    conditions.push(eq(emendas.parlamentarId, filters.parlamentarId));
  }

  const where = conditions.length ? and(...conditions) : undefined;

  try {
    const rows = await db
      .select({
        id: emendas.id,
        codigoEmenda: emendas.codigoEmenda,
        numeroEmenda: emendas.numeroEmenda,
        ano: emendas.ano,
        tipoEmenda: emendas.tipoEmenda,
        autorLivre: emendas.autorLivre,
        parlamentarId: emendas.parlamentarId,
        parlamentarNome: parlamentares.nome,
        parlamentarFoto: parlamentares.fotoUrl,
        parlamentarCasa: parlamentares.casa,
        funcao: emendas.funcao,
        localidadeDoGasto: emendas.localidadeDoGasto,
        valorPago: emendas.valorPago,
        valorEmpenhado: emendas.valorEmpenhado,
        valorLiquidado: emendas.valorLiquidado,
      })
      .from(emendas)
      .leftJoin(parlamentares, eq(emendas.parlamentarId, parlamentares.id))
      .where(where)
      .orderBy(desc(emendas.valorPago))
      .limit(pageSize)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: count() })
      .from(emendas)
      .where(where);

    return {
      items: rows.map((r) => ({
        ...r,
        parlamentarCasa: r.parlamentarCasa as 'camara' | 'senado' | null,
        valorPago: toNumber(r.valorPago),
        valorEmpenhado: toNumber(r.valorEmpenhado),
        valorLiquidado: toNumber(r.valorLiquidado),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      dbConfigured: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) {
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
        dbConfigured: true,
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Ranking de parlamentares por valor
// ---------------------------------------------------------------------------

export interface RankingEmendador {
  parlamentarId: string;
  nome: string;
  casa: 'camara' | 'senado';
  partidoSigla: string | null;
  ufSigla: string | null;
  numEmendas: number;
  totalEmpenhado: number;
  totalPago: number;
}

type RankingRow = {
  parlamentar_id: string;
  parlamentar_nome: string;
  casa: string;
  partido_sigla: string | null;
  uf_sigla: string | null;
  num_emendas: string | number;
  total_empenhado: string | number;
  total_pago: string | number;
} & Record<string, unknown>;

function unwrapRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: T[] }).rows ?? [];
  }
  return [];
}

export async function getRankingEmendadores(
  ano: number,
  limit = 20,
): Promise<RankingEmendador[]> {
  const db = getDb();
  if (!db) return [];

  try {
    const result = await db.execute<RankingRow>(sql`
      SELECT parlamentar_id, parlamentar_nome, casa, partido_sigla, uf_sigla,
             num_emendas, total_empenhado, total_pago
        FROM v_ranking_emendas_parlamentar
       WHERE ano = ${ano}
       ORDER BY total_pago DESC NULLS LAST
       LIMIT ${limit}
    `);
    const rows = unwrapRows<RankingRow>(result);
    return rows.map((r) => ({
      parlamentarId: r.parlamentar_id,
      nome: r.parlamentar_nome,
      casa: r.casa as 'camara' | 'senado',
      partidoSigla: r.partido_sigla,
      ufSigla: r.uf_sigla,
      numEmendas: Number(r.num_emendas),
      totalEmpenhado: toNumber(r.total_empenhado),
      totalPago: toNumber(r.total_pago),
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) return [];
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Estatísticas gerais e opções de filtro
// ---------------------------------------------------------------------------

export interface EmendasStats {
  anosDisponiveis: number[];
  tiposDisponiveis: string[];
  totalEmpenhadoAno: number;
  totalPagoAno: number;
  numEmendasAno: number;
  anoCorrente: number | null;
}

type StatsRow = {
  ano: number;
  total_empenhado: string | number;
  total_pago: string | number;
  num_emendas: string | number;
} & Record<string, unknown>;

export async function getEmendasStats(): Promise<EmendasStats> {
  const db = getDb();
  if (!db) {
    return {
      anosDisponiveis: [],
      tiposDisponiveis: [],
      totalEmpenhadoAno: 0,
      totalPagoAno: 0,
      numEmendasAno: 0,
      anoCorrente: null,
    };
  }

  try {
    const anosResult = await db.execute<{ ano: number } & Record<string, unknown>>(sql`
      SELECT DISTINCT ano FROM emendas ORDER BY ano DESC
    `);
    const anos = unwrapRows<{ ano: number }>(anosResult).map((r) => Number(r.ano));

    const tiposResult = await db.execute<
      { tipo_emenda: string } & Record<string, unknown>
    >(sql`
      SELECT DISTINCT tipo_emenda FROM emendas
       WHERE tipo_emenda IS NOT NULL
       ORDER BY tipo_emenda
    `);
    const tipos = unwrapRows<{ tipo_emenda: string }>(tiposResult).map((r) => r.tipo_emenda);

    const anoCorrente = anos[0] ?? null;

    if (anoCorrente == null) {
      return {
        anosDisponiveis: anos,
        tiposDisponiveis: tipos,
        totalEmpenhadoAno: 0,
        totalPagoAno: 0,
        numEmendasAno: 0,
        anoCorrente: null,
      };
    }

    const statsResult = await db.execute<StatsRow>(sql`
      SELECT ${anoCorrente}::int AS ano,
             COALESCE(SUM(valor_empenhado), 0) AS total_empenhado,
             COALESCE(SUM(valor_pago), 0) AS total_pago,
             COUNT(*) AS num_emendas
        FROM emendas
       WHERE ano = ${anoCorrente}
    `);
    const [stats] = unwrapRows<StatsRow>(statsResult);

    return {
      anosDisponiveis: anos,
      tiposDisponiveis: tipos,
      totalEmpenhadoAno: toNumber(stats?.total_empenhado),
      totalPagoAno: toNumber(stats?.total_pago),
      numEmendasAno: Number(stats?.num_emendas ?? 0),
      anoCorrente,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) {
      return {
        anosDisponiveis: [],
        tiposDisponiveis: [],
        totalEmpenhadoAno: 0,
        totalPagoAno: 0,
        numEmendasAno: 0,
        anoCorrente: null,
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Emendas de um parlamentar (reusado pela aba do perfil)
// ---------------------------------------------------------------------------

export interface EmendaDoParlamentar {
  id: string;
  codigoEmenda: string;
  ano: number;
  tipoEmenda: string | null;
  funcao: string | null;
  localidadeDoGasto: string | null;
  valorPago: number;
  valorEmpenhado: number;
}

export interface EmendasParlamentarResumo {
  porAno: Array<{ ano: number; total: number; count: number }>;
  totalGeral: number;
  countGeral: number;
  topRecentes: EmendaDoParlamentar[];
}

type EmendaParlAnoRow = {
  ano: number;
  total: string | number;
  n: string | number;
} & Record<string, unknown>;

export async function getEmendasDoParlamentar(
  parlamentarId: string,
): Promise<EmendasParlamentarResumo> {
  const db = getDb();
  if (!db) return { porAno: [], totalGeral: 0, countGeral: 0, topRecentes: [] };
  if (!/^[0-9a-f-]{36}$/i.test(parlamentarId)) {
    return { porAno: [], totalGeral: 0, countGeral: 0, topRecentes: [] };
  }

  try {
    const porAnoResult = await db.execute<EmendaParlAnoRow>(sql`
      SELECT ano,
             COALESCE(SUM(valor_pago), 0) AS total,
             COUNT(*) AS n
        FROM emendas
       WHERE parlamentar_id = ${parlamentarId}
       GROUP BY ano
       ORDER BY ano DESC
    `);
    const porAnoRows = unwrapRows<EmendaParlAnoRow>(porAnoResult);
    const porAno = porAnoRows.map((r) => ({
      ano: Number(r.ano),
      total: toNumber(r.total),
      count: Number(r.n),
    }));

    const totalGeral = porAno.reduce((acc, r) => acc + r.total, 0);
    const countGeral = porAno.reduce((acc, r) => acc + r.count, 0);

    const topRows = await db
      .select({
        id: emendas.id,
        codigoEmenda: emendas.codigoEmenda,
        ano: emendas.ano,
        tipoEmenda: emendas.tipoEmenda,
        funcao: emendas.funcao,
        localidadeDoGasto: emendas.localidadeDoGasto,
        valorPago: emendas.valorPago,
        valorEmpenhado: emendas.valorEmpenhado,
      })
      .from(emendas)
      .where(eq(emendas.parlamentarId, parlamentarId))
      .orderBy(desc(emendas.valorPago))
      .limit(20);

    return {
      porAno,
      totalGeral,
      countGeral,
      topRecentes: topRows.map((r) => ({
        ...r,
        valorPago: toNumber(r.valorPago),
        valorEmpenhado: toNumber(r.valorEmpenhado),
      })),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) {
      return { porAno: [], totalGeral: 0, countGeral: 0, topRecentes: [] };
    }
    throw err;
  }
}

// Silence unused imports
void ufs;
void partidos;
