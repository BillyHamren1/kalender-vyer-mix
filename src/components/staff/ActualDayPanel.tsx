import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  MapPin,
  Plane,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReprocessDayPreviewDialog, type ReprocessChoice } from './ReprocessDayPreviewDialog';
import { toast } from 'sonner';
import { useReverseGeocodeRichStatus, type RichGeocode, type RichGeocodeStatus } from '@/hooks/useReverseGeocodeRich';
import { inferActivityFromPlace } from '@/lib/staff/inferActivityFromPlace';
import { extractUTCTime } from '@/utils/dateUtils';
import type {
  ActualEvent,
  ActualEventKind,
  ActualEventSeverity,
  ActualStaffDayModel,
  JourneyPlace,
  PlaceLookupStatus,
  ProposedAnomaly,
  ResolvedPlace,
} from '@/lib/staff/actualStaffDayModel';
import { classifyStopSource, STOP_SOURCE_BADGE_CLASSES, inlineStopSuffix, isStopConfident } from '@/lib/staff/stopSourceClassifier';
import { computeStrongWorkIndicators, type StrongWorkReasonCode } from '@/lib/staff/strongWorkIndicators';

/**
 * ActualDayPanel — visar dagen i tre lager:
 *   B. Dagens faktiska händelser (timeline)
 *   C. Nuvarande rapport (kort sammanfattning; full tabell renderas av caller)
 *   D. Föreslagna korrigeringar
 *   E. Åtgärder
 *
 * Header (A) renderas inline överst.
 *
 * Designprincip: Faktisk dag är ALLTID synlig (inte gömd bakom GPS-debug).
 * Rapporttabellen blir "Nuvarande rapport", inte sanningen om dagen.
 */

interface ActualDayPanelProps {
  staffName: string;
  date: string;
  model: ActualStaffDayModel;
  /** Senast kända ping-tid (från staff_locations). */
  lastPingIso: string | null;
  /** Knapp-handlers. Caller får implementera flödena. Optional för stubs. */
  onAdjustWorkday?: () => void;
  onCreateDistributionFromGps?: (visitKey: string) => void;
  onApproveTravelSuggestion?: (travelLogId: string) => void;
  onIgnoreEvent?: (eventId: string) => void;
  onRecomputeDay?: () => void;
  onShowRawGps?: () => void;
  /**
   * Resolve a "planned_time_without_signal" anomaly via admin action.
   * Caller is responsible for invoking the `admin_create_workday_from_planned`
   * edge action with the chosen mode + ISO start time.
   */
  onResolvePlannedGap?: (input: {
    anomalyId: string;
    mode: 'planned' | 'first_signal' | 'custom' | 'absence';
    plannedStartIso: string;
    firstSignalIso: string | null;
    customStartIso?: string;
    assignmentId: string | null;
    noSignalGapMinutes: number;
    label: string;
  }) => Promise<void> | void;
  /** Renderas inuti collapse-sektionen "Nuvarande sparad rapport". */
  reportSlot?: React.ReactNode;
  /** Renderas i den gemensamma actionbaren (E). */
  extraActions?: React.ReactNode;
  /** Renderas inuti collapse-sektionen "Rå GPS / debug". */
  rawGpsSlot?: React.ReactNode;
  /**
   * Repair-action när workday saknas men det finns starka arbetsbevis
   * (assignment + GPS, timer existerar, två arbetsplatser, etc.).
   * Caller bör trigga `admin_repair_workday_from_evidence` edge-action.
   */
  onRepairWorkdayFromEvidence?: (input: {
    proposedStartIso: string;
    proposedEndIso: string | null;
    reasonCodes: StrongWorkReasonCode[];
  }) => Promise<void> | void;
}

const fmtHm = (iso: string) => {
  try {
    return format(new Date(iso), 'HH:mm');
  } catch {
    return iso.slice(11, 16);
  }
};

const fmtMin = (m: number) => {
  if (!m || m < 0) return '0h';
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
};

// ── A. Header status ────────────────────────────────────────────────
type HeaderStatus =
  | 'ok'
  | 'review'
  | 'signal_lost'
  | 'pre_workday'
  | 'missing_report'
  | 'missing_strong_evidence'
  | 'auto_repaired'
  | 'planned_only'
  | 'evidence_repair_proposed'
  | 'ongoing'
  | 'ended';

const AUTO_REPAIR_SOURCES = new Set([
  'auto_repair_from_timer',
  'server_background_gps_repair',
  'server_background_gps_backfill',
  'server_background_gps',
]);

function isAutoRepairedWorkday(wd: any): boolean {
  if (!wd) return false;
  const meta = (wd.metadata ?? {}) as any;
  if (AUTO_REPAIR_SOURCES.has(meta?.auto_start_source)) return true;
  if (meta?.auto_started === true) return true;
  if (typeof wd.started_by === 'string' && wd.started_by.startsWith('auto_repair')) return true;
  if (typeof wd.started_by === 'string' && wd.started_by.startsWith('server_auto_start')) return true;
  return false;
}

function deriveStatus(model: ActualStaffDayModel): { kind: HeaderStatus; label: string } {
  if (model.signalLost) return { kind: 'signal_lost', label: 'Signal tappad' };
  const wd = model.reportState.workday;
  if (wd && !wd.ended_at) {
    if (isAutoRepairedWorkday(wd)) {
      return { kind: 'auto_repaired', label: 'Auto-skapad arbetsdag · pågår' };
    }
    return { kind: 'ongoing', label: 'Pågående arbetsdag' };
  }
  if (wd && wd.ended_at) {
    if (isAutoRepairedWorkday(wd)) {
      return { kind: 'auto_repaired', label: 'Auto-skapad arbetsdag' };
    }
  }
  const hasPreWd = model.proposedReport.anomalies.some(a => a.id.startsWith('pre-wd:'));
  if (hasPreWd) return { kind: 'pre_workday', label: 'GPS före arbetsdag' };
  const hasPlannedGap = model.proposedReport.anomalies.some(a => a.id.startsWith('planned-gap:'));
  if (hasPlannedGap && !wd) {
    // Planerad men inga arbetsbevis → "Planerad – ej startad"
    const ind = computeStrongWorkIndicators(model);
    if (!ind.hasStrong) {
      return { kind: 'planned_only', label: 'Planerad – ej startad' };
    }
    return { kind: 'review', label: 'Kräver granskning – planerad tid saknar signal' };
  }
  if (wd && model.reportState.timeReports.length === 0 && model.reportState.locationEntries.length === 0) {
    return { kind: 'missing_report', label: 'Saknar rapport' };
  }
  if (model.proposedReport.anomalies.length > 0) return { kind: 'review', label: 'Kräver granskning' };
  if (!wd && (model.actualVisits.length > 0 || model.actualEvents.length > 0)) {
    const ind = computeStrongWorkIndicators(model);
    if (ind.hasStrong && ind.proposedStartIso) {
      return {
        kind: 'missing_strong_evidence',
        label: `Arbetsdag saknas – hög säkerhet · kan auto-skapa från ${ind.proposedStartIso.slice(11, 16)}`,
      };
    }
    return { kind: 'missing_report', label: 'Saknar arbetsdag' };
  }
  if (wd && wd.ended_at) return { kind: 'ended', label: 'Avslutad arbetsdag' };
  return { kind: 'ok', label: 'OK' };
}

const statusBadgeClass = (kind: HeaderStatus): string => {
  switch (kind) {
    case 'ok':
    case 'ended':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
    case 'ongoing':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
    case 'auto_repaired':
      return 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100';
    case 'signal_lost':
      return 'bg-destructive/15 text-destructive';
    case 'evidence_repair_proposed':
    case 'missing_strong_evidence':
      return 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100';
    case 'planned_only':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200';
    case 'review':
    case 'pre_workday':
    case 'missing_report':
    default:
      return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100';
  }
};

// ── B. Event icon/label ─────────────────────────────────────────────
const EventIcon: React.FC<{ kind: ActualEventKind; severity: ActualEventSeverity }> = ({ kind, severity }) => {
  const cls =
    severity === 'critical'
      ? 'text-destructive'
      : severity === 'warning'
        ? 'text-amber-600'
        : severity === 'success'
          ? 'text-emerald-600'
          : 'text-muted-foreground';
  if (kind === 'workday_started' || kind === 'workday_ended') return <Clock className={`h-3.5 w-3.5 ${cls}`} />;
  if (kind === 'gps_arrival' || kind === 'gps_departure' || kind === 'gps_visit') return <MapPin className={`h-3.5 w-3.5 ${cls}`} />;
  if (kind === 'gps_travel' || kind === 'travel_suggestion') return <Plane className={`h-3.5 w-3.5 ${cls}`} />;
  if (kind === 'stale_signal') return <WifiOff className={`h-3.5 w-3.5 ${cls}`} />;
  if (kind === 'planned_signal_gap') return <WifiOff className={`h-3.5 w-3.5 ${cls}`} />;
  if (kind === 'planned_start') return <Clock className={`h-3.5 w-3.5 ${cls}`} />;
  if (kind === 'anomaly') return <AlertTriangle className={`h-3.5 w-3.5 ${cls}`} />;
  return <Activity className={`h-3.5 w-3.5 ${cls}`} />;
};

const sourceTagFor = (ev: ActualEvent): string => {
  const kind = ev.kind;
  const lookupSource = (ev as any).lookup_source as string | undefined;
  switch (kind) {
    case 'workday_started':
    case 'workday_ended':
      return 'workday';
    case 'time_report_created':
    case 'time_report_closed':
      return 'time_report';
    case 'timer_started':
    case 'timer_stopped':
      return 'timer';
    case 'timer_end_estimated':
      return 'system_review';
    case 'gps_arrival':
    case 'gps_departure':
    case 'gps_visit':
      if (lookupSource === 'mapbox' || lookupSource === 'mapbox_poi' || lookupSource === 'mapbox_address') return 'GPS / adressuppslag';
      if (lookupSource === 'fallback' || lookupSource === 'pending_lookup') return 'GPS / okänd';
      return 'GPS';
    case 'gps_travel': {
      const m = (ev.meta ?? {}) as any;
      if (m.travelOrigin === 'travel_log_approved' || m.approved === true) return 'restid';
      return 'GPS-rörelse';
    }
    case 'travel_suggestion':
      return 'travel_log';
    case 'assistant_arrival':
    case 'assistant_departure':
    case 'assistant_other':
      return 'assistant';
    case 'stale_signal':
    case 'gps_gap':
      return 'GPS';
    case 'anomaly':
      return 'flag';
    case 'planned_start':
    case 'planned_signal_gap':
      return 'planering';
    default:
      return '—';
  }
};

