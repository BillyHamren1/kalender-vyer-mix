/**
 * ProjectCalendarView
 * --------------------------------------------------------------------------
 * Ersätter Gantt-vyn för projekt med en horisontellt scrollbar dagslista
 * — samma vy-typ som personalkalendern.
 *
 *   Header per dag är färgad efter fas:
 *     • Riggning  → ljusgrön
 *     • Event     → ljusgul
 *     • Demont.   → ljusröd
 *
 * Dataflöde:
 *   1. `useProjectGanttEvents` ger calendar_events för projektets bookings
 *      (samma källa som tidigare Gantt — alla skrivfunktioner är intakta).
 *   2. `useProjectStaffByDay` ger personal per dag från `staff_assignments`
 *      (1:1 med personalkalendern enligt calendar-team-model-v1).
 *   3. Bookings staplas read-only per dag (nästa iteration: drag/flytt).
 *
 * Ingen logik kring funktionerna som skapar aktiviteter ändras — bara vyn.
 */
import { useMemo } from 'react';
import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Calendar as CalIcon, Users, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProjectGanttEvents, type GanttPhase, type GanttCalendarEvent } from '@/hooks/useProjectGanttEvents';
import { useProjectStaffByDay } from '@/hooks/useProjectStaffByDay';

interface Props {
  projectId: string | null | undefined;
  bookingId?: string | null;
  isLargeProject?: boolean;
}

/** Phase → header-färg (ljus pastell, semantiska tokens där möjligt). */
const PHASE_HEADER: Record<GanttPhase, { bg: string; label: string; ring: string }> = {
  rig:     { bg: 'bg-green-200/70 text-green-900', label: 'Riggning',    ring: 'ring-green-400/40' },
  event:   { bg: 'bg-yellow-200/80 text-yellow-900', label: 'Event',     ring: 'ring-yellow-400/40' },
  rigDown: { bg: 'bg-red-200/70 text-red-900',    label: 'Demontering',  ring: 'ring-red-400/40' },
};

const DAY_WIDTH = 220; // bred kolumn för läsbar bokningslista

interface DayBucket {
  date: string;             // YYYY-MM-DD
  phases: Set<GanttPhase>;  // vilka faser som infaller denna dag
  events: GanttCalendarEvent[];
}

