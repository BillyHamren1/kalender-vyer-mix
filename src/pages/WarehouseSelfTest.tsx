/**
 * WarehouseSelfTest — inloggad, read-only release-smoke för lagerflödet.
 * Kör hela A–H-checklistan i den riktiga miljön med ett klick.
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertTriangle, MinusCircle, Loader2, ClipboardCopy } from 'lucide-react';
import { runWarehouseSelfTest, selfTestCheckCount, type SelfTestResult, type SelfTestStatus } from '@/lib/warehouse/selfTest';
import { toast } from 'sonner';

const ICON: Record<SelfTestStatus, React.ComponentType<{ className?: string }>> = {
  pass: CheckCircle2,
  fail: XCircle,
  warn: AlertTriangle,
  skip: MinusCircle,
};

const TONE: Record<SelfTestStatus, string> = {
  pass: 'text-emerald-600',
  fail: 'text-destructive',
  warn: 'text-amber-600',
  skip: 'text-muted-foreground',
};

const WarehouseSelfTest: React.FC = () => {
  const [results, setResults] = useState<SelfTestResult[]>([]);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setResults([]);
    try {
      await runWarehouseSelfTest((r) => setResults((prev) => [...prev, r]));
    } finally {
      setRunning(false);
    }
  };

  const counts = results.reduce<Record<SelfTestStatus, number>>(
    (acc, r) => ({ ...acc, [r.status]: acc[r.status] + 1 }),
    { pass: 0, fail: 0, warn: 0, skip: 0 },
  );

  const copy = () => {
    const text = results.map((r) => `${r.id} ${r.label}: ${r.status.toUpperCase()} — ${r.detail}`).join('\n');
    navigator.clipboard.writeText(text);
    toast.success('Resultat kopierat');
  };

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Lager – inloggat självtest</h1>
        <p className="text-sm text-muted-foreground">
          Kör hela release-smoken som inloggad användare. Endast läsning – inga ändringar sparas.
        </p>
      </header>

      <div className="flex items-center gap-3">
        <Button onClick={run} disabled={running}>
          {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {running ? 'Kör test…' : `Kör ${selfTestCheckCount} tester`}
        </Button>
        {results.length > 0 && !running && (
          <Button variant="outline" onClick={copy}>
            <ClipboardCopy className="mr-2 h-4 w-4" />
            Kopiera resultat
          </Button>
        )}
        {results.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="text-emerald-600">{counts.pass} OK</Badge>
            {counts.warn > 0 && <Badge variant="outline" className="text-amber-600">{counts.warn} varning</Badge>}
            {counts.fail > 0 && <Badge variant="destructive">{counts.fail} fel</Badge>}
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Resultat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {results.length === 0 && (
            <p className="text-sm text-muted-foreground">Inget kört ännu.</p>
          )}
          {results.map((r) => {
            const Icon = ICON[r.status];
            return (
              <div key={r.id} className="flex items-start gap-3 border-b last:border-0 py-2">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${TONE[r.status]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    <span className="font-mono text-xs text-muted-foreground mr-2">{r.id}</span>
                    {r.label}
                  </p>
                  <p className="text-xs text-muted-foreground break-words">{r.detail}</p>
                </div>
                <span className="text-[11px] font-mono text-muted-foreground shrink-0">{r.durationMs} ms</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default WarehouseSelfTest;
