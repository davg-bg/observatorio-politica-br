'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { VotoDetalhe } from '@/lib/queries/votacoes';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';

interface Props {
  votos: VotoDetalhe[];
}

/** Lista pesquisável e filtrável de votos individuais. Client component. */
export function VotosLista({ votos }: Props) {
  const [query, setQuery] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('');
  const [partidoFilter, setPartidoFilter] = useState<string>('');

  const partidosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const v of votos) if (v.partidoSigla) set.add(v.partidoSigla);
    return Array.from(set).sort();
  }, [votos]);

  const tiposDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const v of votos) set.add(v.tipoVoto);
    return Array.from(set).sort();
  }, [votos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return votos.filter((v) => {
      if (tipoFilter && v.tipoVoto !== tipoFilter) return false;
      if (partidoFilter && v.partidoSigla !== partidoFilter) return false;
      if (q && !v.parlamentarNome.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [votos, query, tipoFilter, partidoFilter]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nome…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
            aria-label="Buscar"
          />
        </div>
        <NativeSelect
          value={tipoFilter}
          onChange={(e) => setTipoFilter(e.target.value)}
          aria-label="Filtrar por tipo de voto"
        >
          <option value="">Todos os votos</option>
          {tiposDisponiveis.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={partidoFilter}
          onChange={(e) => setPartidoFilter(e.target.value)}
          aria-label="Filtrar por partido"
        >
          <option value="">Todos os partidos</option>
          {partidosDisponiveis.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </NativeSelect>
      </div>

      <p className="text-xs text-muted-foreground">
        Exibindo {filtered.length} de {votos.length}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum voto corresponde aos filtros.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {filtered.map((v) => (
            <li key={v.parlamentarId} className="flex items-center gap-3 p-2">
              <Avatar
                src={v.parlamentarFoto}
                alt={v.parlamentarNome}
                fallback={iniciais(v.parlamentarNome)}
                className="h-10 w-10"
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/parlamentares/${v.parlamentarId}`}
                  className="truncate text-sm font-medium hover:underline"
                >
                  {v.parlamentarNome}
                </Link>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {v.partidoSigla && <span className="font-mono">{v.partidoSigla}</span>}
                  {v.partidoSigla && v.ufSigla && <span>·</span>}
                  {v.ufSigla && <span>{v.ufSigla}</span>}
                </div>
              </div>
              <VotoBadge tipo={v.tipoVoto} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VotoBadge({ tipo }: { tipo: string }) {
  const variantClasses: Record<string, string> = {
    Sim: 'border-emerald-500/50 bg-emerald-50 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100',
    Não: 'border-rose-500/50 bg-rose-50 text-rose-800 dark:bg-rose-900 dark:text-rose-100',
    Abstenção: 'border-amber-500/50 bg-amber-50 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
  };
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 font-mono',
        variantClasses[tipo] ?? 'border-slate-400/50 bg-slate-50 dark:bg-slate-800',
      )}
    >
      {tipo}
    </Badge>
  );
}

function iniciais(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
