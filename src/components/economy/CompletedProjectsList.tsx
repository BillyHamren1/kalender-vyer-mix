import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Search, CheckSquare, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { format, differenceInDays } from 'date-fns';
import { sv } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { EconomyProjectInsight } from '@/types/economyOverview';
import {
  getProjectLifecycleStatus,
  LIFECYCLE_STATUS_LABEL,
  type ProjectLifecycleStatus,
} from '@/lib/economy/projectLifecycleStatus';

const PAGE_SIZE = 10;

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

type StatusFilter = 'all' | ProjectLifecycleStatus;

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  active: 'Aktiva',
  closed: 'Stängda',
  cancelled: 'Avbokade',
  all: 'Alla',
};

const STATUS_DOT_CLASS: Record<ProjectLifecycleStatus, string> = {
  active: 'bg-primary',
  closed: 'bg-muted-foreground/50',
  cancelled: 'bg-destructive',
};

const STATUS_PILL_CLASS: Record<ProjectLifecycleStatus, string> = {
  active: 'border-primary/30 text-primary bg-primary/5',
  closed: 'border-border bg-muted/50 text-muted-foreground',
  cancelled: 'border-destructive/40 text-destructive bg-destructive/5',
};

interface Props {
  projectInsights: EconomyProjectInsight[];
}

const HIDDEN_KEY = 'completed_projects_hidden_v1';

const loadHidden = (): Set<string> => {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
};

const saveHidden = (ids: Set<string>) => {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(ids)));
  } catch { /* ignore */ }
};

