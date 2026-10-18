/**
 * Queries de alto nível sobre parlamentares.
 *
 * Separadas das páginas pra permitir compartilhar entre rotas (ex: um
 * widget "últimos parlamentares atualizados" pode reusar a mesma query).
 */

import { and, asc, count, desc, eq, ilike, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { legislaturas, mandatos, parlamentares, partidos, ufs } from '@/lib/db/schema';

export type Casa = 'camara' | 'senado';

export interface ListFilters {
  casa?: Casa;
  ufSigla?: string;
  partidoSigla?: string;
  nome?: string;
  emExercicio?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ParlamentarListItem {
  id: string;
  casa: Casa;
  sourceId: string;
  nome: string;
  fotoUrl: string | null;
  partidoSigla: string | null;
  ufSigla: string | null;
}

export interface ListResult {
  items: ParlamentarListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  // null se o banco não está configurado — a UI mostra onboarding
  dbConfigured: boolean;
}

const DEFAULT_PAGE_SIZE = 60;

export async function listParlamentares(filters: ListFilters = {}): Promise<ListResult> {
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
  const pageSize = Math.min(240, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const conditions = [eq(parlamentares.emExercicio, filters.emExercicio ?? true)];

  if (filters.casa) {
    conditions.push(eq(parlamentares.casa, filters.casa));
  }
  if (filters.ufSigla) {
    conditions.push(eq(ufs.sigla, filters.ufSigla.toUpperCase()));
  }
  if (filters.partidoSigla) {
    conditions.push(eq(partidos.sigla, filters.partidoSigla.toUpperCase()));
  }
  if (filters.nome && filters.nome.trim()) {
    conditions.push(ilike(parlamentares.nome, `%${filters.nome.trim()}%`));
  }

  const where = and(...conditions);

  try {
    const rows = await db
      .select({
        id: parlamentares.id,
        casa: parlamentares.casa,
        sourceId: parlamentares.sourceId,
        nome: parlamentares.nome,
        fotoUrl: parlamentares.fotoUrl,
        partidoSigla: partidos.sigla,
        ufSigla: ufs.sigla,
      })
      .from(parlamentares)
      .leftJoin(partidos, eq(parlamentares.partidoId, partidos.id))
      .leftJoin(ufs, eq(parlamentares.ufId, ufs.id))
      .where(where)
      .orderBy(asc(parlamentares.nome))
      .limit(pageSize)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: count() })
      .from(parlamentares)
      .leftJoin(partidos, eq(parlamentares.partidoId, partidos.id))
      .leftJoin(ufs, eq(parlamentares.ufId, ufs.id))
      .where(where);

    return {
      items: rows as ParlamentarListItem[],
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      dbConfigured: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Tabela ainda não criada: tratamos como "banco configurado mas vazio".
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

/** Lista UFs e partidos distintos presentes entre parlamentares em exercício.
 *  Alimenta os dropdowns de filtro, só exibindo opções com resultados. */
export async function listFilterOptions(): Promise<{
  ufs: Array<{ sigla: string; nome: string }>;
  partidos: Array<{ sigla: string }>;
}> {
  const db = getDb();
  if (!db) return { ufs: [], partidos: [] };

  try {
    const ufRows = await db
      .selectDistinct({ sigla: ufs.sigla, nome: ufs.nome })
      .from(parlamentares)
      .innerJoin(ufs, eq(parlamentares.ufId, ufs.id))
      .where(eq(parlamentares.emExercicio, true))
      .orderBy(asc(ufs.sigla));

    const partidoRows = await db
      .selectDistinct({ sigla: partidos.sigla })
      .from(parlamentares)
      .innerJoin(partidos, eq(parlamentares.partidoId, partidos.id))
      .where(eq(parlamentares.emExercicio, true))
      .orderBy(asc(partidos.sigla));

    return {
      ufs: ufRows.filter((u) => u.sigla !== null) as Array<{ sigla: string; nome: string }>,
      partidos: partidoRows.filter((p) => p.sigla !== null) as Array<{ sigla: string }>,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) {
      return { ufs: [], partidos: [] };
    }
    throw err;
  }
}

/** Resumo de contagens por casa, usado em headers e dashboards. */
export async function countsPorCasa(): Promise<{ camara: number; senado: number; total: number }> {
  const db = getDb();
  if (!db) return { camara: 0, senado: 0, total: 0 };

  try {
    const rows = await db
      .select({
        casa: parlamentares.casa,
        total: count(),
      })
      .from(parlamentares)
      .where(eq(parlamentares.emExercicio, true))
      .groupBy(parlamentares.casa);

    const camara = rows.find((r) => r.casa === 'camara')?.total ?? 0;
    const senado = rows.find((r) => r.casa === 'senado')?.total ?? 0;
    return { camara, senado, total: camara + senado };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) {
      return { camara: 0, senado: 0, total: 0 };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Perfil individual
// ---------------------------------------------------------------------------

export interface MandatoDetalhe {
  id: string;
  casa: Casa;
  legislaturaId: number;
  legislaturaNumero: number;
  dataInicio: string;
  dataFim: string | null;
  tipo: string | null;
  partidoSigla: string | null;
  ufSigla: string | null;
}

export interface Redes {
  twitter?: { handle: string; url: string };
  instagram?: { handle: string; url: string };
  facebook?: { handle: string; url: string };
  youtube?: { handle: string; url: string };
  tiktok?: { handle: string; url: string };
  linkedin?: { handle: string; url: string };
}

export interface ParlamentarDetalhe {
  id: string;
  casa: Casa;
  sourceId: string;
  nome: string;
  nomeCivil: string | null;
  cpf: string | null;
  sexo: string | null;
  dataNascimento: string | null;
  fotoUrl: string | null;
  email: string | null;
  site: string | null;
  redes: Redes;
  escolaridade: string | null;
  profissao: string | null;
  situacao: string | null;
  emExercicio: boolean;
  atualizadoEm: Date;
  partido: { sigla: string; nome: string } | null;
  uf: { sigla: string; nome: string; regiao: string } | null;
  mandatos: MandatoDetalhe[];
}

export async function getParlamentarById(id: string): Promise<ParlamentarDetalhe | null> {
  const db = getDb();
  if (!db) return null;

  // Validação defensiva: ids inválidos retornam null em vez de 500.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  try {
    const [row] = await db
      .select({
        id: parlamentares.id,
        casa: parlamentares.casa,
        sourceId: parlamentares.sourceId,
        nome: parlamentares.nome,
        nomeCivil: parlamentares.nomeCivil,
        cpf: parlamentares.cpf,
        sexo: parlamentares.sexo,
        dataNascimento: parlamentares.dataNascimento,
        fotoUrl: parlamentares.fotoUrl,
        email: parlamentares.email,
        site: parlamentares.site,
        redes: parlamentares.redes,
        escolaridade: parlamentares.escolaridade,
        profissao: parlamentares.profissao,
        situacao: parlamentares.situacao,
        emExercicio: parlamentares.emExercicio,
        atualizadoEm: parlamentares.atualizadoEm,
        partidoSigla: partidos.sigla,
        partidoNome: partidos.nome,
        ufSigla: ufs.sigla,
        ufNome: ufs.nome,
        ufRegiao: ufs.regiao,
      })
      .from(parlamentares)
      .leftJoin(partidos, eq(parlamentares.partidoId, partidos.id))
      .leftJoin(ufs, eq(parlamentares.ufId, ufs.id))
      .where(eq(parlamentares.id, id))
      .limit(1);

    if (!row) return null;

    const mandatoRows = await db
      .select({
        id: mandatos.id,
        casa: mandatos.casa,
        legislaturaId: mandatos.legislaturaId,
        legislaturaNumero: legislaturas.numero,
        dataInicio: mandatos.dataInicio,
        dataFim: mandatos.dataFim,
        tipo: mandatos.tipo,
        partidoSigla: partidos.sigla,
        ufSigla: ufs.sigla,
      })
      .from(mandatos)
      .innerJoin(legislaturas, eq(mandatos.legislaturaId, legislaturas.id))
      .leftJoin(partidos, eq(mandatos.partidoId, partidos.id))
      .leftJoin(ufs, eq(mandatos.ufId, ufs.id))
      .where(eq(mandatos.parlamentarId, id))
      .orderBy(desc(legislaturas.numero));

    return {
      id: row.id,
      casa: row.casa as Casa,
      sourceId: row.sourceId,
      nome: row.nome,
      nomeCivil: row.nomeCivil,
      cpf: row.cpf,
      sexo: row.sexo,
      dataNascimento: row.dataNascimento,
      fotoUrl: row.fotoUrl,
      email: row.email,
      site: row.site,
      redes: (row.redes as Redes) ?? {},
      escolaridade: row.escolaridade,
      profissao: row.profissao,
      situacao: row.situacao,
      emExercicio: row.emExercicio,
      atualizadoEm: row.atualizadoEm,
      partido: row.partidoSigla
        ? { sigla: row.partidoSigla, nome: row.partidoNome ?? row.partidoSigla }
        : null,
      uf: row.ufSigla
        ? {
            sigla: row.ufSigla,
            nome: row.ufNome ?? row.ufSigla,
            regiao: row.ufRegiao ?? '',
          }
        : null,
      mandatos: mandatoRows as MandatoDetalhe[],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) return null;
    throw err;
  }
}

/** URL canônica no site oficial da Câmara/Senado. */
export function sourceUrl(casa: Casa, sourceId: string): string {
  if (casa === 'camara') {
    return `https://www.camara.leg.br/deputados/${sourceId}`;
  }
  return `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${sourceId}`;
}

// Silence unused imports in case of refactors
void sql;
