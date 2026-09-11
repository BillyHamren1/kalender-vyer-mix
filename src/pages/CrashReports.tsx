/**
 * CrashReports — admin-vy över automatiskt insamlade klientfel.
 * Read-only. Läser client_diagnostics (RLS: admin i egen organisation).
 */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

interface CrashRow {
  id: string;
  created_at: string;
  code: string;
  source: string;
  severity: string;
  message: string;
  route: string | null;
  platform: string | null;
  app_mode: string | null;
  user_id: string | null;
  metadata: Record<string, unknown> | null;
}

const SEVERITY_TONE: Record<string, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  error: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  warning: 'bg-muted text-muted-foreground',
  info: 'bg-muted text-muted-foreground',
};

const CrashReports: React.FC = () => {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['client-diagnostics'],
    queryFn: async (): Promise<CrashRow[]> => {
      const { data, error } = await supabase
        .from('client_diagnostics')
        .select('id, created_at, code, source, severity, message, route, platform, app_mode, user_id, metadata')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CrashRow[];
    },
    staleTime: 30_000,
  });

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Kraschrapporter</h1>
          <p className="text-sm text-muted-foreground">
            Fel som appen skickat in automatiskt. Ingen användare behöver rapportera något.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Uppdatera
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Hämtar…
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Kunde inte hämta kraschrapporter. Kontrollera att du är inloggad som administratör.
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && rows.length === 0 && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">Inga fel registrerade.</CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <Card key={row.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <Badge variant="outline" className={SEVERITY_TONE[row.severity] ?? ''}>
                  {row.severity}
                </Badge>
                <span className="font-mono">{row.code}</span>
                <span className="text-muted-foreground">
                  {new Date(row.created_at).toLocaleString('sv-SE')}
                </span>
                {row.route && <span className="text-muted-foreground">· {row.route}</span>}
                {row.app_mode && <span className="text-muted-foreground">· {row.app_mode}</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <p className="text-sm break-words">{row.message}</p>
              <div className="text-xs text-muted-foreground">
                Källa: {row.source}
                {row.platform ? ` · ${row.platform}` : ''}
                {row.user_id ? ` · användare ${row.user_id.slice(0, 8)}…` : ''}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              >
                {expanded === row.id ? 'Dölj teknisk info' : 'Visa teknisk info'}
              </Button>
              {expanded === row.id && (
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(row.metadata ?? {}, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default CrashReports;
