import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import EconomyStatusBadge from './EconomyStatusBadge';
import type { EconomyProjectInsight as EnrichedProject } from '@/types/economyOverview';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

const formatDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try { return format(new Date(d), 'd MMM yyyy', { locale: sv }); } catch { return '—'; }
};

const TYPE_BADGE_CLASSES: Record<string, string> = {
  small: 'bg-[hsl(var(--project-small))] text-[hsl(var(--project-small-foreground))] ring-1 ring-[hsl(var(--project-small-border))]',
  medium: 'bg-[hsl(var(--project-medium))] text-[hsl(var(--project-medium-foreground))] ring-1 ring-[hsl(var(--project-medium-border))]',
  large: 'bg-[hsl(var(--project-large))] text-[hsl(var(--project-large-foreground))] ring-1 ring-[hsl(var(--project-large-border))]',
};
const TYPE_LABELS: Record<string, string> = { small: 'Litet', medium: 'Medel', large: 'Stort' };

type CompletedFilter = 'all' | 'not-invoiced' | 'fully-invoiced' | 'closed' | 'risk';

interface Props {
  projects: EnrichedProject[];
}

const EconomyCompletedProjects: React.FC<Props> = ({ projects }) => {
  const [filter, setFilter] = useState<CompletedFilter>('all');
  const navigate = useNavigate();

  const filtered = React.useMemo(() => {
    switch (filter) {
      case 'not-invoiced': return projects.filter(p => p.remainingToInvoice > 0);
      case 'fully-invoiced': return projects.filter(p => p.economyStatus === 'fully-invoiced' || (p.quotedAmount > 0 && p.invoicedAmount >= p.quotedAmount * 0.95));
      case 'closed': return projects.filter(p => p.economyStatus === 'economy-closed');
      case 'risk': return projects.filter(p => p.isRiskProject);
      default: return projects;
    }
  }, [projects, filter]);

  return (
    <Card className="border-border/40">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-base font-semibold">Avslutade projekt</h2>
            <Badge variant="secondary" className="text-[10px]">{filtered.length}</Badge>
          </div>
          <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v as CompletedFilter)} className="gap-1">
            <ToggleGroupItem value="all" className="text-[10px] h-7 px-2.5">Alla</ToggleGroupItem>
            <ToggleGroupItem value="not-invoiced" className="text-[10px] h-7 px-2.5">Ej fakturerade</ToggleGroupItem>
            <ToggleGroupItem value="fully-invoiced" className="text-[10px] h-7 px-2.5">Fullt fakturerade</ToggleGroupItem>
            <ToggleGroupItem value="closed" className="text-[10px] h-7 px-2.5">Ekonomi stängd</ToggleGroupItem>
            <ToggleGroupItem value="risk" className="text-[10px] h-7 px-2.5">Risk</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Inga projekt matchar filtret</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Projekt</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Datum</th>
                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Intäkt</th>
                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Kostnad</th>
                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Marginal</th>
                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Marg.%</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Fakturering</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 20).map(p => {
                  const link = p.projectSize === 'medium' ? `/economy/${p.id}` : p.navigateTo;
                  const marginColor = p.forecastMarginPercent >= 20 ? 'text-green-600' :
                                      p.forecastMarginPercent >= 0 ? 'text-foreground' : 'text-destructive';
                  return (
                    <tr key={p.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors group">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn("text-[9px] px-1 py-0 font-medium shrink-0", TYPE_BADGE_CLASSES[p.projectSize])}>
                            {TYPE_LABELS[p.projectSize]}
                          </Badge>
                          <button onClick={() => navigate(link)} className="text-sm font-medium text-primary hover:underline truncate text-left">
                            {p.name}
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-muted-foreground">{formatDate(p.eventdate)}</td>
                      <td className="py-2.5 px-3 text-xs text-right font-medium">{formatCurrency(p.expectedRevenue)}</td>
                      <td className="py-2.5 px-3 text-xs text-right text-muted-foreground">{formatCurrency(p.totalCost)}</td>
                      <td className={cn("py-2.5 px-3 text-xs text-right font-semibold", marginColor)}>
                        {formatCurrency(p.projectedMargin)}
                      </td>
                      <td className={cn("py-2.5 px-3 text-xs text-right font-bold", marginColor)}>
                        {p.projectedMarginPercent.toFixed(0)}%
                      </td>
                      <td className="py-2.5 px-3">
                        {p.totalInvoiced > 0 ? (
                          <span className="text-xs text-green-600 font-medium">{formatCurrency(p.totalInvoiced)}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <EconomyStatusBadge status={p.economyStatus} />
                      </td>
                      <td className="py-2.5 px-3">
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => navigate(link)}>
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EconomyCompletedProjects;
