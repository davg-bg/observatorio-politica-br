import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Search, X } from 'lucide-react';

interface FiltersProps {
  currentFilters: {
    casa?: string;
    uf?: string;
    partido?: string;
    nome?: string;
  };
  availableUfs: Array<{ sigla: string; nome: string }>;
  availablePartidos: Array<{ sigla: string }>;
}

/**
 * Filtros server-side: um <form method="GET"> que recarrega a página com
 * os novos searchParams. Sem JS necessário (progressive enhancement natural).
 */
export function ParlamentaresFilters({
  currentFilters,
  availableUfs,
  availablePartidos,
}: FiltersProps) {
  const hasActiveFilter = Boolean(
    currentFilters.casa || currentFilters.uf || currentFilters.partido || currentFilters.nome,
  );

  return (
    <form
      method="GET"
      action="/parlamentares"
      className="grid gap-3 rounded-lg border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          name="nome"
          placeholder="Buscar por nome…"
          defaultValue={currentFilters.nome ?? ''}
          className="pl-8"
          aria-label="Buscar por nome"
        />
      </div>

      <NativeSelect name="casa" defaultValue={currentFilters.casa ?? ''} aria-label="Casa">
        <option value="">Todas as casas</option>
        <option value="camara">Câmara dos Deputados</option>
        <option value="senado">Senado Federal</option>
      </NativeSelect>

      <NativeSelect name="uf" defaultValue={currentFilters.uf ?? ''} aria-label="UF">
        <option value="">Todas as UFs</option>
        {availableUfs.map((uf) => (
          <option key={uf.sigla} value={uf.sigla}>
            {uf.sigla} — {uf.nome}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        name="partido"
        defaultValue={currentFilters.partido ?? ''}
        aria-label="Partido"
      >
        <option value="">Todos os partidos</option>
        {availablePartidos.map((p) => (
          <option key={p.sigla} value={p.sigla}>
            {p.sigla}
          </option>
        ))}
      </NativeSelect>

      <div className="flex items-center gap-2">
        <Button type="submit">Filtrar</Button>
        {hasActiveFilter && (
          <Button type="button" variant="ghost" size="icon" asChild>
            <Link href="/parlamentares" aria-label="Limpar filtros">
              <X className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
    </form>
  );
}
