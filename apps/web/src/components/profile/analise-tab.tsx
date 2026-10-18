import type { AnaliseParlamentar } from '@/lib/queries/votacoes';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';

interface Props {
  analise: AnaliseParlamentar | null;
}

export function AnaliseTab({ analise }: Props) {
  if (!analise || analise.totalVotacoes === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Sem votações suficientes para análise na janela de {analise?.diasConsiderados ?? 365}{' '}
          dias.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          titulo="Taxa de presença"
          valor={`${analise.presencaPct.toFixed(1)}%`}
          descricao={`Participou em ${analise.votacoesParticipou} de ${analise.totalVotacoes} votações da sua casa.`}
          cor={colorForPct(analise.presencaPct)}
        />
        <MetricCard
          titulo={`Fidelidade ao ${analise.partidoSigla ?? 'partido'}`}
          valor={
            analise.fidelidadePct !== null ? `${analise.fidelidadePct.toFixed(1)}%` : '—'
          }
          descricao={
            analise.fidelidadeOrientadas === 0
              ? 'Nenhuma votação da janela teve orientação partidária registrada.'
              : `Votou junto com o líder em ${analise.fidelidadeAlinhadas} de ${analise.fidelidadeOrientadas} votações orientadas.`
          }
          cor={analise.fidelidadePct !== null ? colorForPct(analise.fidelidadePct) : 'text-muted-foreground'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Atividade mensal</span>
            <Badge variant="outline" className="font-normal">
              últimos {analise.diasConsiderados} dias
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {analise.porMes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados mensais.</p>
          ) : (
            <AtividadeMensalChart porMes={analise.porMes} />
          )}
        </CardContent>
      </Card>

      <MetodologiaAnalise />
    </div>
  );
}

function MetricCard({
  titulo,
  valor,
  descricao,
  cor,
}: {
  titulo: string;
  valor: string;
  descricao: string;
  cor: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</div>
        <div className={cn('font-mono text-3xl font-bold', cor)}>{valor}</div>
        <p className="text-xs text-muted-foreground">{descricao}</p>
      </CardContent>
    </Card>
  );
}

function colorForPct(pct: number): string {
  if (pct >= 85) return 'text-emerald-700';
  if (pct >= 65) return 'text-amber-700';
  if (pct >= 40) return 'text-orange-700';
  return 'text-rose-700';
}

/**
 * Gráfico de barras empilhadas SVG, server-rendered. Cada mês é uma coluna
 * mostrando sim/não/abstenção/outros/ausente proporcional ao total.
 */
function AtividadeMensalChart({ porMes }: { porMes: AnaliseParlamentar['porMes'] }) {
  const width = 100 * porMes.length;
  const height = 160;
  const padding = { top: 10, bottom: 25, left: 0, right: 0 };
  const chartHeight = height - padding.top - padding.bottom;
  const barWidth = 60;
  const colGap = 100;

  const maxTotal = Math.max(
    1,
    ...porMes.map((m) => m.sim + m.nao + m.abstencao + m.outros + m.ausente),
  );

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="min-w-full"
      >
        {porMes.map((m, i) => {
          const total = m.sim + m.nao + m.abstencao + m.outros + m.ausente;
          const x = i * colGap + (colGap - barWidth) / 2;
          const scale = (chartHeight * total) / maxTotal;

          const segments: Array<{ cor: string; valor: number; label: string }> = [
            { cor: '#10b981', valor: m.sim, label: 'Sim' },
            { cor: '#f43f5e', valor: m.nao, label: 'Não' },
            { cor: '#f59e0b', valor: m.abstencao, label: 'Abstenção' },
            { cor: '#64748b', valor: m.outros, label: 'Outros' },
            { cor: '#e5e7eb', valor: m.ausente, label: 'Ausente' },
          ];

          let yCursor = padding.top + (chartHeight - scale);
          return (
            <g key={m.mes}>
              <title>
                {formatMes(m.mes)}: Sim {m.sim}, Não {m.nao}, Abst {m.abstencao}, Outros{' '}
                {m.outros}, Ausente {m.ausente}
              </title>
              {segments.map((s, idx) => {
                if (s.valor === 0 || total === 0) return null;
                const h = (s.valor / total) * scale;
                const el = (
                  <rect
                    key={idx}
                    x={x}
                    y={yCursor}
                    width={barWidth}
                    height={h}
                    fill={s.cor}
                  >
                    <title>{`${s.label}: ${s.valor}`}</title>
                  </rect>
                );
                yCursor += h;
                return el;
              })}
              <text
                x={x + barWidth / 2}
                y={height - 10}
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
                className="text-muted-foreground"
              >
                {formatMes(m.mes).slice(0, 3)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Legend color="#10b981" label="Sim" />
        <Legend color="#f43f5e" label="Não" />
        <Legend color="#f59e0b" label="Abstenção" />
        <Legend color="#64748b" label="Outros" />
        <Legend color="#e5e7eb" label="Ausente" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: color }} />
      {label}
    </span>
  );
}

function formatMes(iso: string): string {
  const [year, month] = iso.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

function MetodologiaAnalise() {
  return (
    <Card>
      <CardContent className="flex gap-3 py-4 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p>
            <strong>Presença</strong> conta todas as votações nominais da casa dele no período.
            Participar = ter voto registrado (Sim/Não/Abstenção/Obstrução/etc).
          </p>
          <p>
            <strong>Fidelidade</strong> só considera votações em que o líder do partido orientou
            Sim ou Não (orientações &ldquo;Liberado&rdquo; ou vazias são excluídas). Mede quando ele
            seguiu a bancada vs. votou diferente.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
