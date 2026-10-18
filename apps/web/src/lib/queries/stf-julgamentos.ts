/**
 * Queries sobre julgamentos do STF (EXPERIMENTAL).
 *
 * Alimentada por scraping do Portal de Notícias. UI deve mostrar badge de
 * aviso sempre que renderizar esses dados.
 */

import { desc, gte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { stfJulgamentos } from '@/lib/db/schema';

export interface JulgamentoSTFItem {
  id: string;
  sourceUrl: string;
  titulo: string;
  dataPublicacao: string;
  dataJulgamento: string | null;
  processoClasse: string | null;
  processoNumero: string | null;
  processoUrlOficial: string | null;
  temaRepercussaoGeral: string | null;
  resumo: string;
  teseFixada: string | null;
  resultado: string | null;
  foiUnanime: boolean;
  tipoSessao: string | null;
  ministrosVencedores: string[];
  ministrosVencidos: string[];
  ministrosImpedidos: string[];
  confiancaParsing: number;
}

type SelectRow = {
  id: string;
  sourceUrl: string;
  titulo: string;
  dataPublicacao: Date | string;
  dataJulgamento: string | null;
  processoClasse: string | null;
  processoNumero: string | null;
  processoUrlOficial: string | null;
  temaRepercussaoGeral: string | null;
  resumo: string;
  teseFixada: string | null;
  resultado: string | null;
  foiUnanime: boolean;
  tipoSessao: string | null;
  ministrosVencedores: string[] | null;
  ministrosVencidos: string[] | null;
  ministrosImpedidos: string[] | null;
  confiancaParsing: number;
};

function rowToItem(r: SelectRow): JulgamentoSTFItem {
  return {
    ...r,
    dataPublicacao:
      r.dataPublicacao instanceof Date
        ? r.dataPublicacao.toISOString()
        : String(r.dataPublicacao),
    dataJulgamento: r.dataJulgamento ? String(r.dataJulgamento) : null,
    ministrosVencedores: r.ministrosVencedores ?? [],
    ministrosVencidos: r.ministrosVencidos ?? [],
    ministrosImpedidos: r.ministrosImpedidos ?? [],
  };
}

/**
 * Lista julgamentos recentes com confiança mínima.
 * `minConfianca` default 30 corta posts onde o parser extraiu muito pouco.
 */
export async function listJulgamentosSTF(opts?: {
  limit?: number;
  minConfianca?: number;
}): Promise<JulgamentoSTFItem[]> {
  const db = getDb();
  if (!db) return [];
  const limit = opts?.limit ?? 30;
  const minConfianca = opts?.minConfianca ?? 30;

  try {
    const rows = await db
      .select({
        id: stfJulgamentos.id,
        sourceUrl: stfJulgamentos.sourceUrl,
        titulo: stfJulgamentos.titulo,
        dataPublicacao: stfJulgamentos.dataPublicacao,
        dataJulgamento: stfJulgamentos.dataJulgamento,
        processoClasse: stfJulgamentos.processoClasse,
        processoNumero: stfJulgamentos.processoNumero,
        processoUrlOficial: stfJulgamentos.processoUrlOficial,
        temaRepercussaoGeral: stfJulgamentos.temaRepercussaoGeral,
        resumo: stfJulgamentos.resumo,
        teseFixada: stfJulgamentos.teseFixada,
        resultado: stfJulgamentos.resultado,
        foiUnanime: stfJulgamentos.foiUnanime,
        tipoSessao: stfJulgamentos.tipoSessao,
        ministrosVencedores: stfJulgamentos.ministrosVencedores,
        ministrosVencidos: stfJulgamentos.ministrosVencidos,
        ministrosImpedidos: stfJulgamentos.ministrosImpedidos,
        confiancaParsing: stfJulgamentos.confiancaParsing,
      })
      .from(stfJulgamentos)
      .where(gte(stfJulgamentos.confiancaParsing, minConfianca))
      .orderBy(desc(stfJulgamentos.dataPublicacao))
      .limit(limit);
    return rows.map(rowToItem);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) return [];
    throw err;
  }
}

export interface STFJulgStats {
  total: number;
  unanimes: number;
  comPlacar: number;
  pctConfiancaAlta: number;
}

export function computeJulgStats(items: JulgamentoSTFItem[]): STFJulgStats {
  const total = items.length;
  const unanimes = items.filter((i) => i.foiUnanime).length;
  const comPlacar = items.filter((i) => i.ministrosVencedores.length > 0).length;
  const confiancaAlta = items.filter((i) => i.confiancaParsing >= 70).length;
  return {
    total,
    unanimes,
    comPlacar,
    pctConfiancaAlta: total > 0 ? Math.round((confiancaAlta / total) * 100) : 0,
  };
}

export function resultadoLabel(resultado: string | null): string {
  switch (resultado) {
    case 'unanime':
      return 'Unanimidade';
    case 'maioria':
      return 'Maioria';
    case 'modulada':
      return 'Modulada';
    default:
      return 'Não classificado';
  }
}
