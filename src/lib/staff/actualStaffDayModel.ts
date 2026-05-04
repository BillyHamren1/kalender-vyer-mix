/**
 * buildActualStaffDayModel — single source of truth for "så här såg dagen
 * faktiskt ut" innan vi pratar om rapporter, fördelning eller lön.
 *
 * Bakgrund: tidigare admin-UI byggde tidrapportvyn direkt från
 * rapporttabellerna (workday + time_reports + location_time_entries +
 * travel_time_logs). Det gjorde att GPS-besök, signal-tappad-händelser,
 * pre-workday-aktivitet och föreslagna korrigeringar inte syntes i
 * huvudvyn — bara i ett gömt GPS-debugläge.
 *
 * Den här modulen samlar ALL evidens till en enda struktur:
 *
 *   {
 *     actualEvents     — kronologisk lista av allt som hänt under dagen
 *     actualVisits     — pingPlaceSegments-vistelser med kända platser
 *     reportState      — råa tabellrader (workday / time_reports / lte / travel)
 *     proposedReport   — föreslagen arbetsdag / fördelning / restid /
 *                        ofördelad tid / avvikelser
 *   }
 *
 * Pure / UI-agnostic. Ingen DB, ingen React.
 *
 * MIRROR-not: liknande motor finns server-side i `day-timeline-engine`
 * edge function. Den här klienten dubblerar logiken för admin-UI så att
 * vyn kan rendera även när engine-cachen inte är uppdaterad. Reglerna
 * måste hållas konsistenta — när vi lägger till nya evenemangstyper här
 * ska day-timeline-engine spegla dem.
 */
import type { PlaceVisit, TravelGap, KnownSite } from './pingPlaceSegments';
import { haversineMeters, type Ping } from './movementDetection';

// ── Inputs ───────────────────────────────────────────────────────────

export interface ActualWorkdayInput {
  id: string;
  started_at: string;
  ended_at: string | null;
}

export interface ActualTimeReportInput {
  id: string;
  start_iso: string;
  end_iso: string | null;
  label: string;
  approved: boolean;
  /** booking_id / large_project_id / location_id — endast metadata. */
  booking_id?: string | null;
  large_project_id?: string | null;
  location_id?: string | null;
  hours: number;
}

export interface ActualLocationTimeEntryInput {
  id: string;
  entered_at: string;
  exited_at: string | null;
  label: string;
  /** Resultatet av classifyLocationEntry: arbetstimer = false betyder presence. */
  isPresenceOnly: boolean;
  hours: number;
  /** Källa från location_time_entries.source — används för att skilja
   *  riktiga stopp från watchdog/clamp/auto-close. */
  source?: string | null;
  /** Lokal datum-sträng (YYYY-MM-DD) för entry — används för att se om
   *  exited_at är clampad till 23:59 av watchdogen. */
  entry_date?: string | null;
}

export interface ActualTravelLogInput {
  id: string;
  start_iso: string;
  end_iso: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  approved: boolean;
  autoDetected: boolean;
  /** 'gap_derived' / 'gps' / 'manual' / null. */
  source: string | null;
  hours: number;
}

export interface ActualAssistantEventInput {
  id: string;
  event_type: string;
  happened_at: string;
  target_label: string | null;
  resolution_status: string | null;
}

export interface ActualWorkdayFlagInput {
  id: string;
  flag_type: string;
  severity: string | null;
  title: string | null;
  description: string | null;
  created_at: string;
  resolved: boolean;
}

export interface ActualLatestPingInput {
  recorded_at: string | null;
}

export interface BuildActualStaffDayInput {
  /** Lokalt datum för dagen (YYYY-MM-DD), används bara för logging/keys. */
  date: string;
  workday: ActualWorkdayInput | null;
  timeReports: ActualTimeReportInput[];
  locationEntries: ActualLocationTimeEntryInput[];
  travelLogs: ActualTravelLogInput[];
  assistantEvents: ActualAssistantEventInput[];
  flags: ActualWorkdayFlagInput[];
  /** Tidigare beräknade vistelser från pingPlaceSegments. */
  visits: PlaceVisit[];
  /** Tidigare beräknade resor mellan vistelser. */
  travels: TravelGap[];
  /** Färska pings (för signal-tappad / GPS-gap). */
  pings: Ping[];
  /** Senaste ping från staff_locations (live-spårning). */
  latestPing: ActualLatestPingInput | null;
  /** Kända platser (org_locations + dagens bokningar/projekt) — används för
   *  debug "varför matchade inte detta GPS-kluster?". */
  knownSites?: KnownSite[];
  /** "Nu" — testbar. */
  now?: Date;
}

