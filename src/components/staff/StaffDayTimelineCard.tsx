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

import React, { useEffect, useMemo, useState } from 'react';
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
import { DecisionTraceDrawer } from './DecisionTraceDrawer';
import {
  ReportCandidateTimeline,
  type ReportCandidateBlockUI,
  type ReportCandidateSummaryUI,
} from './ReportCandidateTimeline';
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
import { formatStockholmHm, formatStockholmHms } from '../../lib/staff/formatStockholmTime';

interface StaffDayTimelineCardProps {
  staffName: string;
  staffId?: string;
  date: string;
  model: ActualStaffDayModel;
  lastPingIso: string | null;
  reportSlot?: React.ReactNode;
  extraActions?: React.ReactNode;
  rawGpsSlot?: React.ReactNode;
  /**
   * Canonical report-candidate blocks från get-staff-presence-day.
   * När dessa finns används de som huvudtimeline. Saknas de visas
   * en fallback från actualModel + tydlig märkning.
   */
  reportCandidateBlocks?: ReportCandidateBlockUI[] | null;
  reportCandidateSummary?: ReportCandidateSummaryUI | null;
  reportCandidateLoading?: boolean;
  /** Råa presenceDayBlocks från get-staff-presence-day (för locationEvidence-överlagring). */
  reportCandidatePresenceBlocks?: import('@/lib/staff/buildReportDisplayBlocks').PresenceBlockLite[] | null;
  /** Resolved targets från get-staff-presence-day (för nearest primary/secondary). */
  reportCandidateTargets?: import('@/lib/staff/buildReportDisplayBlocks').TargetLite[] | null;
  /**
   * Hela beslutspayloaden från get-staff-presence-day (read-only).
   * Sparas på personnivå så att admin kan inspektera GPS → presenceDayBlocks
   * → reportCandidateBlocks → displayBlocks utan att rebuilda motorn.
   * Fälten är medvetet `any` — formen ägs av edge-funktionen.
   */
  reportCandidateDiagnostics?: any;
  /** Pre-work blocks excluded from the main report (Decision Trace evidence). */
  reportCandidateExcludedPreWorkBlocks?: ReportCandidateBlockUI[] | null;
  reportCandidatePreWorkExclusionDiagnostics?: any;
  reportCandidateTargetResolution?: any;
  reportCandidatePresenceRawEvidence?: any[] | null;
  reportCandidateRawGpsTimeline?: any;
  reportCandidateTechnicalTimeline?: any[] | null;
  reportCandidatePresenceDaySummary?: any;
  reportCandidatePresenceDayAggregation?: any;
  reportCandidateTargetMatchSummary?: any;
  reportCandidateCounts?: any;
  /**
   * Sidnivå-engineMode. Kortet får ALDRIG välja motor själv — det här är
   * sanningen för raden. 'report_candidate' = ny motor (även om blocks är
   * tom array). 'actual_model_fallback' = renderas alltid med actualModel,
   * även om reportCandidateBlocks råkar finnas.
   */
  engineMode?: 'report_candidate' | 'actual_model_fallback';
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
    return formatStockholmHm(iso);
  } catch {
    return formatStockholmHm(iso);
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
  signal_stale: { Icon: HelpCircle, tone: 'text-muted-foreground', bg: 'bg-muted/10 border-dashed border-border' },
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
  const [showDecisionTrace, setShowDecisionTrace] = useState(false);
  const { approveMutation } = useApproveTimeReport();

  // 1Hz tick so any pågående arbetsdag/segment räknar upp i realtid utan
  // att vänta på nästa server-refetch. Pausas till 60s när inget är öppet.
  const hasOngoing =
    !model.reportState.workday?.ended_at
    || model.reportState.timeReports.some((r) => !r.end_iso)
    || model.reportState.travelLogs.some((t) => !t.end_iso)
    || model.reportState.locationEntries.some((l) => !l.exited_at);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const interval = hasOngoing ? 1000 : 60_000;
    const id = window.setInterval(() => setNowMs(Date.now()), interval);
    return () => window.clearInterval(id);
  }, [hasOngoing]);

  const timeline = useMemo(() => {
    const wd = model.reportState.workday;

    // Klassa workday-ursprung. Auto-repair/cron/watchdog visas inte med text
    // i huvudvyn — bara via review_required + evidence/notes.
    const startedBy = (wd?.started_by ?? '').toLowerCase();
    const wdAutoOrigin: string | null =
      startedBy.startsWith('auto_repair') ? 'auto_repair'
      : startedBy === 'cron' || startedBy === 'watchdog' || startedBy === 'system'
        ? startedBy
        : null;

    // Syntetiska källor som ALDRIG ska bli huvudsegment.
    const SYNTHETIC_LTE_SOURCES = new Set([
      'auto_assigned',
      'auto_assigned_bg',
      'auto_assigned_backfill',
      'ai_reconciled',
      'system',
      'watchdog',
      'cron',
    ]);
    const SYNTHETIC_TRAVEL_SOURCES = new Set([
      'geofence_auto_switch_server_backfill',
      'server_background_gps_backfill',
    ]);

    const timeReports: BuilderTimeReportInput[] = model.reportState.timeReports.map((r) => ({
      id: r.id,
      start_iso: r.start_iso,
      end_iso: r.end_iso,
      hours: r.hours,
      label: r.label,
      category: r.large_project_id || r.booking_id
        ? 'project'
        : r.location_id
          ? 'location'
          : 'project',
      approved: r.approved,
    }));
    const travelLogs: BuilderTravelLogInput[] = model.reportState.travelLogs.map((t) => {
      const src = String(t.source ?? '').toLowerCase();
      const synthetic = SYNTHETIC_TRAVEL_SOURCES.has(src);
      return {
        id: t.id,
        start_iso: t.start_iso,
        end_iso: t.end_iso,
        fromAddress: t.fromAddress,
        toAddress: t.toAddress,
        fromLatitude: t.fromLatitude ?? null,
        fromLongitude: t.fromLongitude ?? null,
        toLatitude: t.toLatitude ?? null,
        toLongitude: t.toLongitude ?? null,
        description: t.description ?? null,
        approved: t.approved,
        destinationBookingId: null,
        synthetic,
        autoOrigin: synthetic ? src : null,
      };
    });
    const locationEntries: BuilderLocationEntryInput[] = model.reportState.locationEntries.map((l) => {
      const src = String(l.source ?? '').toLowerCase();
      const meta = (l.metadata && typeof l.metadata === 'object') ? l.metadata as Record<string, any> : {};
      const autoStartSrc = String(meta.auto_start_source ?? '').toLowerCase();
      const isBackfill = autoStartSrc === 'server_background_gps_backfill'
        || src === 'auto_geofence_server_backfill';
      const synthetic = SYNTHETIC_LTE_SOURCES.has(src) || isBackfill;
      return {
        id: l.id,
        entered_at: l.entered_at,
        exited_at: l.exited_at,
        label: l.label,
        presenceOnly: l.isPresenceOnly,
        synthetic,
        autoOrigin: synthetic ? (isBackfill ? 'server_background_gps_backfill' : src) : null,
      };
    });

    return buildStaffDayTimelineFromRaw({
      staff_id: props.staffId ?? 'unknown',
      staff_name: staffName,
      date,
      workday: wd
        ? { id: wd.id, started_at: wd.started_at, ended_at: wd.ended_at, autoOrigin: wdAutoOrigin }
        : null,
      timeReports,
      travelLogs,
      locationEntries,
      now: new Date(nowMs),
    });
  }, [model, props.staffId, staffName, date, nowMs]);

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
        </div>
      </header>

      {/* Huvudtimeline — STRIKT styrd av sidnivå-engineMode. Personraden
          får aldrig själv välja motor; valet görs i StaffTimeReports.tsx. */}
      {(() => {
        const mode = props.engineMode ?? 'report_candidate';
        if (mode === 'report_candidate') {
          return (
            <>
              <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-primary">
                Engine: reportCandidate
              </div>
              <ReportCandidateTimeline
                blocks={props.reportCandidateBlocks ?? []}
                summary={props.reportCandidateSummary ?? null}
                loading={props.reportCandidateLoading}
                presenceBlocks={props.reportCandidatePresenceBlocks ?? null}
                targets={props.reportCandidateTargets ?? null}
                staffId={props.staffId}
                staffName={props.staffName}
                date={props.date}
                excludedPreWorkBlocks={props.reportCandidateExcludedPreWorkBlocks ?? null}
                preWorkExclusionDiagnostics={props.reportCandidatePreWorkExclusionDiagnostics ?? null}
              />
            </>
          );
        }
        // actual_model_fallback — alla rader renderas med actualModel.
        return (
          <>
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Engine: actualModel fallback
            </div>
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
          </>
        );
      })()}

      {/* Rådata-expander och full detaljvy-länken är borttagna 2026-05-10.
          Ersatta av per-block "Bevisning" inne i ReportCandidateTimeline. */}

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
          reportSlot: props.reportSlot,
          extraActions: undefined,
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

      <DecisionTraceDrawer
        open={showDecisionTrace}
        onOpenChange={setShowDecisionTrace}
        staffName={props.staffName}
        staffId={props.staffId ?? 'unknown'}
        date={props.date}
        engineMode={props.engineMode}
        reportCandidateBlocks={props.reportCandidateBlocks ?? []}
        reportCandidateSummary={props.reportCandidateSummary ?? null}
        presenceDayBlocks={(props.reportCandidatePresenceBlocks ?? []) as any[]}
        presenceDayBlocksRawEvidence={(props.reportCandidatePresenceRawEvidence ?? []) as any[]}
        rawGpsTimeline={props.reportCandidateRawGpsTimeline ?? null}
        technicalTimeline={(props.reportCandidateTechnicalTimeline ?? []) as any[]}
        targets={(props.reportCandidateTargets ?? []) as any[]}
        targetResolution={props.reportCandidateTargetResolution ?? null}
        reportCandidateDiagnostics={props.reportCandidateDiagnostics ?? null}
        targetMatchSummary={props.reportCandidateTargetMatchSummary ?? null}
        counts={props.reportCandidateCounts ?? null}
        excludedPreWorkBlocks={props.reportCandidateExcludedPreWorkBlocks ?? null}
        preWorkExclusionDiagnostics={props.reportCandidatePreWorkExclusionDiagnostics ?? null}
      />
    </section>
  );
};

// Re-use the strong reason types so callers don't import twice.
export type { StrongWorkReasonCode };