type SimpleStatus = 'Bekräftad' | 'Föreslagen' | 'Osäker' | 'Kräver granskning' | 'Signal tappad' | 'Saknar stopp';

const statusTagFor = (ev: ActualEvent): SimpleStatus => {
  const { kind, severity } = ev;
  const lookupSource = (ev as any).lookup_source as string | undefined;

  // Action-statusar — kräver åtgärd, visas tydligt
  if (kind === 'stale_signal') return 'Signal tappad';
  if (kind === 'anomaly') return 'Kräver granskning';
  if (kind === 'planned_signal_gap') return 'Kräver granskning';

  // Förslag (ej beslutade)
  if (kind === 'travel_suggestion') return 'Föreslagen';
  if (kind === 'planned_start') return 'Föreslagen';

  // Förflyttning från GPS
  if (kind === 'gps_travel') {
    const m = (ev.meta ?? {}) as any;
    if (m.travelOrigin === 'travel_log_approved' || m.approved === true) return 'Bekräftad';
    if (m.bothKnown) return 'Föreslagen';
    return 'Osäker';
  }

  // Timer-stopp
  if (kind === 'timer_stopped') {
    const mm = (ev.meta ?? {}) as any;
    if (mm.stop_origin === 'system_review') return 'Saknar stopp';
    const cls = classifyStopSource({
      source: (mm.lteSource ?? mm.source) ?? null,
      metadata: (mm.lteMetadata ?? null) as Record<string, any> | null,
      exitedAt: mm.stoppedAt ?? ev.at ?? null,
      lteId: mm.lteId ?? '',
    });
    if (!isStopConfident(cls)) return 'Osäker';
    return 'Bekräftad';
  }

  // GPS-platser
  if (kind === 'gps_arrival' || kind === 'gps_departure' || kind === 'gps_visit') {
    if (lookupSource === 'fallback' || lookupSource === 'pending_lookup') return 'Osäker';
    return 'Bekräftad';
  }

  if (severity === 'critical' || severity === 'warning') return 'Kräver granskning';
  return 'Bekräftad';
};

const ACTION_STATUSES: SimpleStatus[] = ['Kräver granskning', 'Signal tappad', 'Saknar stopp'];
const isActionStatus = (s: SimpleStatus) => ACTION_STATUSES.includes(s);


// Kompaktläge = "Dagens faktiska händelser" (huvudjournalen).
// All visibility-klassning bor i src/lib/staff/timelineVisibility.ts:
//   • mainTimeline()       — endast meningsfulla arbetsblock
//   • rawTimeline()        — alla GPS-segment, pings, mikrostopp m.m.
//   • classifyTimeline()   — sätter visibility + reason_hidden per event
// INGENTING raderas; raw-vyn visar dolda events med en reason-badge.
import {
  mainTimeline as buildMainTimeline,
  rawTimeline as buildRawTimeline,
  buildHiddenReasonMap,
  hiddenReasonLabel,
  type TimelineHiddenReason,
} from '@/lib/staff/timelineVisibility';

type PlanningItemView = {
  id: string;
  label: string;
  plannedStart: string;
  plannedEnd: string | null;
  role?: string | null;
  team?: string | null;
  source?: string | null;
  address?: string | null;
};

/**
 * Kompakt "Planerad"-pill i headern. Visar första uppdragets tid eller
 * "N uppdrag" — popover ger full detalj utan att störa journalen.
 */
