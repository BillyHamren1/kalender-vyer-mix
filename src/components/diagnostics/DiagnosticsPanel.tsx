import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { useDiagnostics } from '@/hooks/diagnostics/useDiagnostics';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const severityLabel: Record<string, string> = {
  info: 'Info',
  warning: 'Varning',
  error: 'Fel',
  critical: 'Kritiskt',
};

export const DiagnosticsPanel: React.FC = () => {
  const { events, latest, clear } = useDiagnostics();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Automatisk diagnostik
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {latest ? (
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{latest.insight.title}</p>
                <p className="mt-1 text-xs text-muted-foreground break-words">{latest.code} • {severityLabel[latest.severity] ?? latest.severity}</p>
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {new Date(latest.timestamp).toLocaleTimeString('sv-SE')}
              </span>
            </div>
            <p className="mt-2 text-xs text-foreground">{latest.message}</p>
            <p className="mt-2 text-xs text-muted-foreground">Orsak: {latest.insight.probableCause}</p>
            <p className="mt-1 text-xs text-muted-foreground">Förslag: {latest.insight.suggestion}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Inga upptäckta fel ännu.</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Sparade händelser: {events.length}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => window.location.reload()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Ladda om
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={clear}>
              <Trash2 className="h-3.5 w-3.5" />
              Rensa
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};