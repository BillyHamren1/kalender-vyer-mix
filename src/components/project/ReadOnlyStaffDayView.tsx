import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTeamResources } from '@/hooks/useTeamResources';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Props {
  /** ISO yyyy-MM-dd */
  date: string;
  /** Team som planeringen för dagen är riktad mot — markeras visuellt */
  highlightedTeamId?: string;
  /** Förhandsvisa det egna planerade blocket per team för den här dagen */
  previewBlock?: { teamId: string; startTime: string; endTime: string; label?: string } | null;
}

interface CalEvent {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string;
  resource_id: string | null;
  event_type: string | null;
}

const minsFromMidnight = (iso: string): number => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

const minsFromHHMM = (s: string): number => {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const fmtRange = (start: string, end: string) => {
  const f = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  return `${f(start)}–${f(end)}`;
};

/**
 * Lättviktig dagvy som speglar personalkalenderns dagvy:
 * en kolumn per team, befintliga calendar_events som färgade block.
 * Read-only — endast för referens när man planerar i `BookingPlacementDialog`.
 */
export const ReadOnlyStaffDayView: React.FC<Props> = ({ date, highlightedTeamId, previewBlock }) => {
  const { teamResources } = useTeamResources();

  const teams = useMemo(() => {
    return (teamResources || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((r: any) => r.id !== 'team-11' && r.id !== 'transport')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => ({ id: r.id, title: r.title }));
  }, [teamResources]);

  const { data: events, isLoading } = useQuery({
    queryKey: ['placement-day-events', date],
    enabled: !!date,
    queryFn: async (): Promise<CalEvent[]> => {
      const dayStart = `${date}T00:00:00+00:00`;
      const dayEnd = `${date}T23:59:59+00:00`;
      const { data, error } = await supabase
        .from('calendar_events')
        .select('id, title, start_time, end_time, resource_id, event_type')
        .eq('source_date', date)
        .order('start_time', { ascending: true });
      if (error) {
        console.warn('[ReadOnlyStaffDayView] fallback range query', error);
        const { data: data2 } = await supabase
          .from('calendar_events')
          .select('id, title, start_time, end_time, resource_id, event_type')
          .gte('start_time', dayStart)
          .lte('start_time', dayEnd);
        return (data2 || []) as CalEvent[];
      }
      return (data || []) as CalEvent[];
    },
  });

  // Tidsspann 06–24 (samma som personalkalendern oftast visar)
  const HOUR_START = 6;
  const HOUR_END = 24;
  const totalMins = (HOUR_END - HOUR_START) * 60;
  const PX_PER_HOUR = 28;
  const totalHeight = (HOUR_END - HOUR_START) * PX_PER_HOUR;

  const eventsByTeam = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    (events || []).forEach((ev) => {
      const tid = ev.resource_id || 'unassigned';
      if (!map[tid]) map[tid] = [];
      map[tid].push(ev);
    });
    return map;
  }, [events]);

  const top = (mins: number) => ((mins - HOUR_START * 60) / totalMins) * totalHeight;
  const height = (startMins: number, endMins: number) =>
    Math.max(8, ((endMins - startMins) / totalMins) * totalHeight);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Laddar dagvy…
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
      <div className="flex border-b border-border/50 bg-muted/30 px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        <div className="w-10 shrink-0">Tid</div>
        {teams.map((t) => (
          <div
            key={t.id}
            className={`flex-1 text-center font-medium ${
              t.id === highlightedTeamId ? 'text-primary' : ''
            }`}
          >
            {t.title}
            {t.id === highlightedTeamId && (
              <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px] border-primary text-primary">
                Här
              </Badge>
            )}
          </div>
        ))}
      </div>

      <div className="flex relative" style={{ height: totalHeight }}>
        {/* Tidsskala */}
        <div className="w-10 shrink-0 relative border-r border-border/40">
          {Array.from({ length: HOUR_END - HOUR_START + 1 }).map((_, i) => {
            const h = HOUR_START + i;
            return (
              <div
                key={h}
                className="absolute left-0 right-0 text-[10px] text-muted-foreground/60 pl-1"
                style={{ top: i * PX_PER_HOUR - 6 }}
              >
                {String(h).padStart(2, '0')}
              </div>
            );
          })}
        </div>

        {teams.map((t) => {
          const teamEvents = eventsByTeam[t.id] || [];
          const isHighlight = t.id === highlightedTeamId;
          return (
            <div
              key={t.id}
              className={`flex-1 relative border-r border-border/30 last:border-r-0 ${
                isHighlight ? 'bg-primary/5' : ''
              }`}
            >
              {/* timgrid-linjer */}
              {Array.from({ length: HOUR_END - HOUR_START }).map((_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t border-border/20"
                  style={{ top: i * PX_PER_HOUR }}
                />
              ))}

              {teamEvents.map((ev) => {
                const sm = minsFromMidnight(ev.start_time);
                const em = minsFromMidnight(ev.end_time);
                if (em <= HOUR_START * 60 || sm >= HOUR_END * 60) return null;
                const sCl = Math.max(sm, HOUR_START * 60);
                const eCl = Math.min(em, HOUR_END * 60);
                return (
                  <div
                    key={ev.id}
                    className="absolute left-0.5 right-0.5 rounded bg-amber-200/70 border border-amber-400 text-[10px] px-1 py-0.5 overflow-hidden"
                    style={{ top: top(sCl), height: height(sCl, eCl) }}
                    title={`${ev.title || 'Bokad'} ${fmtRange(ev.start_time, ev.end_time)}`}
                  >
                    <div className="font-medium truncate">{ev.title || 'Bokad'}</div>
                    <div className="text-[9px] text-muted-foreground">
                      {fmtRange(ev.start_time, ev.end_time)}
                    </div>
                  </div>
                );
              })}

              {/* Förhandsvisning av nya blocket */}
              {previewBlock && previewBlock.teamId === t.id && (
                <div
                  className="absolute left-0.5 right-0.5 rounded bg-primary/30 border-2 border-primary text-[10px] px-1 py-0.5 overflow-hidden"
                  style={{
                    top: top(minsFromHHMM(previewBlock.startTime)),
                    height: height(
                      minsFromHHMM(previewBlock.startTime),
                      minsFromHHMM(previewBlock.endTime),
                    ),
                  }}
                >
                  <div className="font-medium truncate">
                    {previewBlock.label || 'Nytt block'}
                  </div>
                  <div className="text-[9px]">
                    {previewBlock.startTime}–{previewBlock.endTime}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
