/**
 * Queries sobre o Executivo federal: ministros + MPs em tramitação.
 */

import { asc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { ministros } from '@/lib/db/schema';

export interface MinistroItem {
  id: string;
  orgaoSigla: string;
  orgaoNome: string;
  nome: string;
  partidoSigla: string | null;
  fotoUrl: string | null;
  siteOficial: string | null;
}

export async function listMinistrosAtuais(): Promise<MinistroItem[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = await db
      .select({
        id: ministros.id,
        orgaoSigla: ministros.orgaoSigla,
        orgaoNome: ministros.orgaoNome,
        nome: ministros.nome,
        partidoSigla: ministros.partidoSigla,
        fotoUrl: ministros.fotoUrl,
        siteOficial: ministros.siteOficial,
      })
      .from(ministros)
      .where(eq(ministros.emExercicio, true))
      .orderBy(asc(ministros.orgaoNome));
    return rows;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) return [];
    throw err;
  }
}

export interface MedidaProvisoria {
  id: string;
  siglaTipo: string;
  numero: number;
  ano: number;
  ementa: string;
  dataApresentacao: string | null;
  dataUltimaTramitacao: string | null;
  descricaoSituacao: string | null;
  siglaOrgaoAtual: string | null;
  statusResumido: 'arquivada' | 'caducou' | 'convertida_em_lei' | 'possivel_caduca' | 'em_tramitacao';
  dataVigenciaEstimada: string | null;
}

type MPRow = {
  id: string;
  sigla_tipo: string;
  numero: string | number;
  ano: string | number;
  ementa: string;
  data_apresentacao: string | Date | null;
  data_ultima_tramitacao: string | Date | null;
  descricao_situacao: string | null;
  sigla_orgao_atual: string | null;
  status_resumido: string;
  data_vigencia_estimada: string | Date | null;
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

export async function listMedidasProvisorias(limit = 50): Promise<MedidaProvisoria[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const result = await db.execute<MPRow>(sql`
      SELECT id, sigla_tipo, numero, ano, ementa,
             data_apresentacao, data_ultima_tramitacao,
             descricao_situacao, sigla_orgao_atual,
             status_resumido, data_vigencia_estimada
        FROM v_medidas_provisorias
       WHERE arquivada = FALSE
       ORDER BY data_apresentacao DESC NULLS LAST
       LIMIT ${limit}
    `);
    const rows = unwrapRows<MPRow>(result);
    return rows.map((r) => ({
      id: r.id,
      siglaTipo: r.sigla_tipo,
      numero: Number(r.numero),
      ano: Number(r.ano),
      ementa: r.ementa,
      dataApresentacao: toIsoOrNull(r.data_apresentacao),
      dataUltimaTramitacao: toIsoOrNull(r.data_ultima_tramitacao),
      descricaoSituacao: r.descricao_situacao,
      siglaOrgaoAtual: r.sigla_orgao_atual,
      statusResumido: r.status_resumido as MedidaProvisoria['statusResumido'],
      dataVigenciaEstimada: toIsoOrNull(r.data_vigencia_estimada),
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) return [];
    throw err;
  }
}
