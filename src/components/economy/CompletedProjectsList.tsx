import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Search, Calendar, ArrowRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { format, differenceInDays } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { EconomyProjectInsight } from '@/types/economyOverview';

const PAGE_SIZE = 10;

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

type StatusFilter = 'all' | 'event-completed' | 'ready-for-invoicing' | 'partially-invoiced' | 'fully-invoiced' | 'economy-closed';

const statusLabels: Record<Exclude<StatusFilter, 'all'>, string> = {
  'event-completed': 'Event slutfört',
  'ready-for-invoicing': 'Redo att fakturera',
  'partially-invoiced': 'Delvis fakturerat',
  'fully-invoiced': 'Fullt fakturerat',
  'economy-closed': 'Stängt',
};

const statusBadgeVariant = (status: EconomyProjectInsight['economyStatus']) => {
  switch (status) {
    case 'economy-closed': return 'border-green-300 text-green-700 bg-green-50 dark:bg-green-950/30';
    case 'fully-invoiced': return 'border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-950/30';
    case 'partially-invoiced': return 'border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/30';
    case 'ready-for-invoicing': return 'border-purple-300 text-purple-700 bg-purple-50 dark:bg-purple-950/30';
    case 'event-completed': return 'border-orange-300 text-orange-700 bg-orange-50 dark:bg-orange-950/30';
    default: return 'border-border text-muted-foreground';
  }
};

interface Props {
  projectInsights: EconomyProjectInsight[];
}

const COMPLETED_STATUSES: EconomyProjectInsight['economyStatus'][] = [
  'event-completed',
  'ready-for-invoicing',
  'partially-invoiced',
  'fully-invoiced',
  'economy-closed',
];

const CompletedProjectsList: React.FC<Props> = ({ projectInsights }) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const completed = useMemo(() => {
    const today = new Date();
    return projectInsights
      .filter(p => COMPLETED_STATUSES.includes(p.economyStatus))
      .map(p => {
        const eventDate = p.eventdate ? new Date(p.eventdate) : null;
        const daysSince = eventDate ? differenceInDays(today, eventDate) : -1;
        return { ...p, _daysSince: daysSince, _eventDate: eventDate };
      })
      // Oldest first (largest daysSince first)
      .sort((a, b) => b._daysSince - a._daysSince);
  }, [projectInsights]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return completed.filter(p => {
      if (statusFilter !== 'all' && p.economyStatus !== statusFilter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [completed, search, statusFilter]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visible.length < filtered.length;

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <CheckCircle2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Slutförda projekt</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Äldsta överst — kräver utvärdering · {filtered.length} totalt
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Sök på projektnamn..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
              className="pl-9 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as StatusFilter); setVisibleCount(PAGE_SIZE); }}>
            <SelectTrigger className="w-full sm:w-[200px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla statusar</SelectItem>
              {Object.entries(statusLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            Inga slutförda projekt matchar dina filter.
          </div>
        ) : (
          <>
            <div className="divide-y divide-border/60">
              {visible.map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate(p.navigateTo)}
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-accent/40 transition-colors text-left group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{p.name}</span>
                      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4', statusBadgeVariant(p.economyStatus))}>
                        {statusLabels[p.economyStatus as Exclude<StatusFilter, 'all'>] ?? p.economyStatus}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      {p._eventDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(p._eventDate, 'd MMM yyyy', { locale: sv })}
                        </span>
                      )}
                      {p._daysSince > 0 && (
                        <span className={cn(
                          'flex items-center gap-1',
                          p._daysSince > 90 ? 'text-destructive font-medium' :
                          p._daysSince > 30 ? 'text-amber-600' : ''
                        )}>
                          <Clock className="h-3 w-3" />
                          {p._daysSince} {p._daysSince === 1 ? 'dag' : 'dagar'} sedan
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-foreground">
                      {formatCurrency(p.quotedAmount)}
                    </div>
                    {p.remainingToInvoice > 0 && (
                      <div className="text-[10px] text-muted-foreground">
                        Kvar: {formatCurrency(p.remainingToInvoice)}
                      </div>
                    )}
                  </div>

                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              ))}
            </div>

            {hasMore && (
              <div className="p-4 border-t border-border/40 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                >
                  Visa fler ({filtered.length - visible.length} kvar)
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default CompletedProjectsList;