const ProjectCalendarView = ({ projectId, bookingId, isLargeProject }: Props) => {
  const { events, isLoading, refetch } = useProjectGanttEvents({ projectId, bookingId, isLargeProject });

  // Bygg dagar från min(source_date) → max(source_date)
  const { days, buckets } = useMemo(() => {
    const dates = events.map((e) => e.source_date).filter(Boolean).sort();
    if (dates.length === 0) return { days: [] as Date[], buckets: new Map<string, DayBucket>() };

    const start = parseISO(dates[0]);
    const end = parseISO(dates[dates.length - 1]);
    const total = differenceInCalendarDays(end, start) + 1;
    const dayList = Array.from({ length: Math.max(total, 1) }, (_, i) => addDays(start, i));

    const map = new Map<string, DayBucket>();
    dayList.forEach((d) => {
      const key = format(d, 'yyyy-MM-dd');
      map.set(key, { date: key, phases: new Set(), events: [] });
    });
    events.forEach((ev) => {
      const b = map.get(ev.source_date);
      if (!b) return;
      b.phases.add(ev.event_type);
      b.events.push(ev);
    });
    return { days: dayList, buckets: map };
  }, [events]);

  const dateKeys = useMemo(() => days.map((d) => format(d, 'yyyy-MM-dd')), [days]);
  const { staffByDay, isLoading: isLoadingStaff } = useProjectStaffByDay(dateKeys);

  if (!projectId) return null;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CalIcon className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Projektkalender</CardTitle>
          <Badge variant="outline" className="text-[10px]">Synk med personalkalender</Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 text-muted-foreground text-sm flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Laddar kalender…
          </div>
        ) : days.length === 0 ? (
          <div className="p-6 text-muted-foreground text-sm">
            Inga planerade dagar ännu. Lägg in tider i personalkalendern så dyker de upp här.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex" style={{ minWidth: days.length * DAY_WIDTH }}>
              {days.map((d) => {
                const key = format(d, 'yyyy-MM-dd');
                const bucket = buckets.get(key)!;
                const isToday = differenceInCalendarDays(d, startOfDay(new Date())) === 0;
                const phases = Array.from(bucket.phases);
                const primaryPhase: GanttPhase | null =
                  phases.includes('event') ? 'event'
                  : phases.includes('rig') ? 'rig'
                  : phases.includes('rigDown') ? 'rigDown'
                  : null;
                const headerStyle = primaryPhase ? PHASE_HEADER[primaryPhase] : null;
                const staff = staffByDay.get(key) ?? [];
                const bookings = bucket.events;

                return (
                  <div
                    key={key}
                    className={cn(
                      'flex-shrink-0 border-r last:border-r-0 flex flex-col',
                      isToday && 'ring-2 ring-inset ring-primary/40',
                    )}
                    style={{ width: DAY_WIDTH }}
                  >
                    {/* Header — färgad efter fas */}
                    <div
                      className={cn(
                        'px-3 py-2 border-b',
                        headerStyle?.bg ?? 'bg-muted/40 text-muted-foreground',
                      )}
                    >
                      <div className="flex items-baseline justify-between">
                        <div>
                          <div className="text-sm font-semibold capitalize">
                            {format(d, 'EEEE', { locale: sv })}
                          </div>
                          <div className="text-xs opacity-80">
                            {format(d, 'd MMM yyyy', { locale: sv })}
                          </div>
                        </div>
                        {phases.length > 0 && (
                          <div className="flex flex-wrap gap-1 justify-end">
                            {phases.map((p) => (
                              <Badge
                                key={p}
                                variant="outline"
                                className="text-[9px] h-4 px-1 bg-background/60"
                              >
                                {PHASE_HEADER[p].label}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Personal — 1:1 från personalkalendern */}
                    <div className="px-3 py-2 border-b bg-muted/10">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                        <Users className="h-3 w-3" /> Personal
                      </div>
                      {isLoadingStaff ? (
                        <div className="text-xs text-muted-foreground">…</div>
                      ) : staff.length === 0 ? (
                        <div className="text-xs text-muted-foreground/70 italic">Ingen tilldelad</div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {staff.map((s) => (
                            <span
                              key={s.staffId}
                              className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-medium"
                              title={s.teamId ? `${s.name} (${s.teamId})` : s.name}
                            >
                              {s.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bokningar — read-only stack per dag */}
                    <div className="px-3 py-2 flex-1 min-h-[120px]">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                        <Package className="h-3 w-3" /> Bokningar
                      </div>
                      {bookings.length === 0 ? (
                        <div className="text-xs text-muted-foreground/70 italic">Inga bokningar</div>
                      ) : (
                        <div className="space-y-1.5">
                          {bookings.map((ev) => {
                            const startHHMM = ev.start_time.slice(11, 16);
                            const endHHMM = ev.end_time.slice(11, 16);
                            const phaseStyle = PHASE_HEADER[ev.event_type];
                            return (
                              <div
                                key={ev.id}
                                className={cn(
                                  'rounded-md border px-2 py-1.5 text-xs bg-card',
                                  phaseStyle.ring && `ring-1 ${phaseStyle.ring}`,
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium truncate">
                                    {ev.booking_number || ev.title || 'Bokning'}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                    {startHHMM}–{endHHMM}
                                  </span>
                                </div>
                                {ev.delivery_address && (
                                  <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                                    {ev.delivery_address}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footnot */}
            <div className="px-3 py-2 border-t text-xs text-muted-foreground">
              Personal speglas 1:1 från personalkalendern. Bokningsplacering hanteras i nästa steg.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProjectCalendarView;
