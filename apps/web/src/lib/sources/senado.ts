/**
 * Cliente mínimo para a API do Senado — fetch server-side, sem persistência.
 */

const BASE_URL = 'https://legis.senado.leg.br/dadosabertos';

export interface ReuniaoSenado {
  codigo: string;
  titulo: string;
  descricao?: string;
  dataInicio: string;
  dataInicioFormatadaComObsHorario?: string;
  status?: string;
  situacao?: string;
  local?: string;
  colegiadoCriador?: {
    sigla?: string;
    nome?: string;
    siglaCasa?: string;
  };
}

/**
 * Agenda de reuniões para uma data específica (formato YYYYMMDD).
 * Fonte: /agendareuniao/{data}.
 */
export async function listReunioesSenado(options: {
  data: string; // YYYY-MM-DD
  revalidate?: number;
}): Promise<ReuniaoSenado[]> {
  const dataSemHifen = options.data.replace(/-/g, '');
  try {
    const res = await fetch(`${BASE_URL}/agendareuniao/${dataSemHifen}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: options.revalidate ?? 600 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      AgendaReuniao?: {
        reunioes?: { reuniao?: ReuniaoSenado | ReuniaoSenado[] };
      };
    };
    const inner = json.AgendaReuniao?.reunioes?.reuniao;
    if (!inner) return [];
    return Array.isArray(inner) ? inner : [inner];
  } catch {
    return [];
  }
}
