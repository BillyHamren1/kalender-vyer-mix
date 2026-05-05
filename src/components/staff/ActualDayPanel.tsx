import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Activity,
  AlertTriangle,
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
import type {
  ActualEvent,
  ActualEventKind,
  ActualEventSeverity,
  ActualStaffDayModel,
  ProposedAnomaly,
} from '@/lib/staff/actualStaffDayModel';
import { classifyStopSource, STOP_SOURCE_BADGE_CLASSES } from '@/lib/staff/stopSourceClassifier';

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
  /** Renderas inuti collapse-sektionen "Nuvarande sparad rapport". */
  reportSlot?: React.ReactNode;
  /** Renderas i den gemensamma actionbaren (E). */
  extraActions?: React.ReactNode;
  /** Renderas inuti collapse-sektionen "Rå GPS / debug". */
  rawGpsSlot?: React.ReactNode;
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
  | 'ongoing';

function deriveStatus(model: ActualStaffDayModel): { kind: HeaderStatus; label: string } {
  if (model.signalLost) return { kind: 'signal_lost', label: 'Signal tappad' };
  const wd = model.reportState.workday;
  if (wd && !wd.ended_at) return { kind: 'ongoing', label: 'Pågår' };
  const hasPreWd = model.proposedReport.anomalies.some(a => a.id.startsWith('pre-wd:'));
  if (hasPreWd) return { kind: 'pre_workday', label: 'GPS före arbetsdag' };
  if (wd && model.reportState.timeReports.length === 0 && model.reportState.locationEntries.length === 0) {
    return { kind: 'missing_report', label: 'Saknar rapport' };
  }
  if (model.proposedReport.anomalies.length > 0) return { kind: 'review', label: 'Kräver granskning' };
  if (!wd && (model.actualVisits.length > 0 || model.actualEvents.length > 0)) {
    return { kind: 'missing_report', label: 'Saknar arbetsdag' };
  }
  return { kind: 'ok', label: 'OK' };
}

const statusBadgeClass = (kind: HeaderStatus): string => {
  switch (kind) {
    case 'ok':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
    case 'ongoing':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
    case 'signal_lost':
      return 'bg-destructive/15 text-destructive';
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
    default:
      return '—';
  }
};

const statusTagFor = (ev: ActualEvent): string => {
  const { kind, severity } = ev;
  const lookupSource = (ev as any).lookup_source as string | undefined;
  if (kind === 'travel_suggestion') return 'föreslagen';
  if (kind === 'gps_travel') {
    const m = (ev.meta ?? {}) as any;
    if (m.travelOrigin === 'travel_log_approved' || m.approved === true) return 'bekräftad';
    if (m.bothKnown) return 'föreslagen';
    return 'osäker';
  }
  if (kind === 'stale_signal' || kind === 'anomaly' || severity === 'critical' || severity === 'warning') return 'osäker';
  if ((kind === 'gps_arrival' || kind === 'gps_departure' || kind === 'gps_visit')) {
    if (lookupSource === 'mapbox' || lookupSource === 'mapbox_poi' || lookupSource === 'mapbox_address') return 'adressuppslag';
    if (lookupSource === 'fallback' || lookupSource === 'pending_lookup') return 'osäker';
  }
  return 'bekräftad';
};

