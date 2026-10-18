/**
 * Queries sobre votações nominais.
 */

import { and, asc, count, desc, eq, gte, ilike, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  orientacoesPartidarias,
  parlamentares,
  partidos,
  proposicoes,
  ufs,
  votacoes,
  votos,
} from '@/lib/db/schema';

export type Casa = 'camara' | 'senado';

// ---------------------------------------------------------------------------
// Listagem
// ---------------------------------------------------------------------------

export interface VotacaoListItem {
  id: string;
  casa: Casa;
  sourceId: string;
  dataHoraRegistro: Date;
  descricao: string;
  aprovacao: boolean | null;
  siglaOrgao: string | null;
  votosSim: number;
  votosNao: number;
  votosAbstencao: number;
  votosOutros: number;
  proposicaoSigla: string | null;
  proposicaoNumero: number | null;
  proposicaoAno: number | null;
}

export interface ListVotacoesFilters {
  casa?: Casa;
  descricao?: string;
  dias?: number; // janela temporal, default 90
  page?: number;
  pageSize?: number;
}

export interface ListVotacoesResult {
  items: VotacaoListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  dbConfigured: boolean;
}

const DEFAULT_PAGE_SIZE = 20;

export async function listVotacoes(
  filters: ListVotacoesFilters = {},
): Promise<ListVotacoesResult> {
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
  const dias = filters.dias ?? 90;

  const dataLimite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const conditions = [gte(votacoes.dataHoraRegistro, dataLimite)];
  if (filters.casa) conditions.push(eq(votacoes.casa, filters.casa));
  if (filters.descricao?.trim()) {
    conditions.push(ilike(votacoes.descricao, `%${filters.descricao.trim()}%`));
  }

  const where = and(...conditions);

  try {
    const rows = await db
      .select({
        id: votacoes.id,
        casa: votacoes.casa,
        sourceId: votacoes.sourceId,
        dataHoraRegistro: votacoes.dataHoraRegistro,
        descricao: votacoes.descricao,
        aprovacao: votacoes.aprovacao,
        siglaOrgao: votacoes.siglaOrgao,
        votosSim: votacoes.votosSim,
        votosNao: votacoes.votosNao,
        votosAbstencao: votacoes.votosAbstencao,
        votosOutros: votacoes.votosOutros,
        proposicaoSigla: proposicoes.siglaTipo,
        proposicaoNumero: proposicoes.numero,
        proposicaoAno: proposicoes.ano,
      })
      .from(votacoes)
      .leftJoin(proposicoes, eq(votacoes.proposicaoId, proposicoes.id))
      .where(where)
      .orderBy(desc(votacoes.dataHoraRegistro))
      .limit(pageSize)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: count() })
      .from(votacoes)
      .where(where);

    return {
      items: rows.map((r) => ({
        ...r,
        votosSim: r.votosSim ?? 0,
        votosNao: r.votosNao ?? 0,
        votosAbstencao: r.votosAbstencao ?? 0,
        votosOutros: r.votosOutros ?? 0,
      })) as VotacaoListItem[],
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
// Detalhe
// ---------------------------------------------------------------------------

export interface VotacaoDetalhe {
  id: string;
  casa: Casa;
  sourceId: string;
  dataHoraRegistro: Date;
  descricao: string;
  aprovacao: boolean | null;
  siglaOrgao: string | null;
  votosSim: number;
  votosNao: number;
  votosAbstencao: number;
  votosOutros: number;
  uri: string | null;
  proposicao: {
    id: string;
    siglaTipo: string;
    numero: number;
    ano: number;
    ementa: string;
  } | null;
}

export async function getVotacaoById(id: string): Promise<VotacaoDetalhe | null> {
  const db = getDb();
  if (!db) return null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  try {
    const [row] = await db
      .select({
        id: votacoes.id,
        casa: votacoes.casa,
        sourceId: votacoes.sourceId,
        dataHoraRegistro: votacoes.dataHoraRegistro,
        descricao: votacoes.descricao,
        aprovacao: votacoes.aprovacao,
        siglaOrgao: votacoes.siglaOrgao,
        votosSim: votacoes.votosSim,
        votosNao: votacoes.votosNao,
        votosAbstencao: votacoes.votosAbstencao,
        votosOutros: votacoes.votosOutros,
        uri: votacoes.uri,
        propId: proposicoes.id,
        propSigla: proposicoes.siglaTipo,
        propNumero: proposicoes.numero,
        propAno: proposicoes.ano,
        propEmenta: proposicoes.ementa,
      })
      .from(votacoes)
      .leftJoin(proposicoes, eq(votacoes.proposicaoId, proposicoes.id))
      .where(eq(votacoes.id, id))
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      casa: row.casa as Casa,
      sourceId: row.sourceId,
      dataHoraRegistro: row.dataHoraRegistro,
      descricao: row.descricao,
      aprovacao: row.aprovacao,
      siglaOrgao: row.siglaOrgao,
      votosSim: row.votosSim ?? 0,
      votosNao: row.votosNao ?? 0,
      votosAbstencao: row.votosAbstencao ?? 0,
      votosOutros: row.votosOutros ?? 0,
      uri: row.uri,
      proposicao: row.propId
        ? {
            id: row.propId,
            siglaTipo: row.propSigla!,
            numero: row.propNumero!,
            ano: row.propAno!,
            ementa: row.propEmenta!,
          }
        : null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Votos individuais
// ---------------------------------------------------------------------------

export interface VotoDetalhe {
  parlamentarId: string;
  parlamentarNome: string;
  parlamentarFoto: string | null;
  partidoSigla: string | null;
  ufSigla: string | null;
  tipoVoto: string;
}

export async function listVotosByVotacao(votacaoId: string): Promise<VotoDetalhe[]> {
  const db = getDb();
  if (!db) return [];
  if (!/^[0-9a-f-]{36}$/i.test(votacaoId)) return [];

  try {
    const rows = await db
      .select({
        parlamentarId: parlamentares.id,
        parlamentarNome: parlamentares.nome,
        parlamentarFoto: parlamentares.fotoUrl,
        partidoSigla: partidos.sigla,
        ufSigla: ufs.sigla,
        tipoVoto: votos.tipoVoto,
      })
      .from(votos)
      .innerJoin(parlamentares, eq(votos.parlamentarId, parlamentares.id))
      .leftJoin(partidos, eq(votos.partidoIdNaEpoca, partidos.id))
      .leftJoin(ufs, eq(parlamentares.ufId, ufs.id))
      .where(eq(votos.votacaoId, votacaoId))
      .orderBy(asc(parlamentares.nome));
    return rows;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) return [];
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Breakdown por partido
// ---------------------------------------------------------------------------

export interface PartidoBreakdown {
  partidoSigla: string;
  total: number;
  sim: number;
  nao: number;
  abstencao: number;
  outros: number;
  /** Orientação do líder, se tiver sido registrada. */
  orientacao: string | null;
}

export async function getBreakdownPorPartido(votacaoId: string): Promise<PartidoBreakdown[]> {
  const db = getDb();
  if (!db) return [];
  if (!/^[0-9a-f-]{36}$/i.test(votacaoId)) return [];

  try {
    // SQL puro — queries agregadas assim ficam mais claras que no Drizzle fluent.
    const result = await db.execute<{
      partido_sigla: string;
      total: string;
      sim: string;
      nao: string;
      abstencao: string;
      outros: string;
      orientacao: string | null;
    }>(sql`
      SELECT
        p.sigla AS partido_sigla,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE v.tipo_voto = 'Sim') AS sim,
        COUNT(*) FILTER (WHERE v.tipo_voto = 'Não') AS nao,
        COUNT(*) FILTER (WHERE v.tipo_voto = 'Abstenção') AS abstencao,
        COUNT(*) FILTER (WHERE v.tipo_voto NOT IN ('Sim', 'Não', 'Abstenção')) AS outros,
        MAX(o.orientacao) AS orientacao
      FROM votos v
      JOIN partidos p ON p.id = v.partido_id_na_epoca
      LEFT JOIN orientacoes_partidarias o
        ON o.votacao_id = v.votacao_id AND o.partido_id = p.id
      WHERE v.votacao_id = ${votacaoId}
      GROUP BY p.sigla
      ORDER BY total DESC, p.sigla ASC
    `);

    // Drizzle `execute` retorna shape dependendo do driver.
    const rows = Array.isArray(result)
      ? result
      : (result as unknown as { rows: unknown[] }).rows ?? [];

    return (rows as Array<{
      partido_sigla: string;
      total: string | number;
      sim: string | number;
      nao: string | number;
      abstencao: string | number;
      outros: string | number;
      orientacao: string | null;
    }>).map((r) => ({
      partidoSigla: r.partido_sigla,
      total: Number(r.total),
      sim: Number(r.sim),
      nao: Number(r.nao),
      abstencao: Number(r.abstencao),
      outros: Number(r.outros),
      orientacao: r.orientacao,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) return [];
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Análise individual: presença + fidelidade (Task 15)
// ---------------------------------------------------------------------------

export interface AnaliseParlamentar {
  diasConsiderados: number;
  totalVotacoes: number; // votações da mesma casa no período
  votacoesParticipou: number;
  presencaPct: number; // 0..100
  // Fidelidade: % em que votou igual ao líder (apenas quando o líder orientou Sim/Não)
  fidelidadeOrientadas: number; // votações com orientação válida
  fidelidadeAlinhadas: number; // onde votou = orientou
  fidelidadePct: number | null;
  partidoSigla: string | null;
  // Breakdown mensal pro gráfico — ordenado antigo -> recente
  porMes: Array<{
    mes: string; // YYYY-MM
    sim: number;
    nao: number;
    abstencao: number;
    outros: number;
    ausente: number;
  }>;
}

type AnaliseRow = {
  total_votacoes: string | number;
  votacoes_participou: string | number;
  partido_sigla: string | null;
  fidelidade_orientadas: string | number;
  fidelidade_alinhadas: string | number;
} & Record<string, unknown>;

type MesRow = {
  mes: string;
  sim: string | number;
  nao: string | number;
  abstencao: string | number;
  outros: string | number;
  ausente: string | number;
} & Record<string, unknown>;

function unwrapRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: T[] }).rows ?? [];
  }
  return [];
}

export async function getAnaliseParlamentar(
  parlamentarId: string,
  diasConsiderados = 365,
): Promise<AnaliseParlamentar | null> {
  const db = getDb();
  if (!db) return null;
  if (!/^[0-9a-f-]{36}$/i.test(parlamentarId)) return null;

  try {
    // Query principal: pega presença + fidelidade numa só volta no banco.
    // Precisa saber a casa do parlamentar pra filtrar votações aplicáveis.
    const mainResult = await db.execute<AnaliseRow>(sql.raw(`
      WITH alvo AS (
        SELECT id, casa, partido_id FROM parlamentares WHERE id = '${parlamentarId.replace(/'/g, "''")}'
      ),
      vot_casa AS (
        SELECT v.id, v.data_hora_registro
          FROM votacoes v, alvo
         WHERE v.casa = alvo.casa
           AND v.data_hora_registro >= NOW() - INTERVAL '${Number(diasConsiderados)} days'
      ),
      votou AS (
        SELECT COUNT(*) AS n
          FROM votos vo, alvo, vot_casa
         WHERE vo.parlamentar_id = alvo.id
           AND vo.votacao_id = vot_casa.id
      ),
      fidel AS (
        -- votações nas quais o parlamentar votou E o líder do partido dele orientou Sim/Não
        SELECT
          COUNT(*) FILTER (WHERE o.orientacao IN ('Sim','Não')) AS orientadas,
          COUNT(*) FILTER (WHERE o.orientacao IN ('Sim','Não') AND vo.tipo_voto = o.orientacao) AS alinhadas
        FROM votos vo
        JOIN alvo ON alvo.id = vo.parlamentar_id
        JOIN vot_casa ON vot_casa.id = vo.votacao_id
        LEFT JOIN orientacoes_partidarias o
          ON o.votacao_id = vo.votacao_id
         AND o.partido_id = alvo.partido_id
      ),
      partido AS (
        SELECT p.sigla FROM alvo
        LEFT JOIN partidos p ON p.id = alvo.partido_id
      )
      SELECT
        (SELECT COUNT(*) FROM vot_casa)       AS total_votacoes,
        (SELECT n FROM votou)                 AS votacoes_participou,
        (SELECT sigla FROM partido)           AS partido_sigla,
        (SELECT orientadas FROM fidel)        AS fidelidade_orientadas,
        (SELECT alinhadas FROM fidel)         AS fidelidade_alinhadas
    `));
    const [row] = unwrapRows<AnaliseRow>(mainResult);
    if (!row) return null;

    const totalVotacoes = Number(row.total_votacoes);
    const votacoesParticipou = Number(row.votacoes_participou);
    const presencaPct =
      totalVotacoes > 0 ? (votacoesParticipou / totalVotacoes) * 100 : 0;

    const fidelidadeOrientadas = Number(row.fidelidade_orientadas);
    const fidelidadeAlinhadas = Number(row.fidelidade_alinhadas);
    const fidelidadePct =
      fidelidadeOrientadas > 0
        ? (fidelidadeAlinhadas / fidelidadeOrientadas) * 100
        : null;

    // Breakdown mensal
    const mesResult = await db.execute<MesRow>(sql.raw(`
      WITH alvo AS (
        SELECT id, casa FROM parlamentares WHERE id = '${parlamentarId.replace(/'/g, "''")}'
      ),
      vot_casa AS (
        SELECT v.id, v.data_hora_registro, TO_CHAR(v.data_hora_registro, 'YYYY-MM') AS mes
          FROM votacoes v, alvo
         WHERE v.casa = alvo.casa
           AND v.data_hora_registro >= NOW() - INTERVAL '${Number(diasConsiderados)} days'
      ),
      votou AS (
        SELECT vot_casa.mes, vo.tipo_voto
          FROM votos vo
          JOIN alvo ON alvo.id = vo.parlamentar_id
          JOIN vot_casa ON vot_casa.id = vo.votacao_id
      )
      SELECT
        vot_casa.mes AS mes,
        COUNT(*) FILTER (WHERE votou.tipo_voto = 'Sim')       AS sim,
        COUNT(*) FILTER (WHERE votou.tipo_voto = 'Não')       AS nao,
        COUNT(*) FILTER (WHERE votou.tipo_voto = 'Abstenção') AS abstencao,
        COUNT(*) FILTER (
            WHERE votou.tipo_voto IS NOT NULL
              AND votou.tipo_voto NOT IN ('Sim','Não','Abstenção')
        ) AS outros,
        COUNT(DISTINCT vot_casa.id) FILTER (WHERE votou.tipo_voto IS NULL) AS ausente
      FROM vot_casa
      LEFT JOIN votou ON votou.mes = vot_casa.mes
      GROUP BY vot_casa.mes
      ORDER BY vot_casa.mes ASC
    `));
    const mesRows = unwrapRows<MesRow>(mesResult);

    const porMes = mesRows.map((r) => ({
      mes: r.mes,
      sim: Number(r.sim),
      nao: Number(r.nao),
      abstencao: Number(r.abstencao),
      outros: Number(r.outros),
      ausente: Number(r.ausente),
    }));

    return {
      diasConsiderados,
      totalVotacoes,
      votacoesParticipou,
      presencaPct,
      fidelidadeOrientadas,
      fidelidadeAlinhadas,
      fidelidadePct,
      partidoSigla: row.partido_sigla ?? null,
      porMes,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Últimas votações do parlamentar (reusado pelo perfil na Task 12)
// ---------------------------------------------------------------------------

export interface VotoDoParlamentar {
  votacaoId: string;
  dataHoraRegistro: Date;
  descricao: string;
  tipoVoto: string;
  aprovacao: boolean | null;
}

export async function getVotosDoParlamentar(
  parlamentarId: string,
  limit = 20,
): Promise<VotoDoParlamentar[]> {
  const db = getDb();
  if (!db) return [];
  if (!/^[0-9a-f-]{36}$/i.test(parlamentarId)) return [];

  try {
    const rows = await db
      .select({
        votacaoId: votacoes.id,
        dataHoraRegistro: votacoes.dataHoraRegistro,
        descricao: votacoes.descricao,
        tipoVoto: votos.tipoVoto,
        aprovacao: votacoes.aprovacao,
      })
      .from(votos)
      .innerJoin(votacoes, eq(votos.votacaoId, votacoes.id))
      .where(eq(votos.parlamentarId, parlamentarId))
      .orderBy(desc(votacoes.dataHoraRegistro))
      .limit(limit);
    return rows;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) return [];
    throw err;
  }
}

// Silence unused imports
void orientacoesPartidarias;
