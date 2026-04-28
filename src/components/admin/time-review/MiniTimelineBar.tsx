import React from 'react';
import { cn } from '@/lib/utils';
import type { ReviewWorkEntry, ReviewTravelSegment, ReviewWorkdayInput } from '@/lib/admin/adminTimeReviewEngine';

/**
 * MiniTimelineBar — 24h horizontal track that visualizes the day at a
 * glance: workday window (background), reported activity (teal), travel
 * (amber), and current time marker if the workday is still open.
 */
export interface MiniTimelineBarProps {
  date: string; // YYYY-MM-DD
  workday: ReviewWorkdayInput | null;
  workEntries: ReadonlyArray<ReviewWorkEntry>;
  travelSegments: ReadonlyArray<ReviewTravelSegment>;
  className?: string;
}

const minutesIntoDay = (iso: string, baseYmd: string): number => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  const base = new Date(`${baseYmd}T00:00:00`);
  return Math.max(0, Math.min(24 * 60, Math.round((d.getTime() - base.getTime()) / 60_000)));
};

const pct = (mins: number) => `${(mins / (24 * 60)) * 100}%`;

const Segment: React.FC<{ start: number; end: number; tone: string; title: string }> = ({ start, end, tone, title }) => {
  if (end <= start) return null;
  return (
    <div
      title={title}
      className={cn('absolute top-0 bottom-0 rounded-sm', tone)}
      style={{ left: pct(start), width: pct(Math.max(2, end - start)) }}
    />
  );
};

export const MiniTimelineBar: React.FC<MiniTimelineBarProps> = ({ date, workday, workEntries, travelSegments, className }) => {
  const wdStart = workday?.started_at ? minutesIntoDay(workday.started_at, date) : null;
  const wdEnd = workday?.ended_at ? minutesIntoDay(workday.ended_at, date) : (workday ? minutesIntoDay(new Date().toISOString(), date) : null);
  const isOpen = !!workday && !workday.ended_at;

  const nowMin = minutesIntoDay(new Date().toISOString(), date);

  return (
    <div className={cn('relative h-3 w-full rounded-md bg-muted/60 overflow-hidden', className)}>
      {/* Hour ticks */}
      {[6, 12, 18].map((h) => (
        <div key={h} className="absolute top-0 bottom-0 w-px bg-foreground/10" style={{ left: `${(h / 24) * 100}%` }} />
      ))}

      {/* Workday window background */}
      {wdStart != null && wdEnd != null && (
        <Segment
          start={wdStart}
          end={wdEnd}
          tone={isOpen ? 'bg-teal-500/25' : 'bg-slate-400/25'}
          title="Arbetsdag"
        />
      )}

      {/* Reported activity (no subdivisions — already filtered upstream) */}
      {workEntries.map((e) =>
        e.start_time && e.end_time && !e.is_subdivision ? (
          <Segment
            key={`a-${e.id}`}
            start={minutesIntoDay(e.start_time, date)}
            end={minutesIntoDay(e.end_time, date)}
            tone="bg-emerald-500/80"
            title="Aktivitet"
          />
        ) : null,
      )}

      {/* Travel */}
      {travelSegments.map((t) =>
        t.start_time && t.end_time ? (
          <Segment
            key={`t-${t.id}`}
            start={minutesIntoDay(t.start_time, date)}
            end={minutesIntoDay(t.end_time, date)}
            tone="bg-amber-500/80"
            title="Restid"
          />
        ) : null,
      )}

      {/* Now marker if open */}
      {isOpen && (
        <div
          className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-teal-600 rounded-full shadow-[0_0_0_2px_hsl(var(--background))]"
          style={{ left: pct(nowMin) }}
          title="Nu"
        />
      )}
    </div>
  );
};

export default MiniTimelineBar;
