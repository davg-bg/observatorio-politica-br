'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, XCircle, RefreshCcw } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils';

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | {
      kind: 'ok';
      supabase: boolean;
      lastIngest: string | null;
      ingestRunsCount: number;
      note?: string;
    }
  | { kind: 'error'; message: string };

export function StatusWidget() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function checkStatus() {
    setStatus({ kind: 'loading' });
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: 'error', message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setStatus({
        kind: 'ok',
        supabase: data.supabase,
        lastIngest: data.lastIngest,
        ingestRunsCount: data.ingestRunsCount,
        note: data.note,
      });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Status do sistema</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={checkStatus}
            disabled={status.kind === 'loading'}
          >
            {status.kind === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            Verificar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {status.kind === 'idle' && (
          <p className="text-muted-foreground">
            Clique em &quot;Verificar&quot; para checar a conexão com o Supabase e a última
            execução do ETL.
          </p>
        )}

        {status.kind === 'loading' && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checando…
          </p>
        )}

        {status.kind === 'ok' && (
          <>
            <StatusLine
              label="Conexão Supabase"
              ok={status.supabase}
              okText="Online"
              errText="Não configurado"
            />
            <StatusLine
              label="Último ETL"
              ok={status.lastIngest !== null}
              okText={formatRelativeDate(status.lastIngest)}
              errText="nunca"
            />
            <StatusLine
              label="Execuções registradas"
              ok={status.ingestRunsCount > 0}
              okText={String(status.ingestRunsCount)}
              errText="0"
            />
            {status.note && <p className="text-xs text-muted-foreground">{status.note}</p>}
          </>
        )}

        {status.kind === 'error' && (
          <div className="flex items-start gap-2 text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Erro ao verificar status</p>
              <p className="font-mono text-xs">{status.message}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusLine({
  label,
  ok,
  okText,
  errText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  errText: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <XCircle className="h-4 w-4 text-muted-foreground" />
        )}
        <Badge variant={ok ? 'success' : 'outline'}>{ok ? okText : errText}</Badge>
      </div>
    </div>
  );
}