// ── Output ───────────────────────────────────────────────────────────

export type ActualEventKind =
  | 'workday_started'
  | 'workday_ended'
  | 'timer_started'
  | 'timer_stopped'
  | 'timer_end_estimated'
  | 'time_report_created'
  | 'time_report_closed'
  | 'gps_arrival'
  | 'gps_departure'
  | 'gps_visit'
  | 'gps_travel'
  | 'assistant_arrival'
  | 'assistant_departure'
  | 'assistant_other'
  | 'travel_suggestion'
  | 'stale_signal'
  | 'gps_gap'
  | 'anomaly';

export type ActualEventSeverity = 'info' | 'success' | 'warning' | 'critical';

/**
 * Status för intern platsmatchning mot kända sites (lager/booking/large_project).
 *  - 'matched'                — klustret matchade en känd plats.
 *  - 'unmatched_outside_radius' — närmaste kända plats finns men klustret ligger utanför dess radie.
 *  - 'unmatched_no_nearest'    — ingen jämförbar plats hittades.
 *  - 'unmatched_no_sites'      — inga kända platser laddades för dagen.
 *  - 'not_applicable'          — eventet är inte ett GPS-kluster.
 */
export type InternalMatchStatus =
  | 'matched'
  | 'unmatched_outside_radius'
  | 'unmatched_no_nearest'
  | 'unmatched_no_sites'
  | 'not_applicable';

/**
 * Klassificering av hur sannolikt ett GPS-kluster/-förflyttning är arbetsrelaterat.
 *  - work_confirmed         — matchad känd plats ELLER överlappar workday/timer/rapport.
 *  - work_possible          — okänd plats men nära (≤800m) en känd arbetsplats,
 *                              eller förflyttning mellan två kända arbetsplatser.
 *  - unknown_requires_lookup — okänd plats på dagtid utan tydlig arbetskoppling
 *                              men inte tydligt privat/natt.
 *  - private_or_background  — natt/tidig morgon, ingen workday/timer/rapport,
 *                              ingen intern matchning, okänd plats. Sannolikt
 *                              hemma eller bakgrunds-GPS.
 *  - raw_debug_only         — mycket kort pingkluster utan arbetskoppling, brus.
 */
export type WorkRelevance =
  | 'work_confirmed'
  | 'work_possible'
  | 'unknown_requires_lookup'
  | 'private_or_background'
  | 'raw_debug_only';

export interface ActualEvent {
  id: string;
  at: string;
  until?: string | null;
  durationMin?: number;
  kind: ActualEventKind;
  severity: ActualEventSeverity;
  label: string;
  detail?: string | null;
  place?: string | null;
  meta?: Record<string, unknown>;
  /** Försiktig tolkning av aktiviteten, t.ex. "troligt projektbesök". */
  inferred_label?: string | null;
  inferred_activity_type?: string | null;
  confidence?: 'low' | 'medium' | 'high' | null;
  /** Källa för platsuppslag: 'known_site' | 'mapbox_poi' | 'mapbox_address' | 'fallback'. */
  lookup_source?: string | null;
  address?: string | null;
  poi_name?: string | null;
  poi_category?: string | null;
  /** Berikad adress (POI eller gatuadress) — används av reprocess/förslag. */
  resolved_address?: string | null;
  /** Berikat POI-namn (Mapbox) eller känd plats-namn. */
  resolved_poi?: string | null;
  /** Tilltro till platslabeln: known_site=high, poi=medium, address=medium, koord-fallback=low. */
  match_confidence?: 'low' | 'medium' | 'high' | null;
  /** Intern matchstatus mot org_locations/bookings/large_projects. */
  internal_match_status?: InternalMatchStatus | null;
}