// Kompaktläge gömmer ENDAST rådetaljer (stale_signal, gps_gap) — aldrig
// ankomst/lämning eller besök. Användaren ska alltid se basflödet:
//   06:00 Anlände Lager
//   06:05 Lämnade Lager
//   06:05–06:40 Förflyttning
//   06:40 Anlände Projekt
// "Visa alla händelser" lägger till gps_gap/stale_signal-rader på toppen.
const RAW_DETAIL_KINDS: ReadonlySet<ActualEventKind> = new Set<ActualEventKind>([
  // stale_signal ("Signal tappad") MÅSTE alltid synas i huvudjournalen —
  // det är en operativ varning, inte rådebug. Endast gps_gap döljs.
  'gps_gap',
]);
function compactEvents(events: ActualEvent[]): ActualEvent[] {
  return events.filter(e => !RAW_DETAIL_KINDS.has(e.kind));
}

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
  reportSlot,
  extraActions,
  rawGpsSlot,
}) => {
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [rawGpsOpen, setRawGpsOpen] = useState(false);
  const [reprocessOpen, setReprocessOpen] = useState(false);
  const [expandedDebugKeys, setExpandedDebugKeys] = useState<Set<string>>(() => new Set());

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

  const rawEvents = showAllEvents ? model.actualEvents : compactEvents(model.actualEvents);

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
        };
      }
      if (ev.kind === 'gps_travel' && ev.label.includes('Förflyttning')) {
        const fromKnown = !m?.fromCentre;
        const toKnown = !m?.toCentre;
        if (fromKnown && toKnown) return ev;
        const fromLbl = fromKnown
          ? ev.label.replace(/^Förflyttning:\s*/, '').split(' → ')[0]
          : (lookupCoord(m?.fromCentre)?.label ?? 'okänd plats');
        const toLbl = toKnown
          ? (ev.label.split(' → ')[1] ?? '')
          : (lookupCoord(m?.toCentre)?.label ?? 'okänd plats');
        return { ...ev, label: `Förflyttning: ${fromLbl} → ${toLbl}` };
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
    for (const ev of events) (isMainJournalEvent(ev) ? main : bg).push(ev);
    return [main, bg] as const;
  }, [events]);
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
          ) : (
            <span className="text-amber-600">saknas</span>
          )}
        </div>
        <div className="text-xs">
          <span className="text-muted-foreground">Lönegrundande </span>
          <span className="tabular-nums font-medium text-foreground">{fmtMin(wdMin)}</span>
        </div>
        {(() => {
          const wmeta = (wd as any)?.metadata as any;
          const wstart = (wd as any)?.started_by as string | null;
          const isBackfill = wmeta?.auto_start_source === 'server_background_gps_backfill'
            || wstart === 'server_auto_start_backfill';
          const isServerAuto = isBackfill
            || wmeta?.auto_start_source === 'server_background_gps'
            || wstart === 'server_auto_start';
          if (!isServerAuto) return null;
          return (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge className="bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100 font-medium">
                Auto-startad från GPS
                {wmeta?.confidence ? ` · ${wmeta.confidence}` : ''}
              </Badge>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5">Servermotor</Badge>
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
              const isExpanded = isUnknownCluster && expandedDebugKeys.has(ev.id);
              const lookupKey = visit?.centre
                ? `${visit.centre.lat.toFixed(3)},${visit.centre.lng.toFixed(3)}`
                : null;
              const geo = lookupKey ? (geoByKey.get(lookupKey)?.data ?? null) : null;
              return (
                <React.Fragment key={ev.id}>
                  <li className="grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-x-2 text-xs py-0.5">
                    <span className="tabular-nums text-muted-foreground w-12">
                      {fmtHm(ev.at)}
                      {ev.until ? `–${fmtHm(ev.until)}` : ''}
                    </span>
                    <EventIcon kind={ev.kind} severity={ev.severity} />
                    <span className="text-foreground truncate">
                      {ev.label}
                      {ev.detail ? <span className="text-muted-foreground"> · {ev.detail}</span> : null}
                      {(() => {
                        const mm = (ev.meta ?? {}) as any;
                        const cls: string | undefined = mm.sourceClass;
                        if (!mm.autoStarted && cls !== 'foreground_geofence' && cls !== 'server_background' && cls !== 'backfill') return null;
                        const isServer = cls === 'server_background' || cls === 'backfill'
                          || mm.autoStartSource === 'server_background_gps'
                          || mm.autoStartSource === 'server_background_gps_backfill';
                        const isBackfill = cls === 'backfill' || mm.isBackfill === true
                          || mm.autoStartSource === 'server_background_gps_backfill';
                        const detailBits: string[] = [];
                        if (mm.confidence) detailBits.push(String(mm.confidence));
                        if (mm.pingCount != null) detailBits.push(`${mm.pingCount} pings`);
                        if (mm.avgAccuracyM != null) detailBits.push(`±${Math.round(mm.avgAccuracyM)}m`);
                        const tooltip = detailBits.join(' · ') || undefined;
                        return (
                          <span className="inline-flex items-center gap-1 ml-2 align-middle" title={tooltip}>
                            <Badge className="bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100 text-[10px] py-0 px-1.5">
                              Auto-startad från GPS
                              {mm.confidence ? ` · ${mm.confidence}` : ''}
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
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                {mm.pingCount != null ? `${mm.pingCount}p` : ''}
                                {mm.pingCount != null && mm.avgAccuracyM != null ? ' · ' : ''}
                                {mm.avgAccuracyM != null ? `±${Math.round(mm.avgAccuracyM)}m` : ''}
                              </span>
                            )}
                          </span>
                        );
                      })()}
                      {isUnknownCluster && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDebugKeys(prev => {
                              const next = new Set(prev);
                              if (next.has(ev.id)) next.delete(ev.id);
                              else next.add(ev.id);
                              return next;
                            })
                          }
                          className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground underline"
                        >
                          {isExpanded ? 'dölj debug' : 'debug'}
                        </button>
                      )}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {sourceTagFor(ev)}
                    </span>
                    <span
                      className={`text-[10px] uppercase tracking-wide ${
                        ev.severity === 'critical'
                          ? 'text-destructive'
                          : ev.severity === 'warning'
                            ? 'text-amber-600'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {statusTagFor(ev)}
                    </span>
                  </li>
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
