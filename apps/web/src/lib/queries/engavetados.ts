/**
 * Queries sobre proposições engavetadas.
 *
 * Lê da view materializada v_engavetados (migration 0005). Como é uma view,
 * usamos SQL raw via db.execute.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

export type Casa = 'camara' | 'senado';

export interface EngavetadoItem {
  proposicaoId: string;
  casa: Casa;
  sourceId: string;
  siglaTipo: string;
  numero: number;
  ano: number;
  ementa: string;
  descricaoSituacao: string | null;
  siglaOrgaoAtual: string | null;
  dataApresentacao: string | null;
  dataUltimaTramitacao: string | null;
  diasSemTramitacao: number;
  nomeAutorPrincipal: string | null;
  temas: string[];
}

export interface ListEngavetadosFilters {
  casa?: Casa;
  tema?: string;
  autor?: string;
  minDias?: number;
  page?: number;
  pageSize?: number;
}

export interface ListEngavetadosResult {
  items: EngavetadoItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  dbConfigured: boolean;
  viewAvailable: boolean;
}

type EngavetadoRow = {
  proposicao_id: string;
  casa: string;
  source_id: string;
  sigla_tipo: string;
  numero: string | number;
  ano: string | number;
  ementa: string;
  descricao_situacao: string | null;
  sigla_orgao_atual: string | null;
  data_apresentacao: string | Date | null;
  data_ultima_tramitacao: string | Date | null;
  dias_sem_tramitacao: string | number;
  nome_autor_principal: string | null;
  temas: string[] | null;
} & Record<string, unknown>;

function unwrapRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: T[] }).rows ?? [];
  }
  return [];
}

function toIsoOrNull(v: string | Date | null): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

const DEFAULT_PAGE_SIZE = 20;

export async function listEngavetados(
  filters: ListEngavetadosFilters = {},
): Promise<ListEngavetadosResult> {
  const db = getDb();
  if (!db) {
    return {
      items: [],
      total: 0,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: 0,
      dbConfigured: false,
      viewAvailable: false,
    };
  }

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;
  const minDias = filters.minDias ?? 180;

  try {
    const result = await db.execute<EngavetadoRow>(sql`
      SELECT proposicao_id, casa::text, source_id, sigla_tipo, numero, ano, ementa,
             descricao_situacao, sigla_orgao_atual, data_apresentacao,
             data_ultima_tramitacao, dias_sem_tramitacao, nome_autor_principal,
             temas
        FROM v_engavetados
       WHERE dias_sem_tramitacao >= ${minDias}
         AND (${filters.casa ?? null}::text IS NULL OR casa::text = ${filters.casa ?? null})
         AND (${filters.tema ?? null}::text IS NULL OR ${filters.tema ?? null} = ANY(temas))
         AND (${filters.autor?.trim() ?? null}::text IS NULL
              OR nome_autor_principal ILIKE '%' || ${filters.autor?.trim() ?? null} || '%')
       ORDER BY dias_sem_tramitacao DESC
       LIMIT ${pageSize}
      OFFSET ${offset}
    `);
    const rows = unwrapRows<EngavetadoRow>(result);

    const countResult = await db.execute<{ total: string | number } & Record<string, unknown>>(sql`
      SELECT COUNT(*) AS total
        FROM v_engavetados
       WHERE dias_sem_tramitacao >= ${minDias}
         AND (${filters.casa ?? null}::text IS NULL OR casa::text = ${filters.casa ?? null})
         AND (${filters.tema ?? null}::text IS NULL OR ${filters.tema ?? null} = ANY(temas))
         AND (${filters.autor?.trim() ?? null}::text IS NULL
              OR nome_autor_principal ILIKE '%' || ${filters.autor?.trim() ?? null} || '%')
    `);
    const [countRow] = unwrapRows<{ total: string | number }>(countResult);
    const total = Number(countRow?.total ?? 0);

    return {
      items: rows.map((r) => ({
        proposicaoId: r.proposicao_id,
        casa: r.casa as Casa,
        sourceId: r.source_id,
        siglaTipo: r.sigla_tipo,
        numero: Number(r.numero),
        ano: Number(r.ano),
        ementa: r.ementa,
        descricaoSituacao: r.descricao_situacao,
        siglaOrgaoAtual: r.sigla_orgao_atual,
        dataApresentacao: toIsoOrNull(r.data_apresentacao),
        dataUltimaTramitacao: toIsoOrNull(r.data_ultima_tramitacao),
        diasSemTramitacao: Number(r.dias_sem_tramitacao),
        nomeAutorPrincipal: r.nome_autor_principal,
        temas: r.temas ?? [],
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      dbConfigured: true,
      viewAvailable: true,
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
        viewAvailable: false,
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Stats e opções de filtro
// ---------------------------------------------------------------------------

export interface EngavetadosStats {
  total: number;
  totalCamara: number;
  totalSenado: number;
  mediaDiasParado: number;
  temasDisponiveis: Array<{ tema: string; count: number }>;
}

type StatsRow = {
  casa: string;
  n: string | number;
  avg_dias: string | number | null;
} & Record<string, unknown>;

type TemaRow = {
  tema: string;
  n: string | number;
} & Record<string, unknown>;

export async function getEngavetadosStats(): Promise<EngavetadosStats> {
  const db = getDb();
  const empty: EngavetadosStats = {
    total: 0,
    totalCamara: 0,
    totalSenado: 0,
    mediaDiasParado: 0,
    temasDisponiveis: [],
  };
  if (!db) return empty;

  try {
    const statsResult = await db.execute<StatsRow>(sql`
      SELECT casa::text AS casa,
             COUNT(*) AS n,
             AVG(dias_sem_tramitacao) AS avg_dias
        FROM v_engavetados
       GROUP BY casa
    `);
    const statRows = unwrapRows<StatsRow>(statsResult);

    const temasResult = await db.execute<TemaRow>(sql`
      SELECT unnest(temas) AS tema, COUNT(*) AS n
        FROM v_engavetados
       WHERE array_length(temas, 1) > 0
       GROUP BY tema
       ORDER BY n DESC
       LIMIT 30
    `);
    const temaRows = unwrapRows<TemaRow>(temasResult);

    const totalCamara = Number(statRows.find((r) => r.casa === 'camara')?.n ?? 0);
    const totalSenado = Number(statRows.find((r) => r.casa === 'senado')?.n ?? 0);
    const totalAvg =
      statRows.length === 0
        ? 0
        : statRows.reduce((acc, r) => acc + Number(r.avg_dias ?? 0) * Number(r.n), 0) /
          statRows.reduce((acc, r) => acc + Number(r.n), 0 as number);

    return {
      total: totalCamara + totalSenado,
      totalCamara,
      totalSenado,
      mediaDiasParado: Math.round(totalAvg),
      temasDisponiveis: temaRows.map((r) => ({ tema: r.tema, count: Number(r.n) })),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) return empty;
    throw err;
  }
}