export interface NearestKnownSiteDebug {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  /** Avstånd från klustercenter till sitens center. */
  distanceMeters: number;
  /** Hur många meter UTANFÖR siten klustercentret ligger (negativt = inuti). */
  outsideByMeters: number;
}

export interface ActualVisit {
  key: string;
  label: string;
  /** Matchad känd plats (fixed location / dagens booking / large project). */
  knownSiteId: string | null;
  /** Klustercenter — används av UI för reverse-geocode-uppslag. */
  centre: { lat: number; lng: number } | null;
  start: string;
  end: string;
  durationMin: number;
  pingCount: number;
  avgAccuracy: number | null;
  /** Endast satt för okända kluster: närmaste kända plats + varför ingen träff. */
  nearestKnownSite?: NearestKnownSiteDebug | null;
  /** Mänsklig förklaring varför internal match misslyckades. */
  unmatchReason?: string | null;
}

export interface ProposedAnomaly {
  id: string;
  label: string;
  detail: string;
  severity: ActualEventSeverity;
  /** Fritextförslag på korrigering, t.ex. "Justera arbetsdag-start till 06:00?". */
  suggestion?: string | null;
}

export interface ProposedReport {
  proposedWorkdayStart: string | null;
  proposedWorkdayEnd: string | null;
  /** Total minuter som täcks av confirmed time_reports + godkänd travel. */
  distributedMinutes: number;
  /** Förslag på restid som inte ännu är godkänd. */
  suggestedTravelMinutes: number;
  /** Workday-minuter − distribuerade − pågående timer. */
  undistributedMinutes: number;
  /** Lista av avvikelser från workday_flags + härledda. */
  anomalies: ProposedAnomaly[];
}

export interface ReportState {
  workday: ActualWorkdayInput | null;
  timeReports: ActualTimeReportInput[];
  locationEntries: ActualLocationTimeEntryInput[];
  travelLogs: ActualTravelLogInput[];
}

export interface ActualStaffDayModel {
  date: string;
  actualEvents: ActualEvent[];
  actualVisits: ActualVisit[];
  reportState: ReportState;
  proposedReport: ProposedReport;
  /** Senaste GPS-pingens ålder i minuter, null om aldrig. */
  lastPingAgeMin: number | null;
  /** True om senaste ping är äldre än 10 min OCH workday/timer pågår. */
  signalLost: boolean;
}

// ── Konstanter ───────────────────────────────────────────────────────

const STALE_PING_MIN = 10;

const minutesBetween = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));

// ── Motor ────────────────────────────────────────────────────────────

