/**
 * Cliente mínimo para a API da Câmara dos Deputados — usado em páginas
 * server-side que puxam dados efêmeros (agenda, pautas) direto na origem,
 * sem passar pelo banco.
 *
 * Nunca use isso para dados que devem ter histórico: a camada de persistência
 * é o Postgres via Drizzle, não essa API em runtime.
 */

const BASE_URL = 'https://dadosabertos.camara.leg.br/api/v2';

export interface EventoCamara {
  id: number;
  dataHoraInicio: string;
  dataHoraFim: string | null;
  situacao: string;
  descricaoTipo: string;
  descricao: string | null;
  localCamara?: {
    nome?: string | null;
  };
  localExterno?: string | null;
  urlRegistro?: string | null;
  orgaos?: Array<{
    sigla: string;
    nome?: string;
    nomeResumido?: string;
  }>;
}

/**
 * Lista eventos num intervalo (default: hoje). Retorna lista vazia em erro —
 * agenda não deve derrubar a página.
 */
export async function listEventosCamara(options: {
  dataInicio: string;
  dataFim: string;
  revalidate?: number;
}): Promise<EventoCamara[]> {
  const params = new URLSearchParams({
    dataInicio: options.dataInicio,
    dataFim: options.dataFim,
    itens: '100',
    ordem: 'ASC',
    ordenarPor: 'dataHoraInicio',
  });

  try {
    const res = await fetch(`${BASE_URL}/eventos?${params}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: options.revalidate ?? 600 }, // 10 min
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { dados?: EventoCamara[] };
    return json.dados ?? [];
  } catch {
    return [];
  }
}

export function camaraEventoUrl(id: number): string {
  return `https://www.camara.leg.br/evento-legislativo/${id}`;
}
