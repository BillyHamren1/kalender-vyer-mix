import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { addMonths, eachDayOfInterval, endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns';
import { sv } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ArrowLeft, MapPin, Clock } from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { fetchStaffMembers } from '@/services/staffService';
import { formatHoursMinutes } from '@/utils/formatHours';

interface TimeReportLite {
  staff_id: string;
  report_date: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  break_time: number | null;
}
interface TravelLite {
  staff_id: string;
  report_date: string;
  hours_worked: number;
}
interface WorkdayLite {
  staff_id: string;
  started_at: string;
  ended_at: string | null;
}

interface DayRow {
  date: string; // yyyy-MM-dd
  start: string | null; // HH:mm
  end: string | null;   // HH:mm
  breakMinutes: number;
  totalHours: number;
  hasAny: boolean;
}

function fmtTime(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch { return null; }
}

const StaffTimeReportMonth: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ staffId?: string }>();
  const [staffId, setStaffId] = useState<string | undefined>(params.staffId);
  const [monthAnchor, setMonthAnchor] = useState<Date>(startOfMonth(new Date()));

  const { data: staff = [] } = useQuery({
    queryKey: ['staff-members-active'],
    queryFn: () => fetchStaffMembers(),
    staleTime: 60_000,
  });

  const monthStart = monthAnchor;
  const monthEnd = endOfMonth(monthAnchor);
  const fromDate = format(monthStart, 'yyyy-MM-dd');
  const toDate = format(monthEnd, 'yyyy-MM-dd');

  const { data, isLoading } = useQuery({
    queryKey: ['staff-time-month', staffId, fromDate, toDate],
    enabled: !!staffId,
    staleTime: 30_000,
    queryFn: async () => {
      const [tr, tl, wd] = await Promise.all([
        supabase.from('time_reports')
          .select('staff_id, report_date, start_time, end_time, hours_worked, break_time')
          .eq('staff_id', staffId!)
          .eq('is_subdivision', false)
          .gte('report_date', fromDate)
          .lte('report_date', toDate),
        supabase.from('travel_time_logs')
          .select('staff_id, report_date, hours_worked')
          .eq('staff_id', staffId!)
          .gte('report_date', fromDate)
          .lte('report_date', toDate),
        supabase.from('workdays')
          .select('staff_id, started_at, ended_at')
          .eq('staff_id', staffId!)
          .gte('started_at', `${fromDate}T00:00:00Z`)
          .lte('started_at', `${toDate}T23:59:59Z`),
      ]);
      return {
        reports: (tr.data ?? []) as TimeReportLite[],
        travel: (tl.data ?? []) as TravelLite[],
        workdays: (wd.data ?? []) as WorkdayLite[],
      };
    },
  });

  const rows = useMemo<DayRow[]>(() => {
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const byDay = new Map<string, DayRow>();
    for (const d of days) {
      const key = format(d, 'yyyy-MM-dd');
      byDay.set(key, { date: key, start: null, end: null, breakMinutes: 0, totalHours: 0, hasAny: false });
    }

    const setEarliest = (row: DayRow, t: string | null) => {
      if (!t) return;
      const v = t.length >= 5 ? t.substring(0, 5) : t;
      if (!row.start || v < row.start) row.start = v;
    };
    const setLatest = (row: DayRow, t: string | null) => {
      if (!t) return;
      const v = t.length >= 5 ? t.substring(0, 5) : t;
      if (!row.end || v > row.end) row.end = v;
    };

    for (const r of data?.reports ?? []) {
      const row = byDay.get(r.report_date);
      if (!row) continue;
      row.hasAny = true;
      row.totalHours += Number(r.hours_worked) || 0;
      row.breakMinutes += Number(r.break_time) || 0;
      setEarliest(row, r.start_time);
      setLatest(row, r.end_time);
    }
    for (const t of data?.travel ?? []) {
      const row = byDay.get(t.report_date);
      if (!row) continue;
      row.hasAny = true;
      row.totalHours += Number(t.hours_worked) || 0;
    }
    for (const w of data?.workdays ?? []) {
      const dateKey = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(w.started_at));
      const row = byDay.get(dateKey);
      if (!row) continue;
      row.hasAny = true;
      const s = fmtTime(w.started_at);
      const e = fmtTime(w.ended_at);
      setEarliest(row, s);
      setLatest(row, e);
    }

    return Array.from(byDay.values());
  }, [data, monthStart, monthEnd]);

  const monthTotal = rows.reduce((s, r) => s + r.totalHours, 0);
  const monthBreak = rows.reduce((s, r) => s + r.breakMinutes, 0);
  const reportedDays = rows.filter(r => r.hasAny).length;

  return (
    <PageContainer>
      <div className="flex items-center gap-2 mb-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/staff-management/time-reports')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Tillbaka
        </Button>
      </div>
      <PageHeader
        icon={Clock}
        title="Tidrapport per person — månadsvy"
        subtitle="Rapporterad tid per dag. Klicka på en dag för att se var personen befann sig."
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="min-w-[240px]">
          <Select value={staffId ?? ''} onValueChange={(v) => { setStaffId(v); navigate(`/staff-management/time-reports/month/${v}`, { replace: true }); }}>
            <SelectTrigger>
              <SelectValue placeholder="Välj person" />
            </SelectTrigger>
            <SelectContent>
              {staff.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <Button variant="outline" size="icon" onClick={() => setMonthAnchor(m => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[160px] text-center font-medium capitalize">
            {format(monthAnchor, 'MMMM yyyy', { locale: sv })}
          </div>
          <Button variant="outline" size="icon" onClick={() => setMonthAnchor(m => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMonthAnchor(startOfMonth(new Date()))}>
            Idag
          </Button>
        </div>
      </div>

      {!staffId && (
        <div className="text-center text-muted-foreground py-12 border border-dashed rounded-lg">
          Välj en person för att se månadens rapporterade tid.
        </div>
      )}

      {staffId && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 grid grid-cols-12 text-xs font-medium text-muted-foreground">
            <div className="col-span-3">Datum</div>
            <div className="col-span-2">Start</div>
            <div className="col-span-2">Slut</div>
            <div className="col-span-2">Rast</div>
            <div className="col-span-2 text-right">Totalt</div>
            <div className="col-span-1 text-right">Karta</div>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Laddar…</div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((r) => {
                const d = parseISO(r.date);
                const isWeekend = [0, 6].includes(d.getDay());
                return (
                  <button
                    key={r.date}
                    onClick={() => navigate(`/staff-management/time-reports/${staffId}/${r.date}`)}
                    className={`w-full text-left grid grid-cols-12 items-center px-4 py-2.5 hover:bg-muted/40 transition-colors ${isWeekend ? 'bg-muted/20' : ''}`}
                  >
                    <div className="col-span-3">
                      <div className="text-sm font-medium">
                        {format(d, 'EEE d MMM', { locale: sv })}
                      </div>
                    </div>
                    <div className="col-span-2 text-sm tabular-nums">{r.start ?? '–'}</div>
                    <div className="col-span-2 text-sm tabular-nums">{r.end ?? '–'}</div>
                    <div className="col-span-2 text-sm tabular-nums text-muted-foreground">
                      {r.breakMinutes > 0 ? `${r.breakMinutes} min` : '–'}
                    </div>
                    <div className="col-span-2 text-right text-sm font-medium tabular-nums">
                      {r.totalHours > 0 ? formatHoursMinutes(r.totalHours) : <span className="text-muted-foreground font-normal">–</span>}
                    </div>
                    <div className="col-span-1 text-right">
                      {r.hasAny && <MapPin className="h-4 w-4 inline text-primary/60" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="bg-muted/40 px-4 py-3 grid grid-cols-12 text-sm font-medium border-t">
            <div className="col-span-3">Månadssumma</div>
            <div className="col-span-2 text-muted-foreground">{reportedDays} dagar</div>
            <div className="col-span-2" />
            <div className="col-span-2 text-muted-foreground tabular-nums">{monthBreak > 0 ? `${monthBreak} min` : '–'}</div>
            <div className="col-span-2 text-right tabular-nums">{formatHoursMinutes(monthTotal)}</div>
            <div className="col-span-1" />
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default StaffTimeReportMonth;