export function buildActualStaffDayModel(input: BuildActualStaffDayInput): ActualStaffDayModel {
  const now = input.now ?? new Date();
  const events: ActualEvent[] = [];

  // 1) Workday
  if (input.workday) {
    events.push({
      id: `wd-start:${input.workday.id}`,
      at: input.workday.started_at,
      kind: 'workday_started',
      severity: 'success',
      label: 'Arbetsdag startad',
    });
    if (input.workday.ended_at) {
      events.push({
        id: `wd-end:${input.workday.id}`,
        at: input.workday.ended_at,
        kind: 'workday_ended',
        severity: 'success',
        label: 'Arbetsdag avslutad',
        durationMin: minutesBetween(input.workday.started_at, input.workday.ended_at),
      });
    }
  }

  // 2) time_reports
  for (const r of input.timeReports) {
    events.push({
      id: `tr-create:${r.id}`,
      at: r.start_iso,
      kind: 'time_report_created',
      severity: 'info',
      label: `Tidrapport startad: ${r.label}`,
      place: r.label,
      meta: { approved: r.approved },
    });
    if (r.end_iso) {
      events.push({
        id: `tr-close:${r.id}`,
        at: r.end_iso,
        kind: 'time_report_closed',
        severity: 'info',
        label: `Tidrapport stängd: ${r.label}`,
        place: r.label,
        durationMin: minutesBetween(r.start_iso, r.end_iso),
      });
    }
  }

  // 3) location_time_entries — timer_started/stopped (inkl presence)
  // Detektera syntetiska stopp (watchdog-clamp / auto-close) så vi inte
  // visar dem som bekräftade. Heuristik:
  //   - source ∈ {auto_assigned, auto_assigned_bg, auto_assigned_backfill,
  //     ai_reconciled}  → syntetiskt
  //   - exited_at ligger på 23:5x lokalt på entry_date  → clampad
  //   - latestPing >15 min före exited_at  → öppen timer som bara fick ett
  //     beräknat slut
  const SYNTHETIC_SOURCES = new Set([
    'auto_assigned',
    'auto_assigned_bg',
    'auto_assigned_backfill',
    'ai_reconciled',
    'system',
    'watchdog',
    'cron',
  ]);
  const lastPingMsForSynthetic = input.latestPing?.recorded_at
    ? new Date(input.latestPing.recorded_at).getTime()
    : null;
  const isSyntheticStop = (e: ActualLocationTimeEntryInput): { synthetic: boolean; reason: string | null } => {
    if (!e.exited_at) return { synthetic: false, reason: null };
    const src = (e.source ?? '').toLowerCase();
    if (SYNTHETIC_SOURCES.has(src)) {
      return { synthetic: true, reason: `Stoppad av ${src} (ej användarstopp).` };
    }
    // Clamped to ~end-of-day. Check BOTH raw ISO string (HH:MM as stored)
    // och lokal tid + UTC, eftersom exited_at kan ligga som UTC-ISO som råkar
    // vara 22:59Z/23:59Z för svensk dygnsslut. Vi vill aldrig kalla det "bekräftat
    // stopp".
    try {
      const iso = String(e.exited_at);
      const m = iso.match(/T(\d{2}):(\d{2})/);
      const rawHH = m ? Number(m[1]) : -1;
      const rawMM = m ? Number(m[2]) : -1;
      const d = new Date(e.exited_at);
      const localHH = d.getHours(); const localMM = d.getMinutes();
      const utcHH = d.getUTCHours(); const utcMM = d.getUTCMinutes();
      const isEndOfDay = (hh: number, mm: number) =>
        (hh === 23 && mm >= 55) || (hh === 0 && mm === 0);
      if (
        isEndOfDay(rawHH, rawMM) ||
        isEndOfDay(localHH, localMM) ||
        isEndOfDay(utcHH, utcMM)
      ) {
        return { synthetic: true, reason: 'Slut clampat till dygnsslut (~23:5x).' };
      }
    } catch { /* ignore */ }
    // Last GPS ping is much earlier than exit
    if (lastPingMsForSynthetic) {
      const exitMs = new Date(e.exited_at).getTime();
      const gapMin = (exitMs - lastPingMsForSynthetic) / 60_000;
      if (gapMin > 15) {
        return {
          synthetic: true,
          reason: `Senaste GPS-ping ${Math.round(gapMin)} min före registrerat slut — saknar bekräftat stopp.`,
        };
      }
    }
    return { synthetic: false, reason: null };
  };

  for (const e of input.locationEntries) {
    events.push({
      id: `lte-start:${e.id}`,
      at: e.entered_at,
      kind: 'timer_started',
      severity: 'info',
      label: e.isPresenceOnly
        ? `Närvaro registrerad: ${e.label}`
        : `Timer startad: ${e.label}`,
      place: e.label,
      meta: { presence: e.isPresenceOnly, source: e.source ?? null },
    });
    if (e.exited_at) {
      const { synthetic, reason } = isSyntheticStop(e);
      if (synthetic && !e.isPresenceOnly) {
        // Aldrig "Timer stoppad: …" för syntetiska/clampade slut.
        events.push({
          id: `lte-end-est:${e.id}`,
          at: e.exited_at,
          kind: 'timer_end_estimated',
          severity: 'warning',
          label: `Timer saknar faktiskt stopp: ${e.label}`,
          detail: `Föreslaget slut: ${e.exited_at.slice(11, 16)} · ${reason ?? 'Kräver granskning.'}`,
          place: e.label,
          durationMin: minutesBetween(e.entered_at, e.exited_at),
          meta: {
            source: e.source ?? null,
            stop_origin: 'system_review',
            estimated: true,
            reason,
          },
        });
      } else {
        events.push({
          id: `lte-stop:${e.id}`,
          at: e.exited_at,
          kind: 'timer_stopped',
          severity: 'info',
          label: e.isPresenceOnly
            ? `Närvaro avslutad: ${e.label}`
            : `Timer stoppad: ${e.label}`,
          place: e.label,
          durationMin: minutesBetween(e.entered_at, e.exited_at),
          meta: { source: e.source ?? null, stop_origin: 'user_or_admin' },
        });
      }
    }
  }

  // 4) travel_logs
  for (const t of input.travelLogs) {
    const isSuggestion = !t.approved && (t.autoDetected || t.source === 'gap_derived');
    if (isSuggestion) {
      events.push({
        id: `tv-suggest:${t.id}`,
        at: t.start_iso,
        until: t.end_iso,
        kind: 'travel_suggestion',
        severity: 'warning',
        label: `Föreslagen restid: ${t.fromAddress ?? '?'} → ${t.toAddress ?? '?'}`,
        detail: t.source === 'gap_derived' ? 'Härledd från lucka' : 'Auto-detekterad via GPS',
        durationMin: t.end_iso ? minutesBetween(t.start_iso, t.end_iso) : undefined,
      });
    } else {
      events.push({
        id: `tv:${t.id}`,
        at: t.start_iso,
        until: t.end_iso,
        kind: 'gps_travel',
        severity: 'info',
        label: `Resa: ${t.fromAddress ?? '?'} → ${t.toAddress ?? '?'}`,
        durationMin: t.end_iso ? minutesBetween(t.start_iso, t.end_iso) : undefined,
        meta: { travelOrigin: 'travel_log_approved', approved: true },
      });
    }
  }

  // 5) GPS-vistelser
  // Arbetsrelevans: en GPS-vistelse visas i huvudjournalen ENDAST om något
  // av följande gäller (annars hamnar den i "Bakgrunds-GPS / ej arbetskopplad"):
  //  - matchad känd plats (lager/booking/large_project)
  //  - överlappar workday-fönstret
  //  - överlappar en location_time_entry/timer
  //  - överlappar en time_report
  //  - kopplad till ett assistant_event (±20 min)
  //  - resa mellan två arbetsrelevanta platser
  const knownSitesAvailable = (input.knownSites ?? []).length > 0;
  const wdStart = input.workday ? new Date(input.workday.started_at).getTime() : null;
  const wdEnd = input.workday?.ended_at
    ? new Date(input.workday.ended_at).getTime()
    : (input.workday ? now.getTime() : null);
  const timerWindows = input.locationEntries.map(e => ({
    s: new Date(e.entered_at).getTime(),
    e: e.exited_at ? new Date(e.exited_at).getTime() : now.getTime(),
  }));
  const trWindows = input.timeReports.map(r => ({
    s: new Date(r.start_iso).getTime(),
    e: r.end_iso ? new Date(r.end_iso).getTime() : now.getTime(),
  }));
  const assistantTimes = input.assistantEvents.map(a => new Date(a.happened_at).getTime());
  const overlaps = (a: number, b: number, s: number, e: number) => a < e && b > s;
  const isWindowRelevant = (startMs: number, endMs: number): boolean => {
    if (wdStart != null && wdEnd != null && overlaps(startMs, endMs, wdStart, wdEnd)) return true;
    for (const w of timerWindows) if (overlaps(startMs, endMs, w.s, w.e)) return true;
    for (const w of trWindows) if (overlaps(startMs, endMs, w.s, w.e)) return true;
    for (const t of assistantTimes) if (t >= startMs - 20 * 60_000 && t <= endMs + 20 * 60_000) return true;
    return false;
  };

  const visitRelevance = new Map<string, boolean>();
  for (const v of input.visits) {
    const startMs = new Date(v.start).getTime();
    const endMs = new Date(v.end).getTime();
    const relevant = !!v.knownSite || isWindowRelevant(startMs, endMs);
    visitRelevance.set(v.placeKey, relevant);
  }

  for (const v of input.visits) {
    const centreMeta = v.knownSite ? null : { lat: v.centre.lat, lng: v.centre.lng };
    const placeLabel = v.knownSite?.name ?? null;
    const matched = !!v.knownSite;
    const workRelevant = visitRelevance.get(v.placeKey) ?? false;
    const baseEnrichment = {
      lookup_source: matched ? 'known_site' : (knownSitesAvailable ? 'pending_lookup' : 'fallback'),
      resolved_address: null as string | null,
      resolved_poi: matched ? (v.knownSite!.name) : null,
      match_confidence: (matched ? 'high' : 'low') as 'low' | 'medium' | 'high',
      internal_match_status: (matched
        ? 'matched'
        : (knownSitesAvailable ? 'unmatched_outside_radius' : 'unmatched_no_sites')) as InternalMatchStatus,
    };
    const baseMeta = { placeKey: v.placeKey, centre: centreMeta, workRelevant };
    events.push({
      id: `gps-arr:${v.placeKey}:${v.start}`,
      at: v.start,
      kind: 'gps_arrival',
      severity: 'info',
      label: placeLabel ? `Anlände: ${placeLabel}` : 'Anlände: okänd plats',
      place: placeLabel,
      meta: { ...baseMeta, pingCount: v.pingCount },
      ...baseEnrichment,
    });
    events.push({
      id: `gps-visit:${v.placeKey}:${v.start}`,
      at: v.start,
      until: v.end,
      kind: 'gps_visit',
      severity: 'info',
      label: placeLabel ? `Vistelse: ${placeLabel}` : 'Vistelse: okänd plats',
      place: placeLabel,
      durationMin: v.durationMin,
      meta: baseMeta,
      ...baseEnrichment,
    });
    events.push({
      id: `gps-dep:${v.placeKey}:${v.end}`,
      at: v.end,
      kind: 'gps_departure',
      severity: 'info',
      label: placeLabel ? `Lämnade: ${placeLabel}` : 'Lämnade: okänd plats',
      place: placeLabel,
      meta: baseMeta,
      ...baseEnrichment,
    });
  }
  for (const tr of input.travels) {
    const fromLabel = tr.from.knownSite?.name ?? null;
    const toLabel = tr.to.knownSite?.name ?? null;
    const bothKnown = !!tr.from.knownSite && !!tr.to.knownSite;
    const startMs = new Date(tr.start).getTime();
    const endMs = new Date(tr.end).getTime();
    const fromRelevant = visitRelevance.get(tr.from.placeKey) ?? !!tr.from.knownSite;
    const toRelevant = visitRelevance.get(tr.to.placeKey) ?? !!tr.to.knownSite;
    const workRelevant = (fromRelevant && toRelevant) || isWindowRelevant(startMs, endMs);
    events.push({
      id: `gps-trv:${tr.key}`,
      at: tr.start,
      until: tr.end,
      kind: 'gps_travel',
      severity: bothKnown ? 'info' : 'warning',
      label: `Förflyttning: ${fromLabel ?? 'okänd plats'} → ${toLabel ?? 'okänd plats'}`,
      durationMin: tr.durationMin,
      meta: {
        fromCentre: tr.from.knownSite ? null : { lat: tr.from.centre.lat, lng: tr.from.centre.lng },
        toCentre: tr.to.knownSite ? null : { lat: tr.to.centre.lat, lng: tr.to.centre.lng },
        travelOrigin: 'gps_movement',
        bothKnown,
        approved: false,
        workRelevant,
      },
    });
  }

  // 6) assistant_events
  for (const a of input.assistantEvents) {
    const t = a.event_type.toLowerCase();
    const kind: ActualEventKind = t.includes('arriv')
      ? 'assistant_arrival'
      : t.includes('depart') || t.includes('left')
        ? 'assistant_departure'
        : 'assistant_other';
    events.push({
      id: `ae:${a.id}`,
      at: a.happened_at,
      kind,
      severity: 'info',
      label: a.target_label
        ? `Assistent: ${kind === 'assistant_arrival' ? 'Ankom' : 'Lämnade'} ${a.target_label}`
        : `Assistent: ${a.event_type}`,
      place: a.target_label,
    });
  }

  // 7) workday_flags → anomaly-events
  for (const f of input.flags) {
    events.push({
      id: `wf:${f.id}`,
      at: f.created_at,
      kind: 'anomaly',
      severity: (f.severity as ActualEventSeverity) || 'warning',
      label: f.title || `Avvikelse: ${f.flag_type}`,
      detail: f.description,
      meta: { resolved: f.resolved },
    });
  }

  // 8) GPS-gap mellan ping-buckets > 20 min
  const sortedPings = [...input.pings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  for (let i = 1; i < sortedPings.length; i++) {
    const gapMin = minutesBetween(sortedPings[i - 1].recorded_at, sortedPings[i].recorded_at);
    if (gapMin >= 20) {
      events.push({
        id: `gap:${sortedPings[i - 1].recorded_at}`,
        at: sortedPings[i - 1].recorded_at,
        until: sortedPings[i].recorded_at,
        kind: 'gps_gap',
        severity: gapMin >= 60 ? 'warning' : 'info',
        label: `GPS-gap (${gapMin} min)`,
        durationMin: gapMin,
      });
    }
  }

  // 9) Stale signal
  const lastPingMs = input.latestPing?.recorded_at
    ? new Date(input.latestPing.recorded_at).getTime()
    : null;
  const lastPingAgeMin = lastPingMs ? Math.round((now.getTime() - lastPingMs) / 60_000) : null;
  const workdayOpen = !!input.workday && !input.workday.ended_at;
  const anyTimerOpen = input.timeReports.some(r => !r.end_iso) ||
    input.locationEntries.some(e => !e.exited_at);
  const signalLost = (workdayOpen || anyTimerOpen)
    && lastPingAgeMin != null && lastPingAgeMin > STALE_PING_MIN;
  if (signalLost && input.latestPing?.recorded_at) {
    events.push({
      id: `stale:${input.latestPing.recorded_at}`,
      at: input.latestPing.recorded_at,
      kind: 'stale_signal',
      severity: 'critical',
      label: `Signal tappad — senaste ping ${lastPingAgeMin} min sedan`,
      detail: 'Pågående arbetsdag eller timer utan färska GPS-pings.',
    });
  }

  // ── Sort + härled durationMin där möjligt ────────────────────────
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  for (const ev of events) {
    if (ev.durationMin == null && ev.until) {
      ev.durationMin = minutesBetween(ev.at, ev.until);
    }
  }

  // ── ActualVisits (komprimerad form av PlaceVisit) ────────────────
  const knownSites = input.knownSites ?? [];
  const findNearestSite = (c: { lat: number; lng: number }): NearestKnownSiteDebug | null => {
    if (!knownSites.length) return null;
    let best: NearestKnownSiteDebug | null = null;
    for (const s of knownSites) {
      const d = haversineMeters({ lat: s.lat, lng: s.lng }, c);
      if (!best || d < best.distanceMeters) {
        best = {
          id: s.id,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          radiusMeters: s.radiusMeters,
          distanceMeters: Math.round(d),
          outsideByMeters: Math.round(d - s.radiusMeters),
        };
      }
    }
    return best;
  };

  const actualVisits: ActualVisit[] = input.visits.map(v => {
    const accs = v.pings.map(p => (p.accuracy == null ? NaN : Number(p.accuracy))).filter(n => Number.isFinite(n));
    const avgAccuracy = accs.length ? Math.round((accs.reduce((s, n) => s + n, 0) / accs.length) * 10) / 10 : null;
    const isUnknown = !v.knownSite;
    const nearest = isUnknown ? findNearestSite(v.centre) : null;
    let unmatchReason: string | null = null;
    if (isUnknown) {
      if (!knownSites.length) {
        unmatchReason = 'Inga kända platser laddade för denna dag.';
      } else if (!nearest) {
        unmatchReason = 'Ingen jämförbar känd plats hittades.';
      } else if (nearest.outsideByMeters > 0) {
        unmatchReason = `Klustercenter ligger ${nearest.outsideByMeters} m utanför "${nearest.name}" (radie ${nearest.radiusMeters} m, avstånd ${nearest.distanceMeters} m).`;
      } else {
        unmatchReason = `Klustercenter ligger inom "${nearest.name}" men matchKnownSite valde inte den — kontrollera om radien justerats efter ping-tidpunkten eller om accuracy försköt enskilda pings utanför radien.`;
      }
    }
    return {
      key: v.placeKey,
      label: v.knownSite?.name ?? 'Okänd plats',
      knownSiteId: v.knownSite?.id ?? null,
      centre: v.knownSite ? null : { lat: v.centre.lat, lng: v.centre.lng },
      start: v.start,
      end: v.end,
      durationMin: v.durationMin,
      pingCount: v.pingCount,
      avgAccuracy,
      nearestKnownSite: nearest,
      unmatchReason,
    };
  });

  // ── ProposedReport ────────────────────────────────────────────────
  // distributedMinutes = stängda time_reports
  //                    + stängda location-LTE som är riktiga work timers
  //                      (location_id + manual/timer/mobile etc — INTE
  //                      presence-only GPS/geofence)
  //                    + approved travel
  // En öppen Lager-timer räknas INTE här (visas som active_distribution
  // via reportState.locationEntries istället) men UI får fortfarande veta
  // att den existerar.
  const distributedMinutes = Math.round(
    input.timeReports.filter(r => r.end_iso).reduce((s, r) => s + r.hours * 60, 0)
    + input.locationEntries
        .filter(e => e.exited_at && !e.isPresenceOnly)
        .reduce((s, e) => s + e.hours * 60, 0)
    + input.travelLogs.filter(t => t.approved && t.end_iso).reduce((s, t) => s + t.hours * 60, 0),
  );
  const suggestedTravelMinutes = Math.round(
    input.travelLogs
      .filter(t => !t.approved && t.end_iso && (t.autoDetected || t.source === 'gap_derived'))
      .reduce((s, t) => s + t.hours * 60, 0),
  );

  // Föreslå ny workday-start om GPS visar aktivitet före workday
  let proposedWorkdayStart = input.workday?.started_at ?? null;
  let proposedWorkdayEnd = input.workday?.ended_at ?? null;
  const anomalies: ProposedAnomaly[] = [];

  if (input.workday) {
    const wdStartMs = new Date(input.workday.started_at).getTime();
    const earliestVisit = actualVisits[0];
    if (earliestVisit && new Date(earliestVisit.start).getTime() < wdStartMs - 5 * 60_000) {
      anomalies.push({
        id: `pre-wd:${earliestVisit.key}`,
        label: 'GPS-aktivitet före arbetsdagens start',
        detail: `Vistelse på ${earliestVisit.label} ${earliestVisit.start.slice(11, 16)} — workday startade ${input.workday.started_at.slice(11, 16)}.`,
        severity: 'warning',
        suggestion: `Justera arbetsdagens start till ${earliestVisit.start.slice(11, 16)}? Eller ignorera som ej arbetstid.`,
      });
      proposedWorkdayStart = earliestVisit.start;
    }
  }

  if (signalLost) {
    anomalies.push({
      id: 'stale-signal',
      label: 'Signal tappad under pågående arbetsdag/timer',
      detail: `Senaste GPS-ping ${lastPingAgeMin} min sedan.`,
      severity: 'critical',
      suggestion: 'Granska innan godkännande — kan kräva manuell justering av sluttid.',
    });
  }

  for (const f of input.flags) {
    if (f.resolved) continue;
    anomalies.push({
      id: `flag:${f.id}`,
      label: f.title || `Avvikelse: ${f.flag_type}`,
      detail: f.description ?? '',
      severity: (f.severity as ActualEventSeverity) || 'warning',
    });
  }

  const workdayMinutes = input.workday
    ? minutesBetween(
        input.workday.started_at,
        input.workday.ended_at ?? now.toISOString(),
      )
    : 0;
  const undistributedMinutes = Math.max(0, workdayMinutes - distributedMinutes);

  return {
    date: input.date,
    actualEvents: events,
    actualVisits,
    reportState: {
      workday: input.workday,
      timeReports: input.timeReports,
      locationEntries: input.locationEntries,
      travelLogs: input.travelLogs,
    },
    proposedReport: {
      proposedWorkdayStart,
      proposedWorkdayEnd,
      distributedMinutes,
      suggestedTravelMinutes,
      undistributedMinutes,
      anomalies,
    },
    lastPingAgeMin,
    signalLost,
  };
}
