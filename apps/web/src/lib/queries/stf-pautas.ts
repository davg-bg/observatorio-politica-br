/**
 * Queries sobre pautas e sessões do STF.
 *
 * Base: tabelas `stf_sessoes` e `stf_pauta_processos` alimentadas pelo job
 * `stf-pautas` (ETL diário). Filtros são sempre em UTC — convertemos a data
 * de BRT (UTC-3) na borda da query.
 */

import { and, asc, gte, lt, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { stfPautaProcessos, stfSessoes } from '@/lib/db/schema';

export interface SessaoSTFItem {
  id: string;
  sourceId: string;
  colegiadoCodigo: string;
  colegiadoDescricao: string;
  dataInicio: string; // ISO
  tipo: string;
  numero: number | null;
  ano: number | null;
  observacao: string | null;
  processosCount: number;
}

export interface ProcessoSTFItem {
  id: string;
  sessaoId: string;
  classe: string;
  numero: string;
  relator: string | null;
  destaque: string | null;
  materiaRelevante: boolean;
  repercussaoGeral: boolean;
  resumoTema: string | null;
}

export interface SessaoSTFComProcessos extends SessaoSTFItem {
  processos: ProcessoSTFItem[];
}

/** Retorna [inicioUTC, fimUTC) de um dia BRT (UTC-3). */
function janelaBrtEmUtc(dataIso: string): { inicio: Date; fim: Date } {
  // dataIso = 'YYYY-MM-DD' representando um dia em BRT.
  // Início do dia BRT = 00:00 BRT = 03:00 UTC.
  const inicio = new Date(`${dataIso}T03:00:00.000Z`);
  const fim = new Date(inicio);
  fim.setUTCDate(fim.getUTCDate() + 1);
  return { inicio, fim };
}

/**
 * Lista sessões de um dia (BRT). Agrupa por colegiado implicitamente —
 * a UI faz esse agrupamento com um simples groupBy.
 */
export async function listSessoesSTFPorData(dataIso: string): Promise<SessaoSTFComProcessos[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const { inicio, fim } = janelaBrtEmUtc(dataIso);
    const sessoes = await db
      .select({
        id: stfSessoes.id,
        sourceId: stfSessoes.sourceId,
        colegiadoCodigo: stfSessoes.colegiadoCodigo,
        colegiadoDescricao: stfSessoes.colegiadoDescricao,
        dataInicio: stfSessoes.dataInicio,
        tipo: stfSessoes.tipo,
        numero: stfSessoes.numero,
        ano: stfSessoes.ano,
        observacao: stfSessoes.observacao,
      })
      .from(stfSessoes)
      .where(and(gte(stfSessoes.dataInicio, inicio), lt(stfSessoes.dataInicio, fim)))
      .orderBy(
        // Plenário primeiro, depois turmas
        sql`CASE ${stfSessoes.colegiadoCodigo} WHEN 'TP' THEN 0 WHEN '1T' THEN 1 WHEN '2T' THEN 2 ELSE 3 END`,
        asc(stfSessoes.dataInicio),
      );

    if (sessoes.length === 0) return [];

    const sessaoIds = sessoes.map((s) => s.id);
    const processos = await db
      .select({
        id: stfPautaProcessos.id,
        sessaoId: stfPautaProcessos.sessaoId,
        classe: stfPautaProcessos.classe,
        numero: stfPautaProcessos.numero,
        relator: stfPautaProcessos.relator,
        destaque: stfPautaProcessos.destaque,
        materiaRelevante: stfPautaProcessos.materiaRelevante,
        repercussaoGeral: stfPautaProcessos.repercussaoGeral,
        resumoTema: stfPautaProcessos.resumoTema,
      })
      .from(stfPautaProcessos)
      .where(sql`${stfPautaProcessos.sessaoId} = ANY(${sessaoIds})`);

    const porSessao = new Map<string, ProcessoSTFItem[]>();
    for (const p of processos) {
      const arr = porSessao.get(p.sessaoId) ?? [];
      arr.push(p);
      porSessao.set(p.sessaoId, arr);
    }

    return sessoes.map((s) => {
      const procs = porSessao.get(s.id) ?? [];
      return {
        ...s,
        dataInicio:
          s.dataInicio instanceof Date ? s.dataInicio.toISOString() : String(s.dataInicio),
        processosCount: procs.length,
        processos: procs,
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) return [];
    throw err;
  }
}

/**
 * Lista as próximas sessões (futuras ou hoje), limitadas a N.
 * Usado em views que mostram "próximas pautas" sem filtrar por dia.
 */
export async function listProximasSessoesSTF(limit = 10): Promise<SessaoSTFItem[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const agora = new Date();
    const rows = await db
      .select({
        id: stfSessoes.id,
        sourceId: stfSessoes.sourceId,
        colegiadoCodigo: stfSessoes.colegiadoCodigo,
        colegiadoDescricao: stfSessoes.colegiadoDescricao,
        dataInicio: stfSessoes.dataInicio,
        tipo: stfSessoes.tipo,
        numero: stfSessoes.numero,
        ano: stfSessoes.ano,
        observacao: stfSessoes.observacao,
        processosCount: sql<number>`(
          SELECT COUNT(*)::int FROM stf_pauta_processos
          WHERE stf_pauta_processos.sessao_id = ${stfSessoes.id}
        )`,
      })
      .from(stfSessoes)
      .where(gte(stfSessoes.dataInicio, agora))
      .orderBy(asc(stfSessoes.dataInicio))
      .limit(limit);
    return rows.map((r) => ({
      ...r,
      dataInicio:
        r.dataInicio instanceof Date ? r.dataInicio.toISOString() : String(r.dataInicio),
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) return [];
    throw err;
  }
}

export function colegiadoLabel(codigo: string): string {
  if (codigo === 'TP') return 'Plenário';
  if (codigo === '1T') return 'Primeira Turma';
  if (codigo === '2T') return 'Segunda Turma';
  return codigo;
}

/** Formata o número do processo como "ADI 4395". */
export function formatarProcesso(p: Pick<ProcessoSTFItem, 'classe' | 'numero'>): string {
  return `${p.classe} ${p.numero}`;
}
