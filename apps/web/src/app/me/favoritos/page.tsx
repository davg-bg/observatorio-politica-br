import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  listFavoritosParlamentares,
  listFavoritosProposicoes,
} from '@/lib/queries/favoritos';
import { formatRelativeDate } from '@/lib/utils';
import { Star } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Favoritos — Observatório',
};

export const dynamic = 'force-dynamic';

export default async function FavoritosPage() {
  const [parlamentares, proposicoes] = await Promise.all([
    listFavoritosParlamentares(),
    listFavoritosProposicoes(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Meus favoritos</h1>
        <p className="text-sm text-muted-foreground">
          Parlamentares e proposições que você acompanha de perto.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Parlamentares</span>
            <Badge variant="outline">{parlamentares.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {parlamentares.length === 0 ? (
            <EmptyState
              icon={<Star className="h-10 w-10" />}
              title="Nenhum parlamentar favoritado"
              description={
                <>
                  Clique na estrela no perfil de qualquer parlamentar para começar a
                  acompanhar.
                </>
              }
            />
          ) : (
            <ul className="divide-y rounded-md border">
              {parlamentares.map((p) => (
                <li key={p.parlamentarId} className="flex items-center gap-3 p-3">
                  <Avatar
                    src={p.fotoUrl}
                    alt={p.nome}
                    fallback={iniciais(p.nome)}
                    className="h-10 w-10"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/parlamentares/${p.parlamentarId}`}
                      className="font-medium hover:underline"
                    >
                      {p.nome}
                    </Link>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {p.casa === 'camara' ? 'Dep' : 'Sen'}
                      </Badge>
                      {p.partidoSigla && <span className="font-mono">{p.partidoSigla}</span>}
                      {p.ufSigla && (
                        <>
                          <span>·</span>
                          <span>{p.ufSigla}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeDate(p.criadoEm)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Proposições</span>
            <Badge variant="outline">{proposicoes.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {proposicoes.length === 0 ? (
            <EmptyState
              icon={<Star className="h-10 w-10" />}
              title="Nenhuma proposição favoritada"
              description="Favoritar proposições diretamente na página delas chegará junto com a lista de proposições."
            />
          ) : (
            <ul className="divide-y rounded-md border">
              {proposicoes.map((p) => (
                <li key={p.proposicaoId} className="flex items-start gap-3 p-3 text-sm">
                  <Badge variant="outline" className="shrink-0 font-mono">
                    {p.siglaTipo} {p.numero}/{p.ano}
                  </Badge>
                  <p className="line-clamp-2 flex-1">{p.ementa}</p>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeDate(p.criadoEm)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function iniciais(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
