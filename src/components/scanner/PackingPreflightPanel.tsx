import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ShieldCheck, ShieldAlert, RefreshCw, ChevronDown, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { runPackingPreflightCheck, type PreflightResult, type PreflightItem } from '@/services/scannerService';
import { toast } from 'sonner';

interface Props {
  packingId: string;
  bookingNumber?: string | null;
  className?: string;
}

const statusBadge = (status: PreflightItem['status']) => {
  if (status === 'PASS') return <Badge className="bg-green-600 hover:bg-green-600 text-white">PASS</Badge>;
  if (status === 'WARNING') return <Badge className="bg-amber-500 hover:bg-amber-500 text-white">WARNING</Badge>;
  return <Badge variant="destructive">BLOCKED</Badge>;
};

export const PackingPreflightPanel: React.FC<Props> = ({ packingId, bookingNumber, className }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await runPackingPreflightCheck(packingId, bookingNumber);
      setResult(res);
      if (res.summary.blocked === 0) {
        toast.success('Packlistan är redo för scanning');
      } else {
        toast.error(`${res.summary.blocked} produkter matchar inte WMS säkert`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Preflight misslyckades');
    } finally {
      setLoading(false);
    }
  };

  const blocked = result?.summary.blocked ?? 0;
  const warnings = result?.summary.warning ?? 0;
  const ok = result && blocked === 0;
  const problems = (result?.items || []).filter((r) => r.status !== 'PASS');

  return (
    <Card className={className}>
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">WMS-koppling</span>
          </div>
          <Button size="sm" variant="outline" onClick={run} disabled={loading} className="h-8 gap-1.5">
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            <span className="text-xs">Kontrollera WMS-koppling</span>
          </Button>
        </div>

        {result && (
          <>
            {ok ? (
              <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-2.5">
                <CheckCircle2 className="h-4 w-4 text-green-700 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-green-800">Packlistan är redo för scanning</p>
                  <p className="text-green-700 mt-0.5">
                    {result.summary.pass}/{result.summary.total} rader matchar WMS
                    {warnings > 0 ? ` · ${warnings} varningar` : ''}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
                <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-destructive">
                    Denna packlista har produkter som inte säkert matchar WMS. Scanning kan misslyckas.
                  </p>
                  <p className="text-destructive/80 mt-0.5">
                    {blocked} blockerade · {warnings} varningar · {result.summary.pass}/{result.summary.total} OK
                  </p>
                </div>
              </div>
            )}

            {problems.length > 0 && (
              <div className="border rounded-md divide-y">
                {problems.map((row) => (
                  <Collapsible key={row.packingItemId}>
                    <CollapsibleTrigger className="w-full text-left p-2 hover:bg-muted/40">
                      <div className="flex items-start gap-2">
                        <AlertTriangle
                          className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${row.status === 'BLOCKED' ? 'text-destructive' : 'text-amber-600'}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium truncate">
                              {row.name || '(namnlös)'}
                            </span>
                            {statusBadge(row.status)}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            SKU: {row.sku || '—'} · IIT: {row.inventoryItemTypeId || '—'}
                          </p>
                          <p className="text-[11px] mt-0.5">{row.reason}</p>
                          {row.suggestedFix && (
                            <p className="text-[11px] text-primary mt-0.5">→ {row.suggestedFix}</p>
                          )}
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-2 pb-2 pl-7 text-[10px] font-mono text-muted-foreground space-y-0.5">
                        <div>bookingProductId: {row.bookingProductId || '—'}</div>
                        <div>packingItemId: {row.packingItemId}</div>
                        <div>inventoryItemTypeId: {row.inventoryItemTypeId || '—'}</div>
                        <div>
                          wmsMatches ({row.wmsMatches.length}):{' '}
                          {row.wmsMatches.length === 0
                            ? '—'
                            : row.wmsMatches
                                .map((m) => `${m.matchedBy}:${m.id || m.sku || m.name}`)
                                .join(', ')}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            )}

            <Collapsible open={showDebug} onOpenChange={setShowDebug}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-[11px] w-full justify-start">
                  <ChevronDown className={`h-3 w-3 mr-1 transition-transform ${showDebug ? 'rotate-180' : ''}`} />
                  Debug ({result.summary.total} rader)
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="text-[10px] font-mono bg-muted/40 rounded p-2 overflow-x-auto max-h-64">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default PackingPreflightPanel;
