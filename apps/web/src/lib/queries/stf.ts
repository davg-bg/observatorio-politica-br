/**
 * Queries sobre o Supremo Tribunal Federal (STF).
 *
 * Composição atual = `stf_ministros WHERE em_exercicio = TRUE`, ordenada por
 * `ordem_antiguidade` (1 = mais antigo). Vagas abertas aparecem via contagem.
 */

import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { stfMinistros } from '@/lib/db/schema';

export interface MinistroSTFItem {
  id: string;
  nome: string;
  nomeCompleto: string | null;
  dataNascimento: string | null;
  localNascimento: string | null;
  presidenteIndicou: string;
  partidoIndicacao: string | null;
  dataPosse: string;
  dataAposentadoriaCompulsoria: string | null;
  cargoAtual: string | null;
  formacaoAcademica: string | null;
  fotoUrl: string | null;
  ordemAntiguidade: number | null;
}

const TOTAL_CADEIRAS = 11;

export async function listMinistrosSTF(): Promise<MinistroSTFItem[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = await db
      .select({
        id: stfMinistros.id,
        nome: stfMinistros.nome,
        nomeCompleto: stfMinistros.nomeCompleto,
        dataNascimento: stfMinistros.dataNascimento,
        localNascimento: stfMinistros.localNascimento,
        presidenteIndicou: stfMinistros.presidenteIndicou,
        partidoIndicacao: stfMinistros.partidoIndicacao,
        dataPosse: stfMinistros.dataPosse,
        dataAposentadoriaCompulsoria: stfMinistros.dataAposentadoriaCompulsoria,
        cargoAtual: stfMinistros.cargoAtual,
        formacaoAcademica: stfMinistros.formacaoAcademica,
        fotoUrl: stfMinistros.fotoUrl,
        ordemAntiguidade: stfMinistros.ordemAntiguidade,
      })
      .from(stfMinistros)
      .where(eq(stfMinistros.emExercicio, true))
      .orderBy(asc(stfMinistros.ordemAntiguidade));
    return rows as MinistroSTFItem[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) return [];
    throw err;
  }
}

export interface STFStats {
  emExercicio: number;
  vagas: number;
  idadeMediaAnos: number | null;
  anosParaProximaAposentadoria: number | null;
}

/**
 * Métricas simples derivadas da composição atual.
 * - vagas = 11 - em_exercicio
 * - idade média (em anos completos)
 * - anos até a próxima aposentadoria compulsória
 */
export function computeStfStats(ministros: MinistroSTFItem[]): STFStats {
  const emExercicio = ministros.length;
  const vagas = Math.max(0, TOTAL_CADEIRAS - emExercicio);
  const hoje = new Date();

  const idades = ministros
    .map((m) => {
      if (!m.dataNascimento) return null;
      const nasc = new Date(m.dataNascimento);
      let idade = hoje.getFullYear() - nasc.getFullYear();
      const m0 = hoje.getMonth() - nasc.getMonth();
      if (m0 < 0 || (m0 === 0 && hoje.getDate() < nasc.getDate())) idade -= 1;
      return idade;
    })
    .filter((i): i is number => i != null);

  const idadeMediaAnos =
    idades.length > 0 ? Math.round(idades.reduce((a, b) => a + b, 0) / idades.length) : null;

  const futurasAposentadorias = ministros
    .map((m) => (m.dataAposentadoriaCompulsoria ? new Date(m.dataAposentadoriaCompulsoria) : null))
    .filter((d): d is Date => d != null && d > hoje)
    .sort((a, b) => a.getTime() - b.getTime());

  const anosParaProximaAposentadoria =
    futurasAposentadorias.length > 0
      ? Math.round((futurasAposentadorias[0].getTime() - hoje.getTime()) / (365.25 * 86400 * 1000))
      : null;

  return { emExercicio, vagas, idadeMediaAnos, anosParaProximaAposentadoria };
}
