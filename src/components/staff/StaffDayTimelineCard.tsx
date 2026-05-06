/**
 * StaffDayTimelineCard — clean huvudvy för admin-tidrapportering.
 * ──────────────────────────────────────────────────────────────────
 * BESLUT (2026-05-06): Första anblicken visar systemets BÄSTA tolkning
 * av dagen — inte rådata, inte tekniska statusar.
 *
 * Renderar:
 *   - StaffDayTimeline.segments (project/travel/warehouse/unknown)
 *   - ⚠ N saker att granska (om review_required)
 *   - <details> "Visa rådata / bevisning" — bäddar gamla ActualDayPanel
 *
 * Förbjudet i huvudvyn (visas endast i den expanderade rådatasektionen):
 *   - timer_tail / timer_bridge / GPS raw / assistant_events / repair / watchdog
 *   - source/status-text som "gps_on_known_work_site"
 *   - "TIMER SAKNAS" / "ARBETSDAG SAKNAS" / "SIGNAL TAPPAD"
 *
 * Konsumerar StaffDayTimeline via buildStaffDayTimelineFromRaw —
 * ingen UI-tolkning av råa tabellrader sker här.
 */

import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Clock,
  HelpCircle,
  MapPin,
  Plane,
  Warehouse,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ActualDayPanel } from './ActualDayPanel';
import { RawEvidenceDrawer } from './RawEvidenceDrawer';
import { useApproveTimeReport } from '@/hooks/useApproveTimeReport';
import type { ActualStaffDayModel } from '@/lib/staff/actualStaffDayModel';
import {
  buildStaffDayTimelineFromRaw,
  type BuilderTimeReportInput,
  type BuilderTravelLogInput,
  type BuilderLocationEntryInput,
} from '@/lib/time/StaffDayTimelineBuilder';
import type {
  StaffDaySegment,
  StaffDaySegmentKind,
} from '@/lib/staff/staffDayTimeline';
import type { StrongWorkReasonCode } from '@/lib/staff/strongWorkIndicators';

interface StaffDayTimelineCardProps {
  staffName: string;
  staffId?: string;
  date: string;
  model: ActualStaffDayModel;
  lastPingIso: string | null;
  reportSlot?: React.ReactNode;
  extraActions?: React.ReactNode;
  rawGpsSlot?: React.ReactNode;
  // Pass-through till ActualDayPanel (rådatasektionen)
  onAdjustWorkday?: () => void;
  onCreateDistributionFromGps?: (visitKey: string) => void;
  onApproveTravelSuggestion?: (travelLogId: string) => void;
  onIgnoreEvent?: (eventId: string) => void;
  onRecomputeDay?: () => void;
  onShowRawGps?: () => void;
  onResolvePlannedGap?: React.ComponentProps<typeof ActualDayPanel>['onResolvePlannedGap'];
  onRepairWorkdayFromEvidence?: React.ComponentProps<typeof ActualDayPanel>['onRepairWorkdayFromEvidence'];
  onAutoRepairWorkdayFromEvidence?: React.ComponentProps<typeof ActualDayPanel>['onAutoRepairWorkdayFromEvidence'];
  autoRepairEnabled?: boolean;
  onWorkdayChanged?: () => void | Promise<void>;
}

const fmtHm = (iso: string | null): string => {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'HH:mm');
  } catch {
    return iso.slice(11, 16);
  }
};

const fmtDur = (m: number): string => {
  if (!m || m < 0) return '0m';
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
};

const KIND_META: Record<
  StaffDaySegmentKind,
  { Icon: React.ComponentType<{ className?: string }>; tone: string; bg: string }
