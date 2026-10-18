import { buildSimLookup, keyPar, siglasOrdenadas, type ParAlinhamento } from '@/lib/queries/alinhamento';
import { cn } from '@/lib/utils';

interface Props {
  pares: ParAlinhamento[];
}

/**
 * Heatmap NxN de similaridade entre partidos. Server Component: toda a
 * matriz é renderizada estática — hover tooltips são nativos (title="").
 */
export function MatrizAlinhamento({ pares }: Props) {
  if (pares.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Sem dados suficientes de alinhamento nesta janela. É necessário pelo menos 10
        votações comuns entre dois partidos para gerar uma linha.
      </p>
    );
  }

  const siglas = siglasOrdenadas(pares);
  const lookup = buildSimLookup(pares);

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="min-w-full text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-10 bg-card p-2 text-right font-mono text-xs text-muted-foreground">
              /
            </th>
            {siglas.map((s) => (
              <th
                key={s}
                className="sticky top-0 z-10 whitespace-nowrap bg-card p-1 text-center font-mono text-xs"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {siglas.map((rowSigla) => (
            <tr key={rowSigla}>
              <th
                scope="row"
                className="sticky left-0 z-[5] bg-card p-2 text-right font-mono text-xs"
              >
                {rowSigla}
              </th>
              {siglas.map((colSigla) => {
                if (rowSigla === colSigla) {
                  return <td key={colSigla} className="h-7 w-7 bg-muted/40" />;
                }
                const par = lookup.get(keyPar(rowSigla, colSigla));
                return (
                  <Cell
                    key={colSigla}
                    par={par}
                    partidoLinha={rowSigla}
                    partidoColuna={colSigla}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  par,
  partidoLinha,
  partidoColuna,
}: {
  par?: ParAlinhamento;
  partidoLinha: string;
  partidoColuna: string;
}) {
  if (!par) {
    return (
      <td
        className="h-7 w-7 bg-muted/20"
        title={`${partidoLinha} × ${partidoColuna}: sem votações suficientes`}
      />
    );
  }

  const sim = par.similaridade;
  const cor = colorForSimilarity(sim);
  const pct = par.pctConcordancia.toFixed(0);

  return (
    <td
      className={cn('h-7 w-7 text-center font-mono text-[10px]', cor.text)}
      style={{ backgroundColor: cor.bg }}
      title={`${partidoLinha} × ${partidoColuna}\nSimilaridade: ${sim.toFixed(2)}\nConcordância: ${pct}%\nVotações comuns: ${par.votacoesComuns}`}
    >
      {pct}
    </td>
  );
}

/**
 * Diverging color scale: azul (−1 oposição) → cinza (0) → verde (+1 alinhamento).
 * Usa `color-mix` do CSS pra interpolar HSL em runtime.
 */
function colorForSimilarity(sim: number): { bg: string; text: string } {
  const clamped = Math.max(-1, Math.min(1, sim));
  if (clamped >= 0) {
    // 0 a +1: cinza-claro -> verde-forte
    const strength = clamped; // 0..1
    return {
      bg: `hsl(145 60% ${95 - strength * 40}%)`, // 95% claro -> 55% médio
      text: strength > 0.5 ? 'text-emerald-900' : 'text-slate-700',
    };
  }
  // -1 a 0: azul-forte -> cinza-claro
  const strength = Math.abs(clamped);
  return {
    bg: `hsl(220 70% ${95 - strength * 40}%)`,
    text: strength > 0.5 ? 'text-blue-900' : 'text-slate-700',
  };
}