const PlanningHeaderPill: React.FC<{ items: PlanningItemView[] }> = ({ items }) => {
  if (!items.length) return null;
  const first = items[0];
  const compact = items.length === 1
    ? `${first.label} · ${extractUTCTime(first.plannedStart)}`
    : `${items.length} uppdrag`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-xs inline-flex items-center gap-1 rounded border border-dashed border-muted-foreground/40 px-2 py-0.5 text-muted-foreground hover:text-foreground hover:border-muted-foreground/70"
          title="Planerad förväntan — inte faktiska händelser"
        >
          <Clock className="h-3 w-3" />
          <span className="font-medium">Planerad:</span>
          <span className="truncate max-w-[14rem]">{compact}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
          Planerad förväntan ({items.length})
        </div>
        <ul className="space-y-2">
          {items.map(it => (
            <li key={it.id} className="text-xs border-b last:border-b-0 pb-2 last:pb-0">
              <div className="font-medium text-foreground">{it.label}</div>
              <div className="tabular-nums text-muted-foreground">
                {extractUTCTime(it.plannedStart)}
                {it.plannedEnd ? `–${extractUTCTime(it.plannedEnd)}` : ''}
              </div>
              {(it.role || it.team) && (
                <div className="text-muted-foreground">
                  {[it.role, it.team].filter(Boolean).join(' · ')}
                </div>
              )}
              {it.address && <div className="text-muted-foreground">{it.address}</div>}
              {it.source && (
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">Källa: {it.source}</div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Förväntan, ej faktiska händelser.
        </p>
      </PopoverContent>
    </Popover>
  );
};

/**
 * "Planering"-sektion. Renderar `model.planningItems` (förväntan från
 * assignments) — aldrig events. Default collapsed; använd headerns
 * Planerad-pill för snabb översikt.
 */
const PlanningSection: React.FC<{ items: PlanningItemView[] }> = ({ items }) => {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <section className="px-4 py-2 border-b bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <span className="inline-flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Planering ({items.length})
        </span>
        <span className="text-[10px] font-normal normal-case text-muted-foreground">
          Förväntan, ej faktiska händelser
        </span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1 pl-5">
          {items.map(it => (
            <li key={it.id} className="text-xs text-foreground tabular-nums flex gap-2">
              <span className="text-muted-foreground w-24">
                {extractUTCTime(it.plannedStart)}{it.plannedEnd ? `–${extractUTCTime(it.plannedEnd)}` : ''}
              </span>
              <span>Start · {it.label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

// ── Komponenten ─────────────────────────────────────────────────────
export const ActualDayPanel: React.FC<ActualDayPanelProps> = ({
  staffName,
  date,
  model,
  lastPingIso,
  onAdjustWorkday,
  onCreateDistributionFromGps,
  onApproveTravelSuggestion,
  onIgnoreEvent,
  onRecomputeDay,
  onShowRawGps,
  onResolvePlannedGap,
  reportSlot,
  extraActions,
  rawGpsSlot,
  onRepairWorkdayFromEvidence,
}) => {
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [rawGpsOpen, setRawGpsOpen] = useState(false);
  const [reprocessOpen, setReprocessOpen] = useState(false);
  const [expandedDebugKeys, setExpandedDebugKeys] = useState<Set<string>>(() => new Set());
  const [plannedGapBusy, setPlannedGapBusy] = useState<string | null>(null);
  const [customTimeByAnomaly, setCustomTimeByAnomaly] = useState<Record<string, string>>({});

  const handleApplyReprocess = (plan: ReprocessChoice[]) => {
    if (onRecomputeDay) {
      onRecomputeDay();
      return;
    }
    // Mutation-pathen finns ännu inte. Visa avsiktslistan så admin ser
    // att förslagen registrerats men att inget skrivits.
    const summary = plan
      .map(p => {
        switch (p.kind) {
          case 'accept_workday_start': return `start → ${p.iso.slice(11, 16)}`;
          case 'accept_workday_end': return `slut → ${p.iso.slice(11, 16)}`;
          case 'create_distribution_from_visit': return 'fördelning från GPS-besök';
          case 'approve_travel': return 'godkänn restid';
          case 'ignore_anomaly': return 'ignorera avvikelse';
          case 'keep_current': return 'behåll nuvarande';
        }
      })
      .join(', ');
    toast.message('Förhandsvisning — inget sparat', {
      description: `${plan.length} förslag: ${summary}. Ingen databasskrivning sker — mutation-pathen är inte byggd ännu.`,
    });
  };

  const status = deriveStatus(model);
  const wd = model.reportState.workday;
  const wdMin = wd
    ? Math.max(0, Math.round(((wd.ended_at ? new Date(wd.ended_at).getTime() : Date.now()) - new Date(wd.started_at).getTime()) / 60_000))
    : 0;
  const repairIndicators = useMemo(() => computeStrongWorkIndicators(model), [model]);
  const showRepairBanner = !wd && repairIndicators.hasStrong && !!repairIndicators.proposedStartIso;
  const [repairBusy, setRepairBusy] = useState(false);
  const handleRepair = async () => {
    if (!onRepairWorkdayFromEvidence || !repairIndicators.proposedStartIso) return;
    try {
      setRepairBusy(true);
      await onRepairWorkdayFromEvidence({
        proposedStartIso: repairIndicators.proposedStartIso,
        proposedEndIso: repairIndicators.proposedEndIso,
        reasonCodes: repairIndicators.reasonCodes,
      });
      toast.success('Arbetsdag skapad från arbetsbevis');
    } catch (e: any) {
      toast.error(`Kunde inte skapa arbetsdag: ${e?.message ?? e}`);
    } finally {
      setRepairBusy(false);
    }
  };

  const rawEvents = showAllEvents ? buildRawTimeline(model.actualEvents) : buildMainTimeline(model.actualEvents);
  const hiddenReasons = useMemo(() => buildHiddenReasonMap(model.actualEvents), [model.actualEvents]);

  // Samla unika okända kluster-coords (centre på gps_arrival/visit/departure/travel)
  // för reverse-geocode. Per-cluster, INTE per ping. useReverseGeocode cachear
  // dessutom på rundade lat/lng så samma plats inte slås upp om och om igen.
  const unknownCoords = useMemo(() => {
    const seen = new Map<string, { lat: number; lng: number }>();
    const add = (c: { lat: number; lng: number } | null | undefined) => {
      if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return;
      const key = `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;
      if (!seen.has(key)) seen.set(key, { lat: c.lat, lng: c.lng });
    };
    for (const ev of rawEvents) {
      const m = ev.meta as any;
      if (!m) continue;
      add(m.centre);
      add(m.fromCentre);
      add(m.toCentre);
    }
    return Array.from(seen.entries()).map(([key, c]) => ({ key, ...c }));
  }, [rawEvents]);

  const richGeo = useReverseGeocodeRichStatus(unknownCoords.map(c => ({ lat: c.lat, lng: c.lng })));
  const geoByKey = useMemo(() => {
    const m = new Map<string, RichGeocodeStatus>();
    unknownCoords.forEach((c, i) => {
      const s = richGeo[i];
      if (s) m.set(c.key, s);
    });
    return m;
  }, [unknownCoords, richGeo]);

  const lookupCoord = (
    c: { lat: number; lng: number } | null | undefined,
  ): { label: string; geo: RichGeocode | null; status: 'ok' | 'loading' | 'error' } | null => {
    if (!c) return null;
    const key = `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;
    const s = geoByKey.get(key);
    if (s?.data) return { label: s.data.label, geo: s.data, status: 'ok' };
    if (s?.isLoading) return { label: 'Slår upp adress…', geo: null, status: 'loading' };
    if (s?.isError) return { label: 'Okänd plats – adress kunde inte hämtas', geo: null, status: 'error' };
    // Initialt tillstånd innan query startat: behandla som loading.
    return { label: 'Slår upp adress…', geo: null, status: 'loading' };
  };

  // Indexera actualVisits per placeKey för knownSiteId + durationMin.
  const visitByKey = useMemo(() => {
    const m = new Map<string, (typeof model.actualVisits)[number]>();
    for (const v of model.actualVisits) m.set(v.key, v);
    return m;
  }, [model.actualVisits]);

  // Hjälper bedöma "mellan två arbetsplatser" — om föregående OCH nästa visit
  // i listan har knownSiteId, så är detta troligen en kort resepunkt.
  const knownNeighbours = useMemo(() => {
    const set = new Set<string>();
    const list = model.actualVisits;
    for (let i = 1; i < list.length - 1; i++) {
      if (!list[i].knownSiteId && list[i - 1].knownSiteId && list[i + 1].knownSiteId) {
        set.add(list[i].key);
      }
    }
    return set;
  }, [model.actualVisits]);

  // Bygg ResolvedPlace för en koordinat ur lookup + ev. matchad känd plats.
  const buildResolvedPlace = (
    coord: { lat: number; lng: number } | null | undefined,
    opts: {
      isMatched: boolean;
      knownLabel?: string | null;
    },
  ): ResolvedPlace | null => {
    if (!coord && !opts.isMatched) return null;
    const lookup = coord ? lookupCoord(coord) : null;
    const lat = coord?.lat ?? null;
    const lng = coord?.lng ?? null;
    const mapUrl = lookup?.geo?.mapsUrl
      ?? (lat != null && lng != null
        ? `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`
        : null);

    if (opts.isMatched) {
      return {
        label: opts.knownLabel ?? 'Känd plats',
        address: null,
        city: null,
        poiName: null,
        poiCategory: null,
        lat, lng, mapUrl,
        lookupStatus: 'matched_internal',
        confidence: 'high',
      };
    }
    if (!lookup) {
      return {
        label: 'Okänd plats – adress saknas',
        address: null, city: null, poiName: null, poiCategory: null,
        lat, lng, mapUrl,
        lookupStatus: 'failed',
        confidence: 'low',
      };
    }
    if (lookup.status === 'loading') {
      return {
        label: 'Slår upp adress…',
        address: null, city: null, poiName: null, poiCategory: null,
        lat, lng, mapUrl,
        lookupStatus: 'pending',
        confidence: 'low',
      };
    }
    if (lookup.status === 'error' || !lookup.geo) {
      return {
        label: 'Okänd plats – adress saknas',
        address: null, city: null, poiName: null, poiCategory: null,
        lat, lng, mapUrl,
        lookupStatus: 'failed',
        confidence: 'low',
      };
    }
    const g = lookup.geo;
    const status: PlaceLookupStatus = g.poiName ? 'poi_lookup' : 'reverse_geocoded';
    return {
      label: g.label,
      address: g.address,
      city: g.city,
      poiName: g.poiName,
      poiCategory: g.poiCategory,
      lat, lng, mapUrl,
      lookupStatus: status,
      confidence: 'medium',
    };
  };

  // Substituera "okänd plats" med uppslagen adress/POI och addera försiktig
  // tolkning (inferred_label / inferred_activity_type / confidence).
  const events: ActualEvent[] = useMemo(() => {
    return rawEvents.map(ev => {
      const m = ev.meta as any;
      if (ev.kind === 'gps_arrival' || ev.kind === 'gps_visit' || ev.kind === 'gps_departure') {
        const placeKey = m?.placeKey as string | undefined;
        const visit = placeKey ? visitByKey.get(placeKey) : undefined;
        const lookup = ev.place ? null : lookupCoord(m?.centre);
        const placeLabel = ev.place ?? lookup?.label ?? null;
        const ongoing = m?.ongoing === true;
        const lastSeenAt = (m?.visit_last_seen_at as string | undefined)
          ?? (m?.lastPingAt as string | undefined) ?? null;
        const departedAt = (m?.departed_at as string | undefined) ?? null;
        const lastSeenOnly = !ongoing && !departedAt && ev.kind === 'gps_visit';
        const fmtHM = (iso: string | null) => {
          if (!iso) return '';
          try {
            return new Date(iso).toLocaleTimeString('sv-SE', {
              hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm',
            });
          } catch { return iso.slice(11, 16); }
        };

        const inference = inferActivityFromPlace({
          knownSiteId: visit?.knownSiteId ?? null,
          poiCategory: lookup?.geo?.poiCategory ?? null,
          poiName: lookup?.geo?.poiName ?? null,
          durationMin: visit?.durationMin ?? ev.durationMin ?? 0,
          betweenWorkplaces: placeKey ? knownNeighbours.has(placeKey) : false,
        });

        // Tre tillstånd för gps_visit:
        //   1) ongoing                → "Vistelse: X · pågår"
        //   2) lastSeenOnly (timer aktiv men ingen departure-evidens)
        //                             → "Senast bekräftad på X HH:mm"
        //   3) departed (eller stängt) → "Vistelse: X · <inferens>"
        let label: string;
        if (ev.kind === 'gps_visit') {
          if (ongoing) {
            label = placeLabel ? `Vistelse: ${placeLabel} · pågår` : 'Vistelse pågår';
          } else if (lastSeenOnly) {
            label = placeLabel
              ? `Senast bekräftad på ${placeLabel} ${fmtHM(lastSeenAt)}`
              : `Senast bekräftad ${fmtHM(lastSeenAt)}`;
          } else {
            const base = placeLabel ? `Vistelse: ${placeLabel}` : ev.label;
            label = `${base} · ${inference.label}`;
          }
        } else if (ev.kind === 'gps_arrival') {
          label = placeLabel ? `Anlände: ${placeLabel}` : ev.label;
        } else {
          // gps_departure — emitteras endast med faktisk evidens från modellen.
          label = placeLabel ? `Lämnade: ${placeLabel}` : ev.label;
        }

        const isMatched = !!visit?.knownSiteId;
        const hasMapbox = !!lookup?.geo;
        const lookupSource = isMatched
          ? 'known_site'
          : hasMapbox
            ? (lookup!.geo!.poiName ? 'mapbox_poi' : 'mapbox_address')
            : 'fallback';
        const matchConfidence: 'low' | 'medium' | 'high' = isMatched
          ? 'high'
          : hasMapbox
            ? 'medium'
            : 'low';
        const internalMatchStatus = isMatched
          ? 'matched'
          : (visit?.nearestKnownSite
              ? 'unmatched_outside_radius'
              : (visit ? 'unmatched_no_nearest' : (ev.internal_match_status ?? 'unmatched_no_sites')));

        const coordCentre = (m?.centre as { lat: number; lng: number } | undefined) ?? null;
        const mapsUrl = !isMatched && coordCentre
          ? `https://www.google.com/maps/search/?api=1&query=${coordCentre.lat.toFixed(6)},${coordCentre.lng.toFixed(6)}`
          : null;

        const resolvedPlace = buildResolvedPlace(coordCentre ?? null, {
          isMatched,
          knownLabel: isMatched ? (visit?.label ?? placeLabel) : placeLabel,
        });

        return {
          ...ev,
          label,
          place: placeLabel,
          inferred_label: inference.label,
          inferred_activity_type: inference.type,
          confidence: inference.confidence,
          lookup_source: lookupSource,
          address: lookup?.geo?.address ?? null,
          poi_name: lookup?.geo?.poiName ?? null,
          poi_category: lookup?.geo?.poiCategory ?? null,
          resolved_address: lookup?.geo?.address ?? null,
          resolved_poi: isMatched ? (visit?.label ?? placeLabel) : (lookup?.geo?.poiName ?? null),
          match_confidence: matchConfidence,
          internal_match_status: internalMatchStatus as any,
          maps_url: mapsUrl,
          coords: coordCentre,
          resolvedPlace,
        } as any;
      }
      if (ev.kind === 'gps_travel' && ev.label.includes('Förflyttning')) {
        const fromKnown = !m?.fromCentre;
        const toKnown = !m?.toCentre;
        const fromLbl = fromKnown
          ? ev.label.replace(/^Förflyttning:\s*/, '').split(' → ')[0]
          : (lookupCoord(m?.fromCentre)?.label ?? 'okänd plats');
        const toLbl = toKnown
          ? (ev.label.split(' → ')[1] ?? '')
          : (lookupCoord(m?.toCentre)?.label ?? 'okänd plats');
        const fromMaps = !fromKnown && m?.fromCentre
          ? `https://www.google.com/maps/search/?api=1&query=${m.fromCentre.lat.toFixed(6)},${m.fromCentre.lng.toFixed(6)}`
          : null;
        const toMaps = !toKnown && m?.toCentre
          ? `https://www.google.com/maps/search/?api=1&query=${m.toCentre.lat.toFixed(6)},${m.toCentre.lng.toFixed(6)}`
          : null;

        const fromPlace: JourneyPlace = {
          label: (m?.from_label as string | undefined) ?? fromLbl ?? '—',
          mapUrl: fromMaps,
          lat: m?.fromCentre?.lat ?? null,
          lng: m?.fromCentre?.lng ?? null,
        };
        const toPlace: JourneyPlace = {
          label: (m?.to_label as string | undefined) ?? toLbl ?? '—',
          mapUrl: toMaps,
          lat: m?.toCentre?.lat ?? null,
          lng: m?.toCentre?.lng ?? null,
        };

        return {
          ...ev,
          label: `Förflyttning: ${fromLbl} → ${toLbl}`,
          from_maps_url: fromMaps,
          to_maps_url: toMaps,
          fromPlace,
          toPlace,
        } as any;
      }
      return ev;
    });
  }, [rawEvents, geoByKey, visitByKey, knownNeighbours]);

  // Bakgrunds-GPS: GPS-händelser utan arbetskoppling (ingen workday/timer/
  // rapport/känd plats/assistant). Dessa visas inte i huvudjournalen utan
  // i en separat collapsed sektion.
  const GPS_KINDS = new Set<ActualEventKind>(['gps_arrival', 'gps_visit', 'gps_departure', 'gps_travel']);
  type WorkRel = 'work_confirmed' | 'work_possible' | 'unknown_requires_lookup' | 'private_or_background' | 'raw_debug_only';
  const getWorkRelevance = (ev: ActualEvent): WorkRel | null => {
    if (!GPS_KINDS.has(ev.kind)) return null;
    const m = (ev.meta ?? {}) as any;
    if (typeof m.workRelevance === 'string') return m.workRelevance as WorkRel;
    // Bakåtkompat: gammal flagga workRelevant.
    if (m.workRelevant === false) return 'private_or_background';
    if (m.workRelevant === true) return 'work_confirmed';
    return 'unknown_requires_lookup';
  };
  const isMainJournalEvent = (ev: ActualEvent): boolean => {
    const r = getWorkRelevance(ev);
    if (r == null) return true;
    return r === 'work_confirmed' || r === 'work_possible';
  };
  const [mainEvents, backgroundEvents] = useMemo(() => {
    const main: ActualEvent[] = [];
    const bg: ActualEvent[] = [];
    for (const ev of events) {
      // Säkerhetsbälte: ev. legacy planned_start hör inte hemma i journalen.
      if (ev.kind === 'planned_start') continue;
      (isMainJournalEvent(ev) ? main : bg).push(ev);
    }
    return [main, bg] as const;
  }, [events]);
  // Planering kommer från model.planningItems — ren förväntan, inga events.
  const planningItems = useMemo(
    () => [...(model.planningItems ?? [])].sort((a, b) => a.plannedStart.localeCompare(b.plannedStart)),
    [model.planningItems],
  );
  const [showBackground, setShowBackground] = useState(false);

  // Föreslagna restider för "Godkänn"-knappar
  const travelSuggestions = model.reportState.travelLogs.filter(
    t => !t.approved && (t.autoDetected || t.source === 'gap_derived'),
  );

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* A. Header */}
      <div className="px-4 py-3 border-b bg-muted/30 flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="font-semibold text-sm">{staffName}</div>
        <div className="text-xs text-muted-foreground tabular-nums">{date}</div>
        <div className="text-xs">
          <span className="text-muted-foreground">Arbetsdag </span>
          {wd ? (
            <span className="tabular-nums font-medium text-foreground">
              {fmtHm(wd.started_at)} → {wd.ended_at ? fmtHm(wd.ended_at) : 'pågår'}
            </span>
          ) : status.kind === 'missing_strong_evidence' ? (
            <span className="text-blue-700 dark:text-blue-300">saknas (hög säkerhet)</span>
          ) : status.kind === 'planned_only' ? (
            <span className="text-slate-600 dark:text-slate-300">ej startad</span>
          ) : (
            <span className="text-amber-600">saknas</span>
          )}
        </div>
        <div className="text-xs">
          <span className="text-muted-foreground">Lönegrundande </span>
          <span className="tabular-nums font-medium text-foreground">{fmtMin(wdMin)}</span>
        </div>
        {(() => {
          if (!isAutoRepairedWorkday(wd)) return null;
          const wmeta = (wd as any)?.metadata as any;
          const src = wmeta?.auto_start_source as string | undefined;
          const isTimerRepair = src === 'auto_repair_from_timer';
          const isBackfill = src === 'server_background_gps_backfill' || wmeta?.backfilled === true;
          return (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge className="bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100 font-medium">
                {isTimerRepair ? 'Auto-skapad från timer' : 'Auto-skapad från GPS'}
                {wmeta?.confidence ? ` · ${wmeta.confidence}` : ''}
              </Badge>
              {isBackfill && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-400 text-amber-700 dark:text-amber-300">
                  Backfill
                </Badge>
              )}
            </div>
          );
        })()}
        <div className="ml-auto">
          <Badge className={`${statusBadgeClass(status.kind)} font-medium`}>{status.label}</Badge>
        </div>
      </div>

      {showRepairBanner && (
        <div className="px-4 py-3 border-b bg-blue-50/60 dark:bg-blue-950/20 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Sparkles className="h-4 w-4 text-blue-700 dark:text-blue-300 shrink-0" />
          <div className="text-xs flex-1 min-w-[16rem]">
            <div className="font-medium text-blue-900 dark:text-blue-100">
              Arbetsdag saknas – hög säkerhet · kan auto-skapa från {fmtHm(repairIndicators.proposedStartIso!)}
            </div>
            <div className="text-blue-900/80 dark:text-blue-100/80">
              Föreslagen start <span className="tabular-nums font-medium">{fmtHm(repairIndicators.proposedStartIso!)}</span>
              {repairIndicators.proposedEndIso && (
                <> · slut <span className="tabular-nums font-medium">{fmtHm(repairIndicators.proposedEndIso)}</span></>
              )}
              {' · '}{repairIndicators.reasonCodes.join(', ')}
            </div>
          </div>
          {onRepairWorkdayFromEvidence ? (
            <Button size="sm" disabled={repairBusy} onClick={handleRepair}>
              {repairBusy ? 'Skapar…' : 'Skapa arbetsdag'}
            </Button>
          ) : (
            <Badge variant="outline" className="text-[10px]">Reparation föreslagen</Badge>
          )}
        </div>
      )}

      {/* A2. Planering — collapsed sektion ovanför huvudjournalen.
          Visar enbart förväntan; aldrig blandat med faktiska händelser. */}
      {planningItems.length > 0 && (
        <PlanningSection items={planningItems} />
      )}

      {/* B. Faktiska händelser — alltid synlig */}
      <section className="px-4 py-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dagens faktiska händelser
          </h4>
          <button
            type="button"
            onClick={() => setShowAllEvents(v => !v)}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            {showAllEvents ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {showAllEvents ? 'Visa kompakt' : 'Visa alla händelser'}
          </button>
        </div>
        {mainEvents.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-2">
            Inga händelser registrerade för dagen.
          </div>
        ) : (
          <ol className="space-y-1">
            {mainEvents.map(ev => {
              const m = (ev.meta ?? {}) as any;
              const placeKey = m.placeKey as string | undefined;
              const visit = placeKey ? visitByKey.get(placeKey) : undefined;
              const isUnknownCluster =
                (ev.kind === 'gps_visit' || ev.kind === 'gps_arrival' || ev.kind === 'gps_departure') &&
                !!visit && !visit.knownSiteId;
              const isExpanded = expandedDebugKeys.has(ev.id) && !!visit;
              const lookupKey = visit?.centre
                ? `${visit.centre.lat.toFixed(3)},${visit.centre.lng.toFixed(3)}`
                : null;
              const geo = lookupKey ? (geoByKey.get(lookupKey)?.data ?? null) : null;
              const toggleRow = () =>
                setExpandedDebugKeys(prev => {
                  const next = new Set(prev);
                  if (next.has(ev.id)) next.delete(ev.id);
                  else next.add(ev.id);
                  return next;
                });
              const isRowOpen = expandedDebugKeys.has(ev.id);
              const statusLabel = statusTagFor(ev);
              const statusIsAction = isActionStatus(statusLabel);
              const statusTone =
                statusLabel === 'Signal tappad' || statusLabel === 'Saknar stopp'
                  ? 'bg-destructive/15 text-destructive border-destructive/30'
                  : statusLabel === 'Kräver granskning'
                    ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-100'
                    : statusLabel === 'Föreslagen'
                      ? 'text-blue-600 dark:text-blue-400'
                      : statusLabel === 'Osäker'
                        ? 'text-amber-600'
                        : 'text-muted-foreground';

              // Journey-rad: tydlig tvådelad "Från / Till"-uppställning.
              // Prio: ev.fromPlace/toPlace (strukturerat) > journey_block-meta > parsed label.
              const evAny = ev as any;
              const fromPlaceObj: JourneyPlace | null = evAny.fromPlace ?? null;
              const toPlaceObj: JourneyPlace | null = evAny.toPlace ?? null;
              const jbMeta = (ev.meta as any)?.journey_block === true ? (ev.meta as any) : null;
              const isJourneyRow =
                !!fromPlaceObj || !!toPlaceObj
                || !!jbMeta
                || (ev.kind === 'gps_travel' && typeof ev.label === 'string' && ev.label.includes('→'));
              let journeyFrom: string | null = fromPlaceObj?.label ?? null;
              let journeyTo: string | null = toPlaceObj?.label ?? null;
              if (isJourneyRow) {
                if (!journeyFrom && jbMeta) journeyFrom = (jbMeta.from_label as string | null) ?? null;
                if (!journeyTo && jbMeta) journeyTo = (jbMeta.to_label as string | null) ?? null;
                if ((!journeyFrom || !journeyTo) && typeof ev.label === 'string' && ev.label.includes('→')) {
                  const stripped = ev.label.replace(/^Förflyttning:\s*/, '');
                  const [a, b] = stripped.split(' → ');
                  journeyFrom = journeyFrom ?? (a ? a.trim() : null);
                  journeyTo = journeyTo ?? (b ? b.trim() : null);
                }
              }

              // Default-label för icke-journey-rader — föredra resolvedPlace.label.
              const resolvedPlace: ResolvedPlace | null = evAny.resolvedPlace ?? null;
              const displayLabel: React.ReactNode =
                resolvedPlace && (ev.kind === 'gps_arrival' || ev.kind === 'gps_visit' || ev.kind === 'gps_departure')
                  ? ev.label // ev.label är redan byggd från resolvedPlace.label i events-mappen
                  : ev.label;

              // Klickbar kartlänk för externa/okända platser.
              const ownMapsUrl: string | null =
                resolvedPlace?.mapUrl ?? evAny.maps_url ?? null;
              const fromMapsUrl: string | null =
                fromPlaceObj?.mapUrl ?? evAny.from_maps_url ?? jbMeta?.from_maps_url ?? null;
              const toMapsUrl: string | null =
                toPlaceObj?.mapUrl ?? evAny.to_maps_url ?? jbMeta?.to_maps_url ?? null;
              const ownCoords =
                (resolvedPlace && resolvedPlace.lat != null && resolvedPlace.lng != null
                  ? { lat: resolvedPlace.lat, lng: resolvedPlace.lng }
                  : (evAny.coords as { lat: number; lng: number } | null) ?? null);
              const coordsTooltip = ownCoords ? `${ownCoords.lat.toFixed(5)}, ${ownCoords.lng.toFixed(5)}` : undefined;

              const MapsLink = ({ url, label, title }: { url: string; label: React.ReactNode; title?: string }) => (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  title={title ?? 'Öppna i Google Maps'}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-0.5 text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid hover:text-blue-600 dark:hover:text-blue-400"
                >
                  <span className="truncate">{label}</span>
                  <ArrowUpRight className="h-3 w-3 shrink-0 opacity-70" />
                </a>
              );

              return (
                <React.Fragment key={ev.id}>
                  <li
                    className="grid grid-cols-[auto_auto_1fr_auto_auto] items-start gap-x-2 text-xs py-0.5 cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1"
                    onClick={toggleRow}
                  >
                    <span className="tabular-nums text-muted-foreground w-12 pt-0.5">
                      {fmtHm(ev.at)}
                      {ev.until ? `–${fmtHm(ev.until)}` : ''}
                    </span>
                    <span className="pt-0.5"><EventIcon kind={ev.kind} severity={ev.severity} /></span>
                    {isJourneyRow ? (
                      <div className="min-w-0 leading-tight">
                        <div className="font-medium text-foreground">Förflyttning</div>
                        <div className="text-[11px] truncate">
                          <span className="text-muted-foreground">Från: </span>
                          {fromMapsUrl
                            ? <MapsLink url={fromMapsUrl} label={journeyFrom ?? '—'} />
                            : <span className="text-foreground">{journeyFrom ?? '—'}</span>}
                        </div>
                        <div className="text-[11px] truncate">
                          <span className="text-muted-foreground">Till: </span>
                          {toMapsUrl
                            ? <MapsLink url={toMapsUrl} label={journeyTo ?? '—'} />
                            : <span className="text-foreground">{journeyTo ?? '—'}</span>}
                        </div>
                      </div>
                    ) : ownMapsUrl ? (
                      <span className="truncate pt-0.5" title={coordsTooltip}>
                        <MapsLink url={ownMapsUrl} label={displayLabel} title={coordsTooltip ?? 'Öppna i Google Maps'} />
                      </span>
                    ) : (
                      <span className="text-foreground truncate pt-0.5" title={coordsTooltip}>{displayLabel}</span>
                    )}
                    {statusIsAction ? (
                      <Badge variant="outline" className={`text-[10px] py-0 px-1.5 mt-0.5 ${statusTone}`}>
                        {statusLabel}
                      </Badge>
                    ) : (
                      <span className={`text-[10px] uppercase tracking-wide pt-0.5 ${statusTone}`}>
                        {statusLabel}
                      </span>
                    )}
                    {isRowOpen ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground mt-1" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground mt-1" />
                    )}
                  </li>
                  {isRowOpen && (
                    <li className="col-span-5 ml-14 mr-2 mb-1 rounded border border-dashed bg-muted/20 px-2 py-2 text-[11px] leading-relaxed text-muted-foreground space-y-1.5">
                      {/* Källa + dold-orsak + detail */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-wide">Källa:</span>
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                          {sourceTagFor(ev)}
                        </Badge>
                        {hiddenReasons.has(ev.id) && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-muted-foreground/40">
                            {hiddenReasonLabel(hiddenReasons.get(ev.id) as TimelineHiddenReason)}
                          </Badge>
                        )}
                        {ev.detail && <span className="text-[10px]">· {ev.detail}</span>}
                      </div>

                      {/* Källor (bevis) — sammanställning av alla källor som bidragit till händelsen */}
                      {(() => {
                        const mm = (ev.meta ?? {}) as any;
                        const lteMeta: any = mm.lteMetadata ?? {};
                        const stopMeta: any =
                          (lteMeta.stop_metadata && typeof lteMeta.stop_metadata === 'object')
                            ? lteMeta.stop_metadata
                            : lteMeta;
                        const sw: any = stopMeta?.switch ?? lteMeta?.switch ?? null;

                        type SourceLine = { source: string; tone?: string; lines: Array<[string, React.ReactNode]> };
                        const sources: SourceLine[] = [];

                        // GPS-källan: arrival/visit/departure/travel + ping-data
                        if (ev.kind === 'gps_arrival' || ev.kind === 'gps_visit' || ev.kind === 'gps_departure') {
                          const lines: Array<[string, React.ReactNode]> = [];
                          if (ev.kind === 'gps_arrival') lines.push(['Anlände', `${ev.place ?? '—'} kl ${fmtHm(ev.at)}`]);
                          if (ev.kind === 'gps_departure') lines.push(['Lämnade', `${ev.place ?? '—'} kl ${fmtHm(ev.at)}`]);
                          if (ev.kind === 'gps_visit') {
                            lines.push(['Vistelse', `${ev.place ?? '—'}${ev.until ? ` (${fmtHm(ev.at)}–${fmtHm(ev.until)})` : ` från ${fmtHm(ev.at)}`}`]);
                          }
                          if (visit?.pingCount != null) lines.push(['Pings', `${visit.pingCount}`]);
                          if (visit?.avgAccuracy != null) lines.push(['Accuracy', `±${visit.avgAccuracy} m`]);
                          if (visit?.nearestKnownSite) {
                            lines.push(['Närmaste plats', `${visit.nearestKnownSite.name} · ${visit.nearestKnownSite.distanceMeters} m (radie ${visit.nearestKnownSite.radiusMeters} m)`]);
                          }
                          sources.push({ source: 'GPS', lines });
                        } else if (ev.kind === 'gps_travel') {
                          const lines: Array<[string, React.ReactNode]> = [];
                          // Journey-block: visa Lämnade / Travel / Anlände som bevis
                          const jb = mm.journey_block === true ? mm : null;
                          const fp: JourneyPlace | null = (ev as any).fromPlace ?? null;
                          const tp: JourneyPlace | null = (ev as any).toPlace ?? null;

                          if (jb) {
                            if (jb.departure_at) lines.push(['Lämnade', `${jb.from_label ?? fp?.label ?? '—'} kl ${fmtHm(jb.departure_at)}`]);
                            lines.push(['Förflyttning', `${fmtHm(ev.at)}${ev.until ? `–${fmtHm(ev.until)}` : ''}`]);
                            if (jb.arrival_at) lines.push(['Anlände', `${jb.to_label ?? tp?.label ?? '—'} kl ${fmtHm(jb.arrival_at)}`]);
                          } else {
                            lines.push(['Förflyttning', `${fmtHm(ev.at)}${ev.until ? `–${fmtHm(ev.until)}` : ''}`]);
                          }

                          // Från-endpoint
                          if (fp) {
                            const fromBits: React.ReactNode[] = [<span key="lbl">{fp.label}</span>];
                            if (fp.lat != null && fp.lng != null) {
                              fromBits.push(
                                <span key="coord" className="text-muted-foreground">
                                  {' '}· {fp.lat.toFixed(5)}, {fp.lng.toFixed(5)}
                                </span>,
                              );
                            }
                            if (fp.mapUrl) {
                              fromBits.push(
                                <span key="map">
                                  {' '}·{' '}
                                  <a href={fp.mapUrl} target="_blank" rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-0.5 underline decoration-dotted underline-offset-2 hover:text-blue-600">
                                    Öppna karta <ArrowUpRight className="h-2.5 w-2.5" />
                                  </a>
                                </span>,
                              );
                            }
                            lines.push(['Från (endpoint)', <>{fromBits}</>]);
                          }
                          // Till-endpoint
                          if (tp) {
                            const toBits: React.ReactNode[] = [<span key="lbl">{tp.label}</span>];
                            if (tp.lat != null && tp.lng != null) {
                              toBits.push(
                                <span key="coord" className="text-muted-foreground">
                                  {' '}· {tp.lat.toFixed(5)}, {tp.lng.toFixed(5)}
                                </span>,
                              );
                            }
                            if (tp.mapUrl) {
                              toBits.push(
                                <span key="map">
                                  {' '}·{' '}
                                  <a href={tp.mapUrl} target="_blank" rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-0.5 underline decoration-dotted underline-offset-2 hover:text-blue-600">
                                    Öppna karta <ArrowUpRight className="h-2.5 w-2.5" />
                                  </a>
                                </span>,
                              );
                            }
                            lines.push(['Till (endpoint)', <>{toBits}</>]);
                          }

                          // Lookup-källor + accuracy + ping count för respektive endpoint
                          const fromKey = mm.fromPlaceKey as string | undefined;
                          const toKey = mm.toPlaceKey as string | undefined;
                          const fromVisit = fromKey ? visitByKey.get(fromKey) : undefined;
                          const toVisit = toKey ? visitByKey.get(toKey) : undefined;
                          if (fromVisit?.pingCount != null || fromVisit?.avgAccuracy != null) {
                            const parts: string[] = [];
                            if (fromVisit?.pingCount != null) parts.push(`${fromVisit.pingCount} pings`);
                            if (fromVisit?.avgAccuracy != null) parts.push(`±${fromVisit.avgAccuracy} m`);
                            lines.push(['Från-bevis', parts.join(' · ')]);
                          }
                          if (fromVisit?.nearestKnownSite) {
                            lines.push(['Från: närmaste interna', `${fromVisit.nearestKnownSite.name} · ${fromVisit.nearestKnownSite.distanceMeters} m (radie ${fromVisit.nearestKnownSite.radiusMeters} m)`]);
                          }
                          if (toVisit?.pingCount != null || toVisit?.avgAccuracy != null) {
                            const parts: string[] = [];
                            if (toVisit?.pingCount != null) parts.push(`${toVisit.pingCount} pings`);
                            if (toVisit?.avgAccuracy != null) parts.push(`±${toVisit.avgAccuracy} m`);
                            lines.push(['Till-bevis', parts.join(' · ')]);
                          }
                          if (toVisit?.nearestKnownSite) {
                            lines.push(['Till: närmaste interna', `${toVisit.nearestKnownSite.name} · ${toVisit.nearestKnownSite.distanceMeters} m (radie ${toVisit.nearestKnownSite.radiusMeters} m)`]);
                          }

                          // Lookup source-badges
                          const fromInternal = mm.fromKnownSiteId != null;
                          const toInternal = mm.toKnownSiteId != null;
                          lines.push(['Lookup', `Från: ${fromInternal ? 'intern plats' : 'reverse geocode'} · Till: ${toInternal ? 'intern plats' : 'reverse geocode'}`]);

                          if (mm.distance_m != null) lines.push(['Distans', `${mm.distance_m} m`]);
                          if (mm.confidence != null) lines.push(['Confidence', String(mm.confidence)]);
                          sources.push({ source: 'GPS-rörelse', lines });
                        }

                        // Servermotor / backfill (auto-start eller auto-switch)
                        const cls: string | undefined = mm.sourceClass;
                        const isServerEngine =
                          mm.autoStarted ||
                          cls === 'server_background' ||
                          cls === 'backfill' ||
                          mm.autoStartSource === 'server_background_gps' ||
                          mm.autoStartSource === 'server_background_gps_backfill' ||
                          stopMeta?.engine_version != null ||
                          stopMeta?.run_id != null;
                        if (isServerEngine) {
                          const lines: Array<[string, React.ReactNode]> = [];
                          if (stopMeta?.run_id ?? mm.run_id) lines.push(['run_id', String(stopMeta?.run_id ?? mm.run_id)]);
                          if (stopMeta?.engine_version) lines.push(['engine', String(stopMeta.engine_version)]);
                          if (mm.confidence ?? sw?.confidence) lines.push(['confidence', String(mm.confidence ?? sw?.confidence)]);
                          if (mm.pingCount != null) lines.push(['pings', `${mm.pingCount}`]);
                          if (mm.avgAccuracyM != null) lines.push(['accuracy', `±${Math.round(mm.avgAccuracyM)} m`]);
                          if (cls === 'backfill' || mm.isBackfill) lines.push(['variant', 'backfill']);
                          if (lines.length) sources.push({ source: 'Servermotor', lines });
                        }

                        // Timer (start/stopp)
                        if (ev.kind === 'timer_started' || ev.kind === 'timer_stopped' || ev.kind === 'timer_end_estimated') {
                          const lines: Array<[string, React.ReactNode]> = [];
                          lines.push([ev.kind === 'timer_started' ? 'Startad' : 'Stoppad', fmtHm(ev.at)]);
                          if (mm.lteId) lines.push(['lte_id', String(mm.lteId)]);
                          if (cls) lines.push(['source_class', cls]);
                          if (sw?.next_target) lines.push(['next_target', sw.next_target?.label ?? '—']);
                          if (stopMeta?.stop_reason) lines.push(['stop_reason', String(stopMeta.stop_reason)]);
                          sources.push({ source: 'Timer', lines });
                        }

                        // Time report
                        if (ev.kind === 'time_report_created' || ev.kind === 'time_report_closed' || stopMeta?.time_report_id) {
                          const lines: Array<[string, React.ReactNode]> = [];
                          if (stopMeta?.time_report_id ?? mm.time_report_id) lines.push(['time_report_id', String(stopMeta?.time_report_id ?? mm.time_report_id)]);
                          if (stopMeta?.report_start) lines.push(['start', String(stopMeta.report_start)]);
                          if (stopMeta?.report_end) lines.push(['slut', String(stopMeta.report_end)]);
                          if (stopMeta?.save_then_stop || stopMeta?.closed_via === 'save_then_stop') lines.push(['flöde', 'save → stop']);
                          if (lines.length) sources.push({ source: 'Time report', lines });
                        }

                        // Assistant (assistant_arrival/departure/other)
                        if (ev.kind === 'assistant_arrival' || ev.kind === 'assistant_departure' || ev.kind === 'assistant_other') {
                          const lines: Array<[string, React.ReactNode]> = [];
                          lines.push([ev.kind === 'assistant_arrival' ? 'Ankomst' : ev.kind === 'assistant_departure' ? 'Avgång' : 'Händelse', fmtHm(ev.at)]);
                          if ((ev as any).id) lines.push(['event_id', String(ev.id)]);
                          if (mm.confidence) lines.push(['confidence', String(mm.confidence)]);
                          sources.push({ source: 'Assistant', lines });
                        }

                        // Admin / manuell
                        const k = (() => {
                          if (ev.kind !== 'timer_stopped') return null;
                          return classifyStopSource({
                            source: (mm.lteSource ?? mm.source) ?? null,
                            metadata: lteMeta as Record<string, any> | null,
                            exitedAt: mm.stoppedAt ?? ev.at ?? null,
                            lteId: mm.lteId ?? '',
                          }).key;
                        })();
                        if (k === 'user_manual' || k === 'admin') {
                          const lines: Array<[string, React.ReactNode]> = [];
                          if (stopMeta?.actor ?? mm.stoppedBy) lines.push(['actor', String(stopMeta?.actor ?? mm.stoppedBy)]);
                          if (stopMeta?.app_platform) lines.push(['platform', String(stopMeta.app_platform)]);
                          if (stopMeta?.app_version) lines.push(['version', String(stopMeta.app_version)]);
                          if (stopMeta?.closed_via) lines.push(['closed_via', String(stopMeta.closed_via)]);
                          sources.push({ source: k === 'admin' ? 'Admin' : 'Manuell (användare)', lines });
                        }

                        if (sources.length === 0) return null;
                        return (
                          <div className="rounded border border-dashed bg-background/40 px-2 py-1.5">
                            <div className="text-[10px] uppercase tracking-wide mb-1">Källor (bevis)</div>
                            <ul className="space-y-1">
                              {sources.map((s, i) => (
                                <li key={`${s.source}-${i}`} className="text-[11px]">
                                  <span className="font-medium text-foreground">{s.source}</span>
                                  {s.lines.length > 0 && (
                                    <span className="text-muted-foreground">
                                      {' · '}
                                      {s.lines.map(([k, v], j) => (
                                        <span key={`${k}-${j}`}>
                                          {j > 0 && ' · '}
                                          <span className="opacity-70">{k}:</span>{' '}
                                          <span className="text-foreground">{v}</span>
                                        </span>
                                      ))}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}

                      {/* Auto-start från GPS */}
                      {(() => {
                        const mm = (ev.meta ?? {}) as any;
                        const cls: string | undefined = mm.sourceClass;
                        if (!mm.autoStarted && cls !== 'foreground_geofence' && cls !== 'server_background' && cls !== 'backfill') return null;
                        const isServer = cls === 'server_background' || cls === 'backfill'
                          || mm.autoStartSource === 'server_background_gps'
                          || mm.autoStartSource === 'server_background_gps_backfill';
                        const isBackfill = cls === 'backfill' || mm.isBackfill === true
                          || mm.autoStartSource === 'server_background_gps_backfill';
                        return (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge className="bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100 text-[10px] py-0 px-1.5">
                              Auto-startad från GPS{mm.confidence ? ` · ${mm.confidence}` : ''}
                            </Badge>
                            {isServer && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5">Servermotor</Badge>
                            )}
                            {isBackfill && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-400 text-amber-700 dark:text-amber-300">
                                Backfill
                              </Badge>
                            )}
                            {(mm.pingCount != null || mm.avgAccuracyM != null) && (
                              <span className="text-[10px] tabular-nums">
                                {mm.pingCount != null ? `${mm.pingCount} pings` : ''}
                                {mm.pingCount != null && mm.avgAccuracyM != null ? ' · ' : ''}
                                {mm.avgAccuracyM != null ? `±${Math.round(mm.avgAccuracyM)}m` : ''}
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      {/* Stop-källa för timer_stopped */}
                      {ev.kind === 'timer_stopped' && (() => {
                        const mm = (ev.meta ?? {}) as any;
                        if (mm.stop_origin === 'system_review') return null;
                        const cls = classifyStopSource({
                          source: (mm.lteSource ?? mm.source) ?? null,
                          metadata: (mm.lteMetadata ?? null) as Record<string, any> | null,
                          exitedAt: mm.stoppedAt ?? ev.at ?? null,
                          lteId: mm.lteId ?? '',
                        });
                        const suffix = inlineStopSuffix(cls, mm.lteMetadata ?? null);
                        return (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge className={`${STOP_SOURCE_BADGE_CLASSES[cls.tone]} text-[10px] py-0 px-1.5`}>
                              Stoppad: {cls.shortLabel}
                            </Badge>
                            {cls.key === 'unknown' && (
                              <span className="text-[10px] text-amber-600 uppercase tracking-wide">okänd källa</span>
                            )}
                            {suffix && <span className="text-[10px]">{suffix}</span>}
                          </div>
                        );
                      })()}
                    </li>
                  )}
                  {isExpanded && visit && (
                    <li className="col-span-5 ml-14 mr-2 mb-1 rounded border border-dashed bg-muted/20 px-2 py-1.5 text-[10px] font-mono leading-relaxed text-muted-foreground">
                      <div className="grid grid-cols-[auto_1fr] gap-x-2">
                        <span>center_lat:</span><span className="text-foreground">{visit.centre?.lat.toFixed(6) ?? '—'}</span>
                        <span>center_lng:</span><span className="text-foreground">{visit.centre?.lng.toFixed(6) ?? '—'}</span>
                        <span>ping_count:</span><span className="text-foreground">{visit.pingCount}</span>
                        <span>avg_accuracy:</span><span className="text-foreground">{visit.avgAccuracy != null ? `${visit.avgAccuracy} m` : '—'}</span>
                        <span>resolved_address:</span><span className="text-foreground">{geo?.address ?? geo?.label ?? '—'}</span>
                        <span>poi_name:</span><span className="text-foreground">{geo?.poiName ?? '—'}</span>
                        <span>poi_category:</span><span className="text-foreground">{geo?.poiCategory ?? '—'}</span>
                        <span>karta:</span>
                        <span className="text-foreground">
                          {visit.centre ? (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${visit.centre.lat.toFixed(6)},${visit.centre.lng.toFixed(6)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 dark:text-blue-400 underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Öppna i Google Maps
                            </a>
                          ) : '—'}
                        </span>
                        <span>nearest_location:</span>
                        <span className="text-foreground">
                          {visit.nearestKnownSite ? `${visit.nearestKnownSite.name} (${visit.nearestKnownSite.id})` : '—'}
                        </span>
                        <span>distance_to_nearest:</span>
                        <span className="text-foreground">
                          {visit.nearestKnownSite ? `${visit.nearestKnownSite.distanceMeters} m` : '—'}
                        </span>
                        <span>nearest_site_radius:</span>
                        <span className="text-foreground">
                          {visit.nearestKnownSite ? `${visit.nearestKnownSite.radiusMeters} m` : '—'}
                        </span>
                        <span>outside_by:</span>
                        <span className="text-foreground">
                          {visit.nearestKnownSite ? `${visit.nearestKnownSite.outsideByMeters} m` : '—'}
                        </span>
                        <span>unmatch_reason:</span>
                        <span className="text-foreground">{visit.unmatchReason ?? '—'}</span>
                        {(() => {
                          // Derive "why no auto-start" reason for this cluster.
                          const v: any = visit;
                          const reasons: string[] = [];
                          if (!v.nearestKnownSite) reasons.push('no known site');
                          else if (v.nearestKnownSite.outsideByMeters > 0) reasons.push(`outside radius (${v.nearestKnownSite.outsideByMeters} m)`);
                          if (v.pingCount < 3 && (!v.dwellMs || v.dwellMs < 2 * 60_000)) reasons.push('unstable pings');
                          if (v.avgAccuracy != null && v.avgAccuracy > 75) reasons.push('poor accuracy');
                          if (v.nearestKnownSite && (v.nearestKnownSite.lat == null || v.nearestKnownSite.lng == null)) reasons.push('missing target coordinates');
                          if (reasons.length === 0) reasons.push('no cron run / engine guard');
                          return (
                            <>
                              <span>no_auto_start_reason:</span>
                              <span className="text-amber-600">{reasons.join(', ')}</span>
                            </>
                          );
                        })()}
                      </div>
                    </li>
                  )}
                  {ev.kind === 'timer_stopped' && expandedDebugKeys.has(ev.id) && (() => {
                    const mm = (ev.meta ?? {}) as any;
                    const lteMeta: any = mm.lteMetadata ?? {};
                    const stopMeta: any =
                      (lteMeta.stop_metadata && typeof lteMeta.stop_metadata === 'object')
                        ? lteMeta.stop_metadata
                        : lteMeta;
                    const sw: any = stopMeta?.switch ?? lteMeta?.switch ?? null;
                    const cls = classifyStopSource({
                      source: (mm.lteSource ?? mm.source) ?? null,
                      metadata: lteMeta as Record<string, any> | null,
                      exitedAt: mm.stoppedAt ?? ev.at ?? null,
                      lteId: mm.lteId ?? '',
                    });
                    const k = cls.key;
                    const isAuto = k === 'server_auto_switch' || k === 'server_background_gps' || k === 'geofence_foreground' || k === 'watchdog';
                    const isManual = k === 'user_manual' || k === 'admin';
                    const isReport = k === 'time_report_save';
                    return (
                      <li className="col-span-5 ml-14 mr-2 mb-1 rounded border border-dashed bg-muted/20 px-2 py-1.5 text-[10px] font-mono leading-relaxed text-muted-foreground">
                        <div className="grid grid-cols-[auto_1fr] gap-x-2">
                          <span>stop_source:</span><span className="text-foreground">{cls.details.stopSource ?? '—'}</span>
                          <span>stop_reason:</span><span className="text-foreground">{cls.details.stopReason ?? '—'}</span>
                          <span>stopped_at:</span><span className="text-foreground">{cls.details.stoppedAt ?? '—'}</span>
                          <span>lte_id:</span><span className="text-foreground">{cls.details.sourceEntryId || '—'}</span>

                          {isAuto && (
                            <>
                              <span>departure_at:</span><span className="text-foreground">{cls.details.departureAt ?? stopMeta?.departure_at ?? '—'}</span>
                              <span>target:</span>
                              <span className="text-foreground">
                                {sw?.previous_target?.label ?? stopMeta?.location_name ?? stopMeta?.target ?? '—'}
                              </span>
                              {sw?.next_target && (
                                <>
                                  <span>next_target:</span>
                                  <span className="text-foreground">
                                    {sw.next_target?.label ?? '—'} ({sw.next_target?.kind ?? '—'})
                                  </span>
                                  <span>arrival_at:</span>
                                  <span className="text-foreground">{sw.arrival_at ?? '—'}</span>
                                </>
                              )}
                              <span>confidence:</span><span className="text-foreground">{String(cls.details.confidence ?? sw?.confidence ?? '—')}</span>
                              <span>exit_pings:</span><span className="text-foreground">{stopMeta?.exit_ping_count ?? stopMeta?.ping_count ?? '—'}</span>
                              <span>first_outside_ping:</span><span className="text-foreground">{stopMeta?.first_outside_ping_at ?? '—'}</span>
                              <span>last_inside_ping:</span><span className="text-foreground">{stopMeta?.last_inside_ping_at ?? '—'}</span>
                              <span>distance_from_target:</span><span className="text-foreground">{stopMeta?.distance_m != null ? `${stopMeta.distance_m} m` : '—'}</span>
                              <span>accuracy:</span><span className="text-foreground">{stopMeta?.accuracy_m != null ? `±${stopMeta.accuracy_m} m` : '—'}</span>
                              <span>run_id:</span><span className="text-foreground">{cls.details.runId ?? '—'}</span>
                              <span>engine_version:</span><span className="text-foreground">{stopMeta?.engine_version ?? '—'}</span>
                              {stopMeta?.travel_suggestion_id && (
                                <>
                                  <span>travel_suggestion:</span>
                                  <span className="text-foreground">{stopMeta.travel_suggestion_id}</span>
                                </>
                              )}
                            </>
                          )}

                          {isManual && (
                            <>
                              <span>actor:</span><span className="text-foreground">{cls.details.stoppedBy ?? '—'}</span>
                              <span>action_time:</span><span className="text-foreground">{cls.details.stoppedAt ?? '—'}</span>
                              <span>app_platform:</span><span className="text-foreground">{stopMeta?.app_platform ?? stopMeta?.client ?? '—'}</span>
                              <span>app_version:</span><span className="text-foreground">{stopMeta?.app_version ?? '—'}</span>
                              <span>closed_via:</span><span className="text-foreground">{stopMeta?.closed_via ?? '—'}</span>
                            </>
                          )}

                          {isReport && (
                            <>
                              <span>time_report_id:</span><span className="text-foreground">{cls.details.linkedTimeReportId ?? stopMeta?.time_report_id ?? '—'}</span>
                              <span>report_start:</span><span className="text-foreground">{stopMeta?.report_start ?? '—'}</span>
                              <span>report_end:</span><span className="text-foreground">{stopMeta?.report_end ?? '—'}</span>
                              <span>save_first_stop_second:</span>
                              <span className="text-foreground">
                                {stopMeta?.save_then_stop === true || stopMeta?.closed_via === 'save_then_stop' ? 'ja' : '—'}
                              </span>
                              <span>actor:</span><span className="text-foreground">{cls.details.stoppedBy ?? '—'}</span>
                            </>
                          )}

                          {k === 'unknown' && (
                            <>
                              <span>raw_metadata:</span>
                              <span className="text-foreground break-all">
                                {JSON.stringify(lteMeta).slice(0, 200) || '—'}
                              </span>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })()}
                </React.Fragment>
              );
            })}
          </ol>
        )}
        {backgroundEvents.length > 0 && (
          <div className="mt-3 pt-2 border-t border-dashed">
            <button
              type="button"
              onClick={() => setShowBackground(v => !v)}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              {showBackground ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Bakgrunds-GPS / ej arbetskopplad ({backgroundEvents.length})
            </button>
            {showBackground && (
              <ol className="space-y-1 mt-2 opacity-70">
                {backgroundEvents.map(ev => (
                  <li key={ev.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 text-xs py-0.5">
                    <span className="tabular-nums text-muted-foreground w-20">
                      {fmtHm(ev.at)}{ev.until ? `–${fmtHm(ev.until)}` : ''}
                    </span>
                    <span className="text-muted-foreground truncate">{ev.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {(() => {
                        const m = (ev.meta ?? {}) as any;
                        if (m.privateZone) {
                          const k = m.privateZone.kind;
                          if (k === 'home') return 'hem (privat)';
                          if (k === 'manual_ignore') return 'ignorerad zon';
                          if (k === 'recurring_night') return 'natt-zon';
                          return 'privat zon';
                        }
                        const r = getWorkRelevance(ev);
                        if (r === 'private_or_background') return 'privat/bakgrund';
                        if (r === 'raw_debug_only') return 'rå debug';
                        if (r === 'unknown_requires_lookup') return 'okänd – kräver uppslag';
                        return 'bakgrund';
                      })()}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </section>

      {/* C. Föreslagna korrigeringar — visas FÖRE rapport, eftersom det är den
          handlingsbara översikten admin ska reagera på. */}
      {model.proposedReport.anomalies.length > 0 && (
        <section className="px-4 py-3 border-b">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            Föreslagna korrigeringar
          </h4>
          <ul className="space-y-1.5">
            {model.proposedReport.anomalies.map((a: ProposedAnomaly) => (
              <li
                key={a.id}
                className={`rounded border px-2.5 py-1.5 text-xs ${
                  a.severity === 'critical'
                    ? 'border-destructive/40 bg-destructive/5'
                    : a.severity === 'warning'
                      ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20'
                      : 'border-muted bg-muted/10'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{a.label}</div>
                    {a.detail ? <div className="text-muted-foreground">{a.detail}</div> : null}
                    {a.suggestion ? (
                      <div className="text-foreground/80 italic mt-0.5">→ {a.suggestion}</div>
                    ) : null}
                  </div>
                  {onIgnoreEvent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onIgnoreEvent(a.id)}
                      className="h-6 px-2 text-[10px]"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Ignorera
                    </Button>
                  )}
                </div>

                {/* Inline admin-actions for "planned_time_without_signal".
                    Markerar tydligt att tiden 08:00–13:10 kommer från
                    PLANERING/BEKRÄFTELSE, inte från GPS-bevis. */}
                {a.action?.kind === 'planned_time_without_signal' && onResolvePlannedGap && (
                  <div className="mt-2 rounded border border-amber-400/50 bg-amber-100/60 dark:bg-amber-950/40 p-2 space-y-2">
                    <div className="text-[11px] text-amber-900 dark:text-amber-200 font-medium inline-flex items-center gap-1">
                      <WifiOff className="h-3 w-3" />
                      Bekräftelse krävs — perioden {fmtHm(a.action.plannedStartIso)}
                      {a.action.firstSignalIso ? `–${fmtHm(a.action.firstSignalIso)}` : ''} saknar GPS-bevis.
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={plannedGapBusy === a.id}
                        className="h-7 text-[11px]"
                        onClick={async () => {
                          if (!a.action) return;
                          setPlannedGapBusy(a.id);
                          try {
                            await onResolvePlannedGap({
                              anomalyId: a.id,
                              mode: 'planned',
                              plannedStartIso: a.action.plannedStartIso,
                              firstSignalIso: a.action.firstSignalIso,
                              assignmentId: a.action.assignmentId,
                              noSignalGapMinutes: a.action.noSignalGapMinutes,
                              label: a.action.label,
                            });
                            toast.success(`Arbetsdag skapad från planerad start ${fmtHm(a.action.plannedStartIso)} (källa: planering)`);
                          } catch (err: any) {
                            toast.error(err?.message || 'Kunde inte skapa arbetsdag');
                          } finally {
                            setPlannedGapBusy(null);
                          }
                        }}
                      >
                        Skapa arbetsdag från planerad start ({fmtHm(a.action.plannedStartIso)})
                      </Button>
                      {a.action.firstSignalIso && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={plannedGapBusy === a.id}
                          className="h-7 text-[11px]"
                          onClick={async () => {
                            if (!a.action || !a.action.firstSignalIso) return;
                            setPlannedGapBusy(a.id);
                            try {
                              await onResolvePlannedGap({
                                anomalyId: a.id,
                                mode: 'first_signal',
                                plannedStartIso: a.action.plannedStartIso,
                                firstSignalIso: a.action.firstSignalIso,
                                assignmentId: a.action.assignmentId,
                                noSignalGapMinutes: a.action.noSignalGapMinutes,
                                label: a.action.label,
                              });
                              toast.success(`Arbetsdag startad från första GPS ${fmtHm(a.action.firstSignalIso)}`);
                            } catch (err: any) {
                              toast.error(err?.message || 'Kunde inte skapa arbetsdag');
                            } finally {
                              setPlannedGapBusy(null);
                            }
                          }}
                        >
                          Skapa från första GPS ({fmtHm(a.action.firstSignalIso)})
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={plannedGapBusy === a.id}
                        className="h-7 text-[11px]"
                        onClick={async () => {
                          if (!a.action) return;
                          if (!confirm(`Markera ${date} som frånvaro för ${staffName}?`)) return;
                          setPlannedGapBusy(a.id);
                          try {
                            await onResolvePlannedGap({
                              anomalyId: a.id,
                              mode: 'absence',
                              plannedStartIso: a.action.plannedStartIso,
                              firstSignalIso: a.action.firstSignalIso,
                              assignmentId: a.action.assignmentId,
                              noSignalGapMinutes: a.action.noSignalGapMinutes,
                              label: a.action.label,
                            });
                            toast.success('Markerad som frånvaro');
                          } catch (err: any) {
                            toast.error(err?.message || 'Kunde inte markera frånvaro');
                          } finally {
                            setPlannedGapBusy(null);
                          }
                        }}
                      >
                        Markera frånvaro
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">Annan starttid:</span>
                      <input
                        type="time"
                        className="h-7 rounded border bg-background px-2 text-[11px]"
                        value={customTimeByAnomaly[a.id] ?? a.action.plannedStartIso.slice(11, 16)}
                        onChange={(e) =>
                          setCustomTimeByAnomaly(prev => ({ ...prev, [a.id]: e.target.value }))
                        }
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={plannedGapBusy === a.id}
                        className="h-7 text-[11px]"
                        onClick={async () => {
                          if (!a.action) return;
                          const hhmm = customTimeByAnomaly[a.id] ?? a.action.plannedStartIso.slice(11, 16);
                          const [hh, mm] = hhmm.split(':').map(v => parseInt(v, 10));
                          if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
                            toast.error('Ogiltig tid');
                            return;
                          }
                          // Bygg ISO i samma datum som planerad start (lokal).
                          const base = new Date(a.action.plannedStartIso);
                          base.setHours(hh, mm, 0, 0);
                          const customIso = base.toISOString();
                          setPlannedGapBusy(a.id);
                          try {
                            await onResolvePlannedGap({
                              anomalyId: a.id,
                              mode: 'custom',
                              plannedStartIso: a.action.plannedStartIso,
                              firstSignalIso: a.action.firstSignalIso,
                              customStartIso: customIso,
                              assignmentId: a.action.assignmentId,
                              noSignalGapMinutes: a.action.noSignalGapMinutes,
                              label: a.action.label,
                            });
                            toast.success(`Arbetsdag skapad från ${hhmm} (källa: admin-bekräftelse)`);
                          } catch (err: any) {
                            toast.error(err?.message || 'Kunde inte skapa arbetsdag');
                          } finally {
                            setPlannedGapBusy(null);
                          }
                        }}
                      >
                        Använd
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* D. Nuvarande sparad rapport — collapsed by default. Innehåller både
          den korta sammanfattningen OCH (om reportSlot satt) den fulla
          TimeReportReviewTable. Detta är den enda platsen rapporten visas. */}
      <section className="px-4 py-3 border-b">
        <button
          type="button"
          onClick={() => setReportOpen(v => !v)}
          className="w-full flex items-center justify-between text-xs"
        >
          <span className="font-semibold uppercase tracking-wide text-muted-foreground">
            Nuvarande sparad rapport
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            {reportOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {reportOpen ? 'Dölj' : 'Visa'}
          </span>
        </button>
        {reportOpen && (
          <>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded border bg-muted/20 px-2 py-1.5">
                <div className="text-[10px] uppercase text-muted-foreground">Workday</div>
                <div className="tabular-nums font-medium">{fmtMin(wdMin)}</div>
                <div className="text-[10px] text-muted-foreground">lönegrundande ram</div>
              </div>
              <div className="rounded border bg-muted/20 px-2 py-1.5">
                <div className="text-[10px] uppercase text-muted-foreground">Fördelad</div>
                <div className="tabular-nums font-medium">{fmtMin(model.proposedReport.distributedMinutes)}</div>
                <div className="text-[10px] text-muted-foreground">time_reports + travel</div>
              </div>
              <div className="rounded border bg-muted/20 px-2 py-1.5">
                <div className="text-[10px] uppercase text-muted-foreground">Ofördelad</div>
                <div
                  className={`tabular-nums font-medium ${
                    model.proposedReport.undistributedMinutes > 0 ? 'text-amber-600' : ''
                  }`}
                >
                  {fmtMin(model.proposedReport.undistributedMinutes)}
                </div>
                <div className="text-[10px] text-muted-foreground">workday − fördelad</div>
              </div>
              <div className="rounded border bg-muted/20 px-2 py-1.5">
                <div className="text-[10px] uppercase text-muted-foreground">Föreslagen resa</div>
                <div className="tabular-nums font-medium">{fmtMin(model.proposedReport.suggestedTravelMinutes)}</div>
                <div className="text-[10px] text-muted-foreground">ej godkänd</div>
              </div>
            </div>
            {reportSlot && <div className="mt-3">{reportSlot}</div>}
            <p className="mt-2 text-[10px] text-muted-foreground">
              Workday = lönegrundande ram. Time_reports = intern fördelning. LTE = pågående
              aktivitet/timerunderlag. Travel_log = föreslagen eller godkänd fördelning.
            </p>
          </>
        )}
      </section>

      {/* E. Rå GPS / debug — collapsed. Renderas bara om caller skickat in slot. */}
      {rawGpsSlot && (
        <section className="px-4 py-3 border-b">
          <button
            type="button"
            onClick={() => setRawGpsOpen(v => !v)}
            className="w-full flex items-center justify-between text-xs"
          >
            <span className="font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
              <Eye className="h-3 w-3" />
              Rå GPS / debug
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              {rawGpsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {rawGpsOpen ? 'Dölj' : 'Visa'}
            </span>
          </button>
          {rawGpsOpen && <div className="mt-3">{rawGpsSlot}</div>}
        </section>
      )}

      {/* F. Gemensam actionbar */}
      <section className="px-4 py-3 flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onAdjustWorkday}>
          <Clock className="h-3 w-3 mr-1.5" />
          Justera arbetsdag
        </Button>
        {(() => {
          const relevantKeys = new Set(
            mainEvents
              .filter(e => e.kind === 'gps_visit')
              .map(e => (e.meta as any)?.placeKey)
              .filter(Boolean),
          );
          const firstRelevant = model.actualVisits.find(v => relevantKeys.has(v.key));
          if (!firstRelevant) return null;
          return (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onCreateDistributionFromGps?.(firstRelevant.key)}
            >
              <MapPin className="h-3 w-3 mr-1.5" />
              Skapa fördelning från GPS
            </Button>
          );
        })()}
        {travelSuggestions.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onApproveTravelSuggestion?.(travelSuggestions[0]!.id)}
          >
            <Check className="h-3 w-3 mr-1.5" />
            Godkänn föreslagen restid
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setReprocessOpen(true)}>
          <Activity className="h-3 w-3 mr-1.5" />
          Räkna om dag från GPS + timers
        </Button>
        {!rawGpsSlot && onShowRawGps && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onShowRawGps}>
            <Eye className="h-3 w-3 mr-1.5" />
            Visa rå GPS
          </Button>
        )}
        {extraActions}
      </section>

      <ReprocessDayPreviewDialog
        open={reprocessOpen}
        onClose={() => setReprocessOpen(false)}
        staffName={staffName}
        date={date}
        model={model}
        onApply={handleApplyReprocess}
      />
    </div>
  );
};