const CompletedProjectsList: React.FC<Props> = ({ projectInsights }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => loadHidden());

  const completed = useMemo(() => {
    const today = new Date();
    return projectInsights
      .filter(p => !hidden.has(p.id))
      .map(p => {
        const eventDate = p.eventdate ? new Date(p.eventdate) : null;
        const daysSince = eventDate ? differenceInDays(today, eventDate) : -1;
        return { ...p, _daysSince: daysSince, _eventDate: eventDate };
      })
      .sort((a, b) => b._daysSince - a._daysSince);
  }, [projectInsights, hidden]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return completed.filter(p => {
      const lifecycle = getProjectLifecycleStatus({ status: p.status, economyClosed: (p as any).economyClosed });
      if (statusFilter !== 'all' && lifecycle !== statusFilter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [completed, search, statusFilter]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visible.length < filtered.length;

  const toggleSelectMode = () => {
    setSelectMode(prev => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  };

  const toggleRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds(prev => {
      const allVisibleSelected = visible.every(p => prev.has(p.id));
      const next = new Set(prev);
      if (allVisibleSelected) {
        visible.forEach(p => next.delete(p.id));
      } else {
        visible.forEach(p => next.add(p.id));
      }
      return next;
    });
  };

  const handleBulkClose = async () => {
    if (selectedIds.size === 0) return;
    setIsClosing(true);
    const items = filtered.filter(p => selectedIds.has(p.id));
    let success = 0;
    let failed = 0;

    for (const p of items) {
      try {
        // Only push status update for projects that aren't already completed in DB.
        if (p.status !== 'completed') {
          const table = p.projectSize === 'large' ? 'large_projects' : 'projects';
          const { error } = await supabase
            .from(table)
            .update({ status: 'completed' })
            .eq('id', p.id);
          if (error) throw error;
        }
        success++;
      } catch (err) {
        console.error('[CompletedProjectsList] close failed for', p.id, err);
        failed++;
      }
    }

    // Hide successfully closed projects from this list (persistent via localStorage).
    const newHidden = new Set(hidden);
    items.forEach(p => newHidden.add(p.id));
    setHidden(newHidden);
    saveHidden(newHidden);

    setIsClosing(false);
    setConfirmOpen(false);
    setSelectedIds(new Set());
    setSelectMode(false);

    if (success > 0) {
      toast.success(`${success} projekt stängdes och dolda från listan`);
      queryClient.invalidateQueries({ queryKey: ['economy-overview'] });
    }
    if (failed > 0) {
      toast.error(`${failed} projekt kunde inte stängas`);
    }
  };

  const allVisibleSelected = visible.length > 0 && visible.every(p => selectedIds.has(p.id));
  const someVisibleSelected = visible.some(p => selectedIds.has(p.id)) && !allVisibleSelected;

  return (
    <>
      <Card className="border-border/60">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base font-semibold">Alla projekt</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Äldsta överst · {filtered.length} totalt
                {selectMode && selectedIds.size > 0 && ` · ${selectedIds.size} markerade`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectMode && selectedIds.size > 0 && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setConfirmOpen(true)}
                  disabled={isClosing}
                >
                  Stäng {selectedIds.size} projekt
                </Button>
              )}
              <Button
                size="sm"
                variant={selectMode ? 'secondary' : 'outline'}
                onClick={toggleSelectMode}
              >
                {selectMode ? (
                  <><X className="h-4 w-4 mr-1.5" /> Avbryt</>
                ) : (
                  <><CheckSquare className="h-4 w-4 mr-1.5" /> Markera</>
                )}
              </Button>
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
                <SelectItem value="active">{STATUS_FILTER_LABELS.active}</SelectItem>
                <SelectItem value="closed">{STATUS_FILTER_LABELS.closed}</SelectItem>
                <SelectItem value="cancelled">{STATUS_FILTER_LABELS.cancelled}</SelectItem>
                <SelectItem value="all">{STATUS_FILTER_LABELS.all}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              Inga projekt matchar dina filter.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border/60">
                    {selectMode && (
                      <TableHead className="h-11 w-[44px] pl-6">
                        <Checkbox
                          checked={allVisibleSelected || (someVisibleSelected ? 'indeterminate' : false)}
                          onCheckedChange={toggleAllVisible}
                          aria-label="Markera alla synliga"
                        />
                      </TableHead>
                    )}
                    <TableHead className={cn('h-11 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground', !selectMode && 'pl-6')}>Projekt</TableHead>
                    <TableHead className="h-11 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-[180px]">Eventdatum</TableHead>
                    <TableHead className="h-11 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-[160px]">Status</TableHead>
                    <TableHead className="h-11 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-[160px] text-right pr-6">Summa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((p) => {
                    const checked = selectedIds.has(p.id);
                    const dateLabel = p._eventDate ? format(p._eventDate, 'd MMM yyyy', { locale: sv }) : '—';
                    const lifecycle = getProjectLifecycleStatus({ status: p.status, economyClosed: (p as any).economyClosed });
                    const statusLabel = LIFECYCLE_STATUS_LABEL[lifecycle];
                    return (
                      <TableRow
                        key={p.id}
                        onClick={() => {
                          if (selectMode) toggleRow(p.id);
                          else navigate(p.navigateTo);
                        }}
                        className={cn(
                          'group cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/30',
                          selectMode && checked && 'bg-muted/40'
                        )}
                      >
                        {selectMode && (
                          <TableCell className="py-5 w-[44px] pl-6 align-middle" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleRow(p.id)}
                              aria-label={`Markera ${p.name}`}
                            />
                          </TableCell>
                        )}
                        <TableCell className={cn('py-5 align-middle', !selectMode && 'pl-6')}>
                          <div className="font-semibold text-sm leading-tight text-foreground">
                            {p.name}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                            {dateLabel}
                          </div>
                        </TableCell>
                        <TableCell className="py-5 align-middle text-sm text-muted-foreground tabular-nums">
                          {dateLabel}
                        </TableCell>
                        <TableCell className="py-5 align-middle">
                          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', STATUS_PILL_CLASS[lifecycle])}>
                            <span className={cn('inline-block h-1.5 w-1.5 rounded-full', STATUS_DOT_CLASS[lifecycle])} />
                            {statusLabel}
                          </span>
                        </TableCell>
                        <TableCell className="py-5 align-middle text-right tabular-nums font-semibold text-sm pr-6">
                          {formatCurrency(p.quotedAmount)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stänga {selectedIds.size} projekt?</AlertDialogTitle>
            <AlertDialogDescription>
              Projekten markeras som avslutade och försvinner från denna lista.
              De finns kvar i systemet och går att hitta via projektarkivet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClosing}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkClose} disabled={isClosing}>
              {isClosing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Stänger…</>
              ) : (
                'Stäng projekt'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CompletedProjectsList;