> = {
  project:   { Icon: MapPin,    tone: 'text-primary',          bg: 'bg-primary/5 border-primary/20' },
  travel:    { Icon: Plane,     tone: 'text-blue-600',         bg: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200/60' },
  warehouse: { Icon: Warehouse, tone: 'text-amber-700',        bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200/60' },
  break:     { Icon: Clock,     tone: 'text-muted-foreground', bg: 'bg-muted/30 border-border' },
  other:     { Icon: Clock,     tone: 'text-muted-foreground', bg: 'bg-muted/30 border-border' },
  unknown:   { Icon: HelpCircle, tone: 'text-muted-foreground', bg: 'bg-muted/20 border-dashed border-border' },
};

function SegmentRow({ seg }: { seg: StaffDaySegment }) {
  const meta = KIND_META[seg.kind];
  const { Icon } = meta;
  return (
    <div className={`flex items-center gap-3 rounded-md border px-3 py-2 ${meta.bg}`}>
      <Icon className={`h-4 w-4 shrink-0 ${meta.tone}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium truncate">
          <span className="truncate">{seg.label}</span>
          {seg.ongoing && (
            <Badge variant="outline" className="text-[10px] py-0 h-4">pågår</Badge>
          )}
          {seg.reviewRequired && (
            <span title="Behöver granskas" className="text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
        {seg.subtitle && (
          <div className="text-xs text-muted-foreground truncate">{seg.subtitle}</div>
        )}
      </div>
      <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap flex items-center gap-1">
        <span>{fmtHm(seg.startIso)}</span>
        <ArrowRight className="h-3 w-3" />
        <span>{fmtHm(seg.endIso)}</span>
        <span className="ml-2 font-medium text-foreground">{fmtDur(seg.durationMin)}</span>
      </div>
    </div>
  );
}

export const StaffDayTimelineCard: React.FC<StaffDayTimelineCardProps> = (props) => {
  const { staffName, date, model } = props;
  const [showRaw, setShowRaw] = useState(false);
  const { approveMutation } = useApproveTimeReport();

  const timeline = useMemo(() => {
    const wd = model.reportState.workday;
    const timeReports: BuilderTimeReportInput[] = model.reportState.timeReports.map((r) => ({
      id: r.id,
      start_iso: r.start_iso,
      end_iso: r.end_iso,
      hours: r.hours,
      label: r.label,
      // Klassificering: project för bookings/large_projects, location för
      // location_id, annars 'project' som default. Travel hanteras separat.
      category: r.large_project_id || r.booking_id
        ? 'project'
        : r.location_id
          ? 'location'
          : 'project',
      approved: r.approved,
    }));
    const travelLogs: BuilderTravelLogInput[] = model.reportState.travelLogs.map((t) => ({
      id: t.id,
      start_iso: t.start_iso,
      end_iso: t.end_iso,
      fromAddress: t.fromAddress,
      toAddress: t.toAddress,
      approved: t.approved,
      destinationBookingId: null,
    }));
    const locationEntries: BuilderLocationEntryInput[] = model.reportState.locationEntries.map((l) => ({
      id: l.id,
      entered_at: l.entered_at,
      exited_at: l.exited_at,
      label: l.label,
      presenceOnly: l.isPresenceOnly,
    }));

    return buildStaffDayTimelineFromRaw({
      staff_id: props.staffId ?? 'unknown',
      staff_name: staffName,
      date,
      workday: wd ? { id: wd.id, started_at: wd.started_at, ended_at: wd.ended_at } : null,
      timeReports,
      travelLogs,
      locationEntries,
    });
  }, [model, props.staffId, staffName, date]);

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      {/* Header — clean, en rad */}
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold truncate">{staffName}</h3>
          <p className="text-xs text-muted-foreground">
            {timeline.workday_start ? fmtHm(timeline.workday_start) : '—'}
            {' → '}
            {timeline.workday_end ? fmtHm(timeline.workday_end) : (timeline.workday_start ? 'pågår' : '—')}
            {timeline.workday_suggested && (
              <span className="ml-2 italic">(föreslagen)</span>
            )}
            {timeline.payable_minutes > 0 && (
              <span className="ml-3 font-medium text-foreground">{fmtDur(timeline.payable_minutes)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {timeline.review_required && (
            <button
              type="button"
              onClick={() => setShowRaw(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200"
              title="Öppna rådata för att granska"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{timeline.review_count} {timeline.review_count === 1 ? 'sak' : 'saker'} att granska</span>
            </button>
          )}
          {timeline.evidence.timeReportIds.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant={timeline.review_required ? 'outline' : 'default'}
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate(timeline.evidence.timeReportIds)}
              title="Godkänn alla tidrapporter för dagen"
            >
              {approveMutation.isPending ? 'Godkänner…' : 'Godkänn dagen'}
            </Button>
          )}
        </div>
      </header>

      {/* Segments — systemets bästa tolkning */}
      {timeline.segments.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
          Ingen registrerad aktivitet för dagen.
        </div>
      ) : (
        <div className="space-y-1.5">
          {timeline.segments.map((seg) => (
            <SegmentRow key={seg.id} seg={seg} />
          ))}
        </div>
      )}

      {/* Rådata / bevisning — öppnas i en sidopanel (drawer).
          OBS: reportSlot (rad-tabellen) renderas EJ i huvudvyn längre.
          time_reports är segment-/fördelningsdata och visas i drawern. */}
      <div className="border-t pt-2">
        <button
          type="button"
          onClick={() => setShowRaw(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
          <span>Visa rådata / bevisning{props.reportSlot ? ' · rapportrader' : ''}</span>
        </button>
      </div>

      {/* Action-rad utanför rådata om props.extraActions skickats */}
      {props.extraActions && (
        <div className="flex items-center pt-1">{props.extraActions}</div>
      )}

      <RawEvidenceDrawer
        open={showRaw}
        onOpenChange={setShowRaw}
        timeline={timeline}
        panelProps={{
          staffName: props.staffName,
          staffId: props.staffId,
          date: props.date,
          model: props.model,
          lastPingIso: props.lastPingIso,
          reportSlot: undefined,
          extraActions: props.extraActions,
          rawGpsSlot: props.rawGpsSlot,
          onAdjustWorkday: props.onAdjustWorkday,
          onCreateDistributionFromGps: props.onCreateDistributionFromGps,
          onApproveTravelSuggestion: props.onApproveTravelSuggestion,
          onIgnoreEvent: props.onIgnoreEvent,
          onRecomputeDay: props.onRecomputeDay,
          onShowRawGps: props.onShowRawGps,
          onResolvePlannedGap: props.onResolvePlannedGap,
          onRepairWorkdayFromEvidence: props.onRepairWorkdayFromEvidence,
          onAutoRepairWorkdayFromEvidence: props.onAutoRepairWorkdayFromEvidence,
          autoRepairEnabled: props.autoRepairEnabled,
          onWorkdayChanged: props.onWorkdayChanged,
        }}
      />
    </section>
  );
};

// Re-use the strong reason types so callers don't import twice.
export type { StrongWorkReasonCode };
