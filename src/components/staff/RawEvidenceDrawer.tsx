/**
 * RawEvidenceDrawer — sidopanel som öppnas från huvudvyns ⚠-triangel
 * eller "Visa rådata"-knappen.
 *
 * BESLUT (2026-05-06):
 *   Huvudvyn (StaffDayTimelineCard) visar bara systemets bästa tolkning.
 *   All rådata, badges och tekniska labels lever här istället:
 *
 *     - GPS / location_time_entries
 *     - assistant_events
 *     - time_reports
 *     - travel_time_logs
 *     - repair / watchdog events (via ActualDayPanel-internals)
 *     - orsaker till review_required (workday_flags + anomalies + okända block)
 *
 * Drawer:n är en tunn skal kring den befintliga ActualDayPanel — inget
 * av den gamla logiken försvinner, vi flyttar bara presentationen ur
 * huvudvyn.
 */

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ActualDayPanel } from './ActualDayPanel';
import type { StaffDayTimeline } from '@/lib/staff/staffDayTimeline';

type ActualDayPanelProps = React.ComponentProps<typeof ActualDayPanel>;

export interface RawEvidenceDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeline: StaffDayTimeline;
  /** Hela ActualDayPanel-prop-paketet skickas in oförändrat. */
  panelProps: ActualDayPanelProps;
}

export const RawEvidenceDrawer: React.FC<RawEvidenceDrawerProps> = ({
  open,
  onOpenChange,
  timeline,
  panelProps,
}) => {
  const reviewSegments = timeline.segments.filter((s) => s.reviewRequired);
  const ev = timeline.evidence;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl lg:max-w-3xl overflow-y-auto p-0"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-card px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-base">
                Rådata · {timeline.staff_name}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {timeline.date} · all bevisning som driver tolkningen av dagen
              </SheetDescription>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Stäng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Snabb sammanfattning av evidence-volymer */}
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
            <Badge variant="outline">
              workday: {ev.workdayRowIds?.length ?? 0}
            </Badge>
            <Badge variant="outline">
              time_reports: {ev.timeReportIds?.length ?? 0}
            </Badge>
            <Badge variant="outline">
              travel_logs: {ev.travelLogIds?.length ?? 0}
            </Badge>
            <Badge variant="outline">
              location_entries: {ev.locationEntryIds?.length ?? 0}
            </Badge>
            <Badge variant="outline">
              assistant: {ev.assistantEventIds?.length ?? 0}
            </Badge>
          </div>
        </SheetHeader>

        <div className="space-y-5 px-5 py-5">
          {/* Review-orsaker — varför triangeln visas i huvudvyn */}
          {timeline.review_required && (
            <section className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30 dark:border-amber-800">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4" />
                Att granska ({timeline.review_count})
              </div>
              <ul className="mt-2 space-y-1 text-xs text-amber-900/90 dark:text-amber-100/90">
                {reviewSegments.map((s) => (
                  <li key={s.id} className="flex items-start gap-2">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span>
                      <span className="font-medium uppercase tracking-wide">
                        {s.kind}
                      </span>
                      {' · '}
                      {s.label}
                      {s.subtitle ? ` — ${s.subtitle}` : ''}
                    </span>
                  </li>
                ))}
                {ev.notes?.map((n, i) => (
                  <li key={`n-${i}`} className="flex items-start gap-2">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span>{n}</span>
                  </li>
                ))}
                {reviewSegments.length === 0 && (ev.notes?.length ?? 0) === 0 && (
                  <li className="italic">
                    Granskning krävs men ingen specifik orsak listad —
                    se anomalies/flags i panelen nedan.
                  </li>
                )}
              </ul>
            </section>
          )}

          {/* Den fulla gamla panelen — badges, repair, watchdog, GPS, allt. */}
          <ActualDayPanel {...panelProps} />
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default RawEvidenceDrawer;
