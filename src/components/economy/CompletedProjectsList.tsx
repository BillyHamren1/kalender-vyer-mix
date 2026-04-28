import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search } from 'lucide-react';
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
    <Card className="border-border/60">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base font-semibold">Slutförda projekt</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Äldsta överst · {filtered.length} totalt
            </p>
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
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/60">
                  <TableHead className="h-10 text-xs font-medium uppercase tracking-wide">Projekt</TableHead>
                  <TableHead className="h-10 text-xs font-medium uppercase tracking-wide w-[140px]">Eventdatum</TableHead>
                  <TableHead className="h-10 text-xs font-medium uppercase tracking-wide w-[100px]">Ålder</TableHead>
                  <TableHead className="h-10 text-xs font-medium uppercase tracking-wide w-[160px]">Status</TableHead>
                  <TableHead className="h-10 text-xs font-medium uppercase tracking-wide w-[140px] text-right">Värde</TableHead>
                  <TableHead className="h-10 text-xs font-medium uppercase tracking-wide w-[140px] text-right">Kvar att fakturera</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((p) => (
                  <TableRow
                    key={p.id}
                    onClick={() => navigate(p.navigateTo)}
                    className="cursor-pointer border-border/60"
                  >
                    <TableCell className="py-3 font-medium text-sm">{p.name}</TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground tabular-nums">
                      {p._eventDate ? format(p._eventDate, 'd MMM yyyy', { locale: sv }) : '—'}
                    </TableCell>
                    <TableCell className={cn(
                      'py-3 text-sm tabular-nums',
                      p._daysSince > 90 ? 'text-destructive font-medium' :
                      p._daysSince > 30 ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                      {p._daysSince > 0 ? `${p._daysSince} d` : '—'}
                    </TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground">
                      {statusLabels[p.economyStatus as Exclude<StatusFilter, 'all'>] ?? p.economyStatus}
                    </TableCell>
                    <TableCell className="py-3 text-sm text-right tabular-nums font-medium">
                      {formatCurrency(p.quotedAmount)}
                    </TableCell>
                    <TableCell className="py-3 text-sm text-right tabular-nums text-muted-foreground">
                      {p.remainingToInvoice > 0 ? formatCurrency(p.remainingToInvoice) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {hasMore && (
              <div className="p-4 border-t border-border/60 flex justify-center">
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
