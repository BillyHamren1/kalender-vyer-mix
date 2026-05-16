import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Activity, Clock, Car, AlertTriangle, ChevronRight, ChevronDown, ExternalLink,
} from 'lucide-react';
import { useProjectTimeSummary } from '@/hooks/useProjectTimeSummary';
import { supabase } from '@/integrations/supabase/client';
import type { ProjectTarget, PtmSourceRow } from '@/lib/projects/projectTimeModel';
import type { PlannedStaffMember } from '@/types/projectStaff';
import { format } from 'date-fns';

interface Props {
  target: ProjectTarget;
  includeBookingIds?: string[];
  plannedStaff?: PlannedStaffMember[];
}

const fmt = (m: number) => {
  if (!m) return '0h';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}min`;
  if (h) return `${h}h`;
  return `${r}min`;
};

interface RowState {
  staffId: string;
  name: string;
  role: string | null;
  plannedDates: string[];
  confirmed: number;
  active: number;
  suggested: number;
  travelApproved: number;
  travelSuggested: number;
  source: PtmSourceRow[];
}

type StatusKind = 'ok' | 'active' | 'no_workday' | 'auto_started' | 'needs_review';
const statusLabel: Record<StatusKind, string> = {
  ok: 'OK',
  active: 'Pågår',
  no_workday: 'Saknar arbetsdag',
  auto_started: 'Auto-startad från GPS',
  needs_review: 'Kräver granskning',
};
const statusVariant: Record<StatusKind, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  ok: 'secondary',
  active: 'default',
  no_workday: 'outline',
  auto_started: 'outline',
  needs_review: 'destructive',
};

/**
 * Tidsrapportering-sektion för projekt/booking-vyn.
 * Sammanfattning + per-person rader. Klick öppnar källrader; "Öppna dagsjournal"
 * länkar till /staff-management/time-reports för djupare drilldown.
 */
export const ProjectAutoTimeSection = ({ target, includeBookingIds = [], plannedStaff = [] }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: summary, isLoading } = useProjectTimeSummary({ target, includeBookingIds });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: staffMap = {} } = useQuery({
    queryKey: ['staff-names-map'],
    queryFn: async () => {
      const { data } = await supabase.from('staff_members').select('id, name');
      const m: Record<string, string> = {};
      (data || []).forEach((s: any) => { m[s.id] = s.name; });
      return m;
    },
    staleTime: 5 * 60_000,
  });

  const rows = useMemo<RowState[]>(() => {
    if (!summary) return [];
    const byStaff = new Map<string, RowState>();
    const ensure = (id: string): RowState => {
      let r = byStaff.get(id);
      if (!r) {
        const planned = plannedStaff.find(p => p.staff_id === id);
        r = {
          staffId: id,
          name: planned?.staff_name || staffMap[id] || id.slice(0, 8),
          role: planned?.role ?? null,
          plannedDates: planned?.assignment_dates.map(d => d.date) ?? [],
          confirmed: 0, active: 0, suggested: 0,
          travelApproved: 0, travelSuggested: 0,
          source: [],
        };
        byStaff.set(id, r);
      }
      return r;
    };

    for (const s of summary.staffBreakdown) {
      const r = ensure(s.staffId);
      r.confirmed = s.confirmedMinutes;
      r.active = s.activeMinutes;
      r.suggested = s.suggestedMinutes;
      r.travelApproved = s.travelMinutesApproved;
      r.travelSuggested = s.travelMinutesSuggested;
    }
    // Inkludera planerade utan tid alls.
    for (const p of plannedStaff) {
      ensure(p.staff_id);
    }
    // Bind källrader per person.
    for (const sr of summary.sourceRows) {
      const r = byStaff.get(sr.staffId);
      if (r) r.source.push(sr);
    }
    return Array.from(byStaff.values()).sort((a, b) =>
      (b.confirmed + b.active) - (a.confirmed + a.active) || a.name.localeCompare(b.name, 'sv'),
    );
  }, [summary, plannedStaff, staffMap]);

  const anomaliesByStaff = useMemo(() => {
    const m = new Map<string, number>();
    summary?.anomalies.forEach(a => m.set(a.staffId, (m.get(a.staffId) ?? 0) + 1));
    return m;
  }, [summary]);

  const computeStatus = (r: RowState): StatusKind => {
    if (anomaliesByStaff.get(r.staffId)) return 'needs_review';
    if (r.active > 0) return 'active';
    if (r.suggested > 0) return 'auto_started';
    if (r.plannedDates.length > 0 && r.confirmed === 0 && r.active === 0) return 'no_workday';
    if (r.confirmed > 0) return 'ok';
    return 'no_workday';
  };

  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const openDay = (staffId: string, isoDate?: string) => {
    const path = isoDate
      ? `/staff-management/time-reports/${staffId}/${isoDate}`
      : `/staff-management/time-reports/${staffId}`;
    navigate(path, {
      state: { from: location.pathname + location.search },
    });
  };

  if (isLoading || !summary) {
    return (
      <Card><CardContent className="p-6">
        <div className="h-32 bg-muted/40 animate-pulse rounded-lg" />
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Tidsrapportering
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="Bekräftad tid"
            sublabel="Stängda timrar & godkänd restid"
            minutes={summary.confirmedMinutes + summary.travelMinutesApproved}
            tone="confirmed"
          />
          <Stat
            label="Pågående nu"
            sublabel="Aktiv timer på projektet"
            minutes={summary.activeMinutes}
            tone="active"
          />
          <Stat
            label="Föreslagen tid"
            sublabel="GPS/auto-detect, ej godkänd"
            minutes={summary.suggestedMinutes + summary.travelMinutesSuggested}
            tone="suggested"
          />
          <Stat
            label="Kräver granskning"
            sublabel="Avvikelser & oklara rader"
            minutes={null}
            count={summary.anomalies.length + rows.filter(r => computeStatus(r) === 'needs_review').length}
            tone="review"
          />
        </div>
        <p className="text-[11px] text-muted-foreground -mt-2">
          OBS: Bekräftad, Pågående och Föreslagen är separata kategorier — summeras
          aldrig till en gemensam total. Endast bekräftad tid är slutlig.
        </p>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Ingen personal eller tid ännu.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]" />
                  <TableHead>Person</TableHead>
                  <TableHead>Roll</TableHead>
                  <TableHead className="text-right">Planerat</TableHead>
                  <TableHead className="text-right">Bekräftat</TableHead>
                  <TableHead className="text-right">Pågående</TableHead>
                  <TableHead className="text-right">Restid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => {
                  const status = computeStatus(r);
                  const isOpen = expanded.has(r.staffId);
                  const travel = r.travelApproved + r.travelSuggested;
                  return (
                    <>
                      <TableRow
                        key={r.staffId}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => toggle(r.staffId)}
                      >
                        <TableCell>
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{r.role ?? '—'}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {r.plannedDates.length > 0 ? `${r.plannedDates.length} dag(ar)` : '—'}
                        </TableCell>
                        <TableCell className="text-right">{r.confirmed > 0 ? fmt(r.confirmed) : '—'}</TableCell>
                        <TableCell className="text-right">
                          {r.active > 0
                            ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3 text-emerald-600" />{fmt(r.active)}</span>
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {travel > 0
                            ? <span className="inline-flex items-center gap-1"><Car className="h-3 w-3" />{fmt(travel)}</span>
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant[status]}>{statusLabel[status]}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); openDay(r.staffId); }}
                            title="Öppna dagsjournal"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={`${r.staffId}-exp`} className="bg-muted/20">
                          <TableCell />
                          <TableCell colSpan={8}>
                            <ExpandedRow row={r} onOpenDay={(iso) => openDay(r.staffId, iso)} />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {summary.anomalies.length > 0 && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-3 space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" />
              {summary.anomalies.length} avvikelse(r) att granska
            </div>
            <ul className="text-xs text-amber-900/80 dark:text-amber-200/80 space-y-0.5">
              {summary.anomalies.slice(0, 5).map((a, i) => (
                <li key={i}>• {a.message}</li>
              ))}
              {summary.anomalies.length > 5 && <li>…och {summary.anomalies.length - 5} till</li>}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Stat = ({
  label, sublabel, minutes, count, tone,
}: {
  label: string;
  sublabel?: string;
  minutes?: number | null;
  count?: number;
  tone: 'confirmed' | 'active' | 'suggested' | 'travel' | 'review';
}) => {
  const color =
    tone === 'confirmed' ? 'text-foreground'
    : tone === 'active' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'travel' ? 'text-blue-600 dark:text-blue-400'
    : tone === 'review' ? 'text-rose-600 dark:text-rose-400'
    : 'text-amber-600 dark:text-amber-400';
  const display = minutes != null
    ? (minutes > 0 ? fmt(minutes) : '—')
    : (count && count > 0 ? `${count}` : '—');
  return (
    <div className="rounded-lg bg-muted/40 p-3 text-center">
      <p className={`text-xl font-bold ${color}`}>{display}</p>
      <p className="text-xs font-medium text-foreground">{label}</p>
      {sublabel && <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>}
    </div>
  );
};

const kindLabel: Record<string, string> = {
  time_report: 'Tidrapport',
  lte_active: 'Pågående timer',
  lte_closed: 'Stängd timer',
  travel_approved: 'Restid (godkänd)',
  travel_suggested: 'Restid (förslag)',
};

const ExpandedRow = ({ row, onOpenDay }: { row: RowState; onOpenDay: (iso?: string) => void }) => {
  const counted = row.source.filter(s => s.minutes > 0);
  return (
    <div className="space-y-2 py-2">
      <div className="flex flex-wrap gap-2 text-xs">
        {row.plannedDates.length > 0 && (
          <span className="text-muted-foreground">
            Planerade dagar: {row.plannedDates.join(', ')}
          </span>
        )}
      </div>
      {counted.length === 0 ? (
        <p className="text-xs text-muted-foreground">Inga räknade källrader.</p>
      ) : (
        <div className="rounded border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Källa</TableHead>
                <TableHead className="text-xs">Period</TableHead>
                <TableHead className="text-xs text-right">Minuter</TableHead>
                <TableHead className="text-xs">Beslut</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {counted.map(s => {
                const dayIso = s.startIso?.slice(0, 10);
                const period = s.startIso && s.endIso
                  ? `${format(new Date(s.startIso), 'yyyy-MM-dd HH:mm')} – ${format(new Date(s.endIso), 'HH:mm')}`
                  : s.startIso
                  ? `${format(new Date(s.startIso), 'yyyy-MM-dd HH:mm')} – pågår`
                  : '—';
                return (
                  <TableRow key={s.rowId}>
                    <TableCell className="text-xs">{kindLabel[s.kind] ?? s.kind}</TableCell>
                    <TableCell className="text-xs">{period}</TableCell>
                    <TableCell className="text-xs text-right">{fmt(s.minutes)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.reason ?? s.decision}</TableCell>
                    <TableCell>
                      {dayIso && (
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6"
                          onClick={() => onOpenDay(dayIso)}
                          title="Öppna dagsjournal"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
