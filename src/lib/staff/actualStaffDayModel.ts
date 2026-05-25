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
import { classifyWorkStart, type WorkStartDecision } from './workStartDecisionMatrix';
import { formatStockholmHm, formatStockholmHms } from './formatStockholmTime';

// ── Inputs ───────────────────────────────────────────────────────────

export interface ActualWorkdayInput {
  id: string;
  started_at: string;
  ended_at: string | null;
  started_by?: string | null;
  metadata?: Record<string, any> | null;
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
  /** location_time_entries.metadata — innehåller bl.a. auto_start info. */
  metadata?: Record<string, any> | null;
}

export interface ActualTravelLogInput {
  id: string;
  start_iso: string;
  end_iso: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  fromLatitude?: number | null;
  fromLongitude?: number | null;
  toLatitude?: number | null;
  toLongitude?: number | null;
  description?: string | null;
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

/**
 * Planerad assignment för dagen (från booking_staff_assignments / staff_assignments
 * + bookings.rig/event/rigdown_start_time, eller large_project schema). Används
 * ENDAST som förväntan — aldrig som lönegrundande bevis.
 *
 * Om systemet ser en assignment med planerad starttid men utan GPS/timer-signal
 * fram till första ping → emitterar UI/förslag, inte automatisk bekräftelse.
 */
export interface ActualPlannedAssignmentInput {
  id: string;
  label: string;
  /** ISO för planerad start denna dag. */
  plannedStart: string;
  /** ISO för planerad slut, om känt. */
  plannedEnd?: string | null;
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
  /** Privata/exkluderade zoner (hem, manuellt ignorerade, återkommande
   *  natt-kluster). GPS-vistelser inom dessa klassas alltid som
   *  private_or_background och visas aldrig i huvudjournalen. */
  privateZones?: PrivateZone[];
  /** Planerade assignments för dagen — används som FÖRVÄNTAN, inte bevis. */
  plannedAssignments?: ActualPlannedAssignmentInput[];
  /** "Nu" — testbar. */
  now?: Date;
}

export interface PrivateZone {
  id: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  kind: 'home' | 'manual_ignore' | 'recurring_night';
  label: string | null;
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
  | 'planned_start'
  | 'planned_signal_gap'
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
  /**
   * Strukturerat platsobjekt — alltid ifyllt för GPS-events i UI-lagret så
   * att rendering aldrig behöver bygga "Plats vid lat,lng" själv.
   * Sätts av ActualDayPanel efter reverse-geocode/known-site-matchning.
   */
  resolvedPlace?: ResolvedPlace | null;
  /** För journey/förflyttnings-events. */
  fromPlace?: JourneyPlace | null;
  toPlace?: JourneyPlace | null;
}

/** Status för platsuppslaget — driver UI-badges och fallback-text. */
export type PlaceLookupStatus =
  | 'matched_internal'   // org_location / booking / large_project
  | 'reverse_geocoded'   // Mapbox gatuadress
  | 'poi_lookup'         // Mapbox POI-träff
  | 'failed'             // uppslag försökte men gav inget
  | 'pending';           // uppslag pågår

export interface ResolvedPlace {
  /** Mänsklig label, alltid satt (inkl. fallback "Okänd plats – adress saknas"). */
  label: string;
  address: string | null;
  city: string | null;
  poiName: string | null;
  poiCategory: string | null;
  /** Avstånd (m) till `poiName` från klustercenter. */
  poiDistanceMeters?: number | null;
  /** Andra POI:s i närheten (max ~5), sorterade efter avstånd. */
  nearbyPois?: Array<{ name: string; category: string | null; distanceMeters: number | null; mapsUrl: string }>;
  lat: number | null;
  lng: number | null;
  /** Google Maps-länk om koordinater finns, annars null. */
  mapUrl: string | null;
  lookupStatus: PlaceLookupStatus;
  confidence: 'low' | 'medium' | 'high';
  /** Debug: vilken provider svaret kom från. */
  lookupSource?: 'mapbox' | 'none' | 'internal' | null;
  /** Debug: felbeskrivning om uppslaget misslyckades. */
  lookupError?: string | null;
  /** Debug: cachekey som queryn använde (rundade koordinater). */
  cacheKey?: string | null;
  /** Debug: om Mapbox-token kunde hämtas. */
  tokenAvailable?: boolean | null;
  /** Debug: närmaste kända interna plats (om någon inom radius-rim). */
  nearestKnownSite?: { id: string; name: string; distanceMeters: number; radiusMeters: number } | null;
}

export interface JourneyPlace {
  label: string;
  mapUrl: string | null;
  lat: number | null;
  lng: number | null;
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
  /** True om visit-datum ligger inom autologin-fönstret (rig-2d → rigdown+2d). */
  autoLoginEligible?: boolean;
  /** 0 om inom fönstret, annars antal dagar utanför närmaste fönsterkant. */
  daysFromActiveWindow?: number;
  /** "Rig 18/5 – Rigdown 31/5" eller motsvarande. */
  activeWindowLabel?: string | null;
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
  /**
   * Alla kandidater inom 150 m från klustercenter, sorterade på avstånd.
   * Används av UI för "flera projekt på adressen — välj projekt"-fall.
   */
  candidatesWithinRadius?: NearestKnownSiteDebug[];
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
  /**
   * Strukturell payload för anomalies som har ett interaktivt åtgärdsflöde
   * (t.ex. "planned_time_without_signal" → admin kan skapa arbetsdag direkt
   * från Föreslagna korrigeringar). Optional och bakåtkompatibel.
   */
  action?: {
    kind: 'planned_time_without_signal';
    assignmentId: string | null;
    plannedStartIso: string;
    firstSignalIso: string | null;
    noSignalGapMinutes: number;
    label: string;
  } | null;
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

/**
 * Planeringsobjekt — separerat från actualEvents. Får ALDRIG renderas
 * som om det hade hänt; används för header/Planering-sektion + förslag.
 */
export interface PlanningItem {
  id: string;
  assignmentId: string;
  label: string;
  /** ISO för planerad start. */
  plannedStart: string;
  /** ISO för planerad slut, om känt. */
  plannedEnd: string | null;
  /** Källan, t.ex. 'planning'. */
  source: 'planning';
}

export interface ActualStaffDayModel {
  date: string;
  /** Hårda fakta: GPS, workday, timer, time_report, assistant, server, travel.
   *  Innehåller ALDRIG planeringsförväntan (se planningItems). */
  actualEvents: ActualEvent[];
  /** Planerade assignments — förväntan, inte bevis. */
  planningItems: PlanningItem[];
  actualVisits: ActualVisit[];
  reportState: ReportState;
  proposedReport: ProposedReport;
  /** Senaste GPS-pingens ålder i minuter, null om aldrig. */
  lastPingAgeMin: number | null;
  /** True om senaste ping är äldre än 10 min OCH workday/timer pågår. */
  signalLost: boolean;
  /** Beslut från arbetsstart-matrisen (Case A–E). Speglas server-side. */
  workStartDecision: WorkStartDecision;
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
    const meta = (e.metadata && typeof e.metadata === 'object') ? e.metadata : null;
    const isServerBg = meta?.auto_start_source === 'server_background_gps' ||
      e.source === 'auto_geofence_server';
    const isBackfill = meta?.auto_start_source === 'server_background_gps_backfill' ||
      e.source === 'auto_geofence_server_backfill';
    const autoStartedSrv = !!meta?.auto_started && (isServerBg || isBackfill);
    const sourceClass: 'manual' | 'foreground_geofence' | 'server_background' | 'backfill' =
      isBackfill ? 'backfill'
      : isServerBg ? 'server_background'
      : (meta?.auto_started === true || e.source === 'auto_geofence') ? 'foreground_geofence'
      : 'manual';
    events.push({
      id: `lte-start:${e.id}`,
      at: e.entered_at,
      kind: 'timer_started',
      severity: 'info',
      label: e.isPresenceOnly
        ? `Närvaro registrerad: ${e.label}`
        : `Timer startad: ${e.label}`,
      place: e.label,
      meta: {
        presence: e.isPresenceOnly,
        source: e.source ?? null,
        sourceClass,
        autoStarted: autoStartedSrv || meta?.auto_started === true,
        autoStartSource: meta?.auto_start_source ?? null,
        isBackfill,
        engineVersion: meta?.engine_version ?? null,
        runId: meta?.run_id ?? null,
        confidence: meta?.confidence ?? null,
        pingCount: meta?.arrival_pings_count ?? null,
        firstPingAt: meta?.ping_range?.first ?? meta?.first_arrival_ping_at ?? null,
        lastPingAt: meta?.ping_range?.last ?? null,
        avgAccuracyM: meta?.avg_accuracy_m ?? null,
        radiusM: meta?.radius_m ?? null,
        targetMatch: meta?.matched_target ?? null,
      },
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
          detail: `Föreslaget slut: ${formatStockholmHm(e.exited_at)} · ${reason ?? 'Kräver granskning.'}`,
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
        // Lyft stop-meta så UI kan visa stop_source/stop_reason/stopped_by
        // och servermotor-spår. classifyStopSource konsumerar dessa fält i
        // ActualDayPanel.
        const stopMetaRaw = (e.metadata && typeof e.metadata === 'object') ? e.metadata : {};
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
          meta: {
            source: e.source ?? null,
            stop_origin: 'user_or_admin',
            // Raw fields for stop-source classification (consumed in ActualDayPanel)
            lteId: e.id,
            lteSource: e.source ?? null,
            lteMetadata: stopMetaRaw,
            stoppedAt: e.exited_at,
            stop_source: stopMetaRaw.stop_source ?? stopMetaRaw.closed_at_source ?? null,
            stop_reason: stopMetaRaw.stop_reason ?? null,
            stopped_by: stopMetaRaw.stopped_by ?? stopMetaRaw.closed_by ?? null,
            run_id: stopMetaRaw.run_id ?? null,
            auto_switch: !!stopMetaRaw.switch,
            departure_at: stopMetaRaw.departure_at ?? stopMetaRaw?.switch?.departure_at ?? null,
            confidence: stopMetaRaw.confidence ?? stopMetaRaw?.switch?.confidence ?? null,
            linked_time_report_id: stopMetaRaw.linked_time_report_id ?? stopMetaRaw.time_report_id ?? null,
          },
        });
      }
    }
  }

  // 4) travel_logs
  for (const t of input.travelLogs) {
    const tsrc = String(t.source ?? '').toLowerCase();
    const isServerSwitch = tsrc === 'geofence_auto_switch_server';
    const isServerBackfill = tsrc === 'geofence_auto_switch_server_backfill';
    const sourceClass: 'manual' | 'foreground_geofence' | 'server_background' | 'backfill' | 'gap_derived' | null =
      isServerBackfill ? 'backfill'
      : isServerSwitch ? 'server_background'
      : tsrc === 'gap_derived' ? 'gap_derived'
      : t.autoDetected ? 'foreground_geofence'
      : null;
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
        meta: { source: t.source ?? null, sourceClass, autoStarted: isServerSwitch || isServerBackfill, isBackfill: isServerBackfill },
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
        meta: { travelOrigin: 'travel_log_approved', approved: true, source: t.source ?? null, sourceClass, autoStarted: isServerSwitch || isServerBackfill, isBackfill: isServerBackfill },
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

  // Pre-beräkna närmaste kända plats för "work_possible"-klassning.
  const knownSitesForRelevance = input.knownSites ?? [];
  const NEAR_KNOWN_METERS = 800;
  const isNearKnownSite = (c: { lat: number; lng: number } | null): boolean => {
    if (!c || !knownSitesForRelevance.length) return false;
    for (const s of knownSitesForRelevance) {
      const d = haversineMeters({ lat: s.lat, lng: s.lng }, c);
      if (d <= s.radiusMeters + NEAR_KNOWN_METERS) return true;
    }
    return false;
  };

  // Privata/exkluderade zoner — träffar dessa är ALLTID
  // private_or_background (även mitt på dagen, även nära känd plats).
  const privateZones = (input.privateZones ?? []).filter(z => z);
  const matchPrivateZone = (c: { lat: number; lng: number } | null): PrivateZone | null => {
    if (!c || !privateZones.length) return null;
    for (const z of privateZones) {
      const d = haversineMeters({ lat: z.lat, lng: z.lng }, c);
      if (d <= z.radiusMeters) return z;
    }
    return null;
  };

  // "Natt/tidig morgon" i lokal tid: 22:00–06:00.
  const isNightLocal = (iso: string): boolean => {
    try {
      const d = new Date(iso);
      const h = d.getHours();
      return h >= 22 || h < 6;
    } catch { return false; }
  };

  const RAW_DEBUG_MAX_PINGS = 2;
  const RAW_DEBUG_MAX_MIN = 3;

  const visitPrivateZone = new Map<string, PrivateZone | null>();
  const classifyVisitRelevance = (v: PlaceVisit): WorkRelevance => {
    // Privatzon vinner alltid över andra heuristiker.
    const pz = matchPrivateZone(v.centre);
    if (pz) {
      visitPrivateZone.set(v.placeKey, pz);
      return 'private_or_background';
    }
    if (v.knownSite) return 'work_confirmed';
    const startMs = new Date(v.start).getTime();
    const endMs = new Date(v.end).getTime();
    if (isWindowRelevant(startMs, endMs)) return 'work_confirmed';
    const tinyCluster = v.pingCount <= RAW_DEBUG_MAX_PINGS && v.durationMin <= RAW_DEBUG_MAX_MIN;
    if (tinyCluster) return 'raw_debug_only';
    if (isNearKnownSite(v.centre)) return 'work_possible';
    if (isNightLocal(v.start) && isNightLocal(v.end)) return 'private_or_background';
    return 'unknown_requires_lookup';
  };

  const visitRelevance = new Map<string, WorkRelevance>();
  for (const v of input.visits) {
    visitRelevance.set(v.placeKey, classifyVisitRelevance(v));
  }
  const isMainJournalRelevance = (r: WorkRelevance) =>
    r === 'work_confirmed' || r === 'work_possible';

  // ── Departure-evidence: en visit får ENDAST emittera "Lämnade"-event om
  // det finns faktisk evidens för att personen lämnade platsen. Sista ping
  // i ett kluster räcker INTE — då kan personen fortfarande vara kvar med
  // aktiv timer eller bara temporärt utan signal. Se constraint:
  //   gps_visit_exact_ping_membership-v1 + work_in_progress-v1
  const sortedVisitsForDep = [...input.visits].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
  const lastVisitKeyChrono = sortedVisitsForDep[sortedVisitsForDep.length - 1]?.placeKey ?? null;
  const fmtLocalHM = (iso: string): string => {
    try {
      return new Date(iso).toLocaleTimeString('sv-SE', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Stockholm',
      });
    } catch {
      return formatStockholmHm(iso);
    }
  };
  const hasDepartureEvidence = (v: PlaceVisit): { evidence: boolean; reason: string | null } => {
    const vEndMs = new Date(v.end).getTime();
    // 1) Travel som startar från denna placeKey
    for (const t of input.travels) {
      if (t.from.placeKey === v.placeKey && new Date(t.start).getTime() >= vEndMs - 60_000) {
        return { evidence: true, reason: 'travel_after' };
      }
    }
    // 2) Senare visit på annan plats
    for (const v2 of input.visits) {
      if (v2.placeKey !== v.placeKey && new Date(v2.start).getTime() >= vEndMs - 60_000) {
        return { evidence: true, reason: 'next_visit_other_place' };
      }
    }
    // 3) assistant_event departure ±20 min
    for (const a of input.assistantEvents) {
      const t = (a.event_type || '').toLowerCase();
      if (t.includes('depart') || t.includes('left')) {
        const d = Math.abs(new Date(a.happened_at).getTime() - vEndMs);
        if (d <= 20 * 60_000) return { evidence: true, reason: 'assistant_departure' };
      }
    }
    // 4) Godkänd travel_log som startar vid/efter v.end
    for (const tl of input.travelLogs) {
      if (tl.approved && new Date(tl.start_iso).getTime() >= vEndMs - 5 * 60_000) {
        return { evidence: true, reason: 'travel_log' };
      }
    }
    // 5) Riktigt (icke-syntetiskt) timer-stopp ±20 min
    for (const e of input.locationEntries) {
      if (!e.exited_at) continue;
      const stopMs = new Date(e.exited_at).getTime();
      if (Math.abs(stopMs - vEndMs) <= 20 * 60_000) {
        const { synthetic } = isSyntheticStop(e);
        if (!synthetic) return { evidence: true, reason: 'timer_stop' };
      }
    }
    // 6) Tiden har gått klart förbi visit end utan att personen är kvar.
    //    Om "nu" är ≥30 min efter v.end OCH ingen aktiv timer pekar på platsen
    //    OCH det inte är "senaste" visit med färska pings, räknas det som
    //    avslutad vistelse (annars skulle gamla dagar aldrig få departure-rad).
    if (now.getTime() - vEndMs >= 30 * 60_000) {
      return { evidence: true, reason: 'visit_long_passed' };
    }
    return { evidence: false, reason: null };
  };
  const isVisitOngoing = (v: PlaceVisit): boolean => {
    const vEndMs = new Date(v.end).getTime();
    // Aktiv timer/lte som startade före v.end och inte stängts.
    for (const e of input.locationEntries) {
      if (e.exited_at) continue;
      const enterMs = new Date(e.entered_at).getTime();
      if (enterMs <= vEndMs + 10 * 60_000) return true;
    }
    for (const r of input.timeReports) {
      if (r.end_iso) continue;
      const sMs = new Date(r.start_iso).getTime();
      if (sMs <= vEndMs + 10 * 60_000) return true;
    }
    // Senaste visit-kluster och relativt färsk ping → troligen kvar.
    if (v.placeKey === lastVisitKeyChrono && lastPingMsForSynthetic) {
      const ageMin = (now.getTime() - lastPingMsForSynthetic) / 60_000;
      if (ageMin <= STALE_PING_MIN * 2) return true;
    }
    return false;
  };

  for (const v of input.visits) {
    const centreMeta = v.knownSite ? null : { lat: v.centre.lat, lng: v.centre.lng };
    const matched = !!v.knownSite;
    const relevance = visitRelevance.get(v.placeKey) ?? 'unknown_requires_lookup';
    const workRelevant = isMainJournalRelevance(relevance);
    const pz = visitPrivateZone.get(v.placeKey) ?? null;
    // Privatzon: aldrig adress/koord som label, alltid tydlig markering.
    const placeLabel = pz
      ? (pz.label ?? (pz.kind === 'home' ? 'Hem (privat zon)' : 'Privat zon'))
      : (v.knownSite?.name ?? null);
    const baseEnrichment = {
      lookup_source: pz
        ? 'private_zone'
        : (matched ? 'known_site' : (knownSitesAvailable ? 'pending_lookup' : 'fallback')),
      resolved_address: null as string | null,
      resolved_poi: pz ? placeLabel : (matched ? (v.knownSite!.name) : null),
      match_confidence: (pz ? 'high' : (matched ? 'high' : 'low')) as 'low' | 'medium' | 'high',
      internal_match_status: (pz
        ? 'matched'
        : (matched
          ? 'matched'
          : (knownSitesAvailable ? 'unmatched_outside_radius' : 'unmatched_no_sites'))) as InternalMatchStatus,
    };
    const baseMeta = {
      placeKey: v.placeKey,
      centre: centreMeta,
      workRelevant,
      workRelevance: relevance,
      privateZone: pz ? { id: pz.id, kind: pz.kind, label: pz.label } : null,
    };
    const arrivalLabel = pz
      ? `Bakgrunds-GPS: privat/ej arbetskopplad${pz.label ? ` (${pz.label})` : ''}`
      : (placeLabel ? `Anlände: ${placeLabel}` : 'Anlände: okänd plats');
    const visitLabel = pz
      ? `Bakgrunds-GPS: privat/ej arbetskopplad${pz.label ? ` (${pz.label})` : ''}`
      : (placeLabel ? `Vistelse: ${placeLabel}` : 'Vistelse: okänd plats');
    const departureLabel = pz
      ? `Bakgrunds-GPS: lämnade privat zon${pz.label ? ` (${pz.label})` : ''}`
      : (placeLabel ? `Lämnade: ${placeLabel}` : 'Lämnade: okänd plats');
    events.push({
      id: `gps-arr:${v.placeKey}:${v.start}`,
      at: v.start,
      kind: 'gps_arrival',
      severity: 'info',
      label: arrivalLabel,
      place: placeLabel,
      meta: { ...baseMeta, pingCount: v.pingCount },
      ...baseEnrichment,
    });
    const dep = hasDepartureEvidence(v);
    const ongoing = isVisitOngoing(v) && !dep.evidence;
    const workdayActiveNow = !!input.workday && !input.workday.ended_at;
    const anyTimerOpenNow = input.timeReports.some(r => !r.end_iso)
      || input.locationEntries.some(e => !e.exited_at);
    // "Senast bekräftad" — visit utan departure-evidens men aktiv timer/workday.
    const lastSeenOnly = !dep.evidence && !ongoing && (workdayActiveNow || anyTimerOpenNow);
    const visitMeta = {
      ...baseMeta,
      ongoing,
      visit_last_seen_at: v.end,
      departed_at: dep.evidence ? v.end : null,
      departureEvidence: dep.evidence ? dep.reason : null,
      lastPingAt: v.end,
    };
    let visitDisplayLabel: string;
    if (pz) {
      visitDisplayLabel = visitLabel;
    } else if (ongoing) {
      visitDisplayLabel = placeLabel
        ? `Vistelse: ${placeLabel} · pågår`
        : 'Vistelse pågår';
    } else if (lastSeenOnly) {
      visitDisplayLabel = placeLabel
        ? `Senast bekräftad på ${placeLabel} ${fmtLocalHM(v.end)}`
        : `Senast bekräftad ${fmtLocalHM(v.end)}`;
    } else {
      visitDisplayLabel = visitLabel;
    }
    events.push({
      id: `gps-visit:${v.placeKey}:${v.start}`,
      at: v.start,
      until: ongoing || lastSeenOnly ? null : v.end,
      kind: 'gps_visit',
      severity: 'info',
      label: visitDisplayLabel,
      place: placeLabel,
      durationMin: v.durationMin,
      meta: visitMeta,
      ...baseEnrichment,
    });
    // gps_departure SKAPAS ENDAST om det finns faktisk departure-evidens.
    // Sista ping i klustret räcker INTE — det är bara "visit_last_seen_at".
    if (dep.evidence) {
      events.push({
        id: `gps-dep:${v.placeKey}:${v.end}`,
        at: v.end,
        kind: 'gps_departure',
        severity: 'info',
        label: departureLabel,
        place: placeLabel,
        meta: { ...baseMeta, departureEvidence: dep.reason, departed_at: v.end },
        ...baseEnrichment,
      });
    }
  }
  // Första "arbetsankaret" för dagen — workday-start eller första arbetsrelevanta
  // visit. Används för att förhindra att en gammal nattlig/bakgrunds-GPS före
  // detta ankare blir "Förflyttning till första arbetsplatsen" i huvudjournalen.
  const firstWorkVisitStartMs = (() => {
    let min = Number.POSITIVE_INFINITY;
    for (const v of input.visits) {
      const r = visitRelevance.get(v.placeKey) ?? 'unknown_requires_lookup';
      if (!isMainJournalRelevance(r)) continue;
      const t = new Date(v.start).getTime();
      if (t < min) min = t;
    }
    return Number.isFinite(min) ? min : null;
  })();
  const firstWorkAnchorMs = (() => {
    const candidates = [wdStart, firstWorkVisitStartMs].filter((x): x is number => x != null);
    return candidates.length ? Math.min(...candidates) : null;
  })();
  const ANCHOR_SLACK_MS = 5 * 60_000;

  // ── Travel-klassning ──────────────────────────────────────────────
  // Tre tydliga kategorier:
  //   A. work_travel            → huvudjournal ("Förflyttning: A → B")
  //   B. commute_or_background  → endast under "Bakgrunds-GPS"
  //   C. uncertain_travel       → huvudjournal som "Möjlig förflyttning – kräver granskning"
  type TravelClass = 'work_travel' | 'commute_or_background' | 'uncertain_travel';

  for (const tr of input.travels) {
    const fromLabel = tr.from.knownSite?.name ?? null;
    const toLabel = tr.to.knownSite?.name ?? null;
    const bothKnown = !!tr.from.knownSite && !!tr.to.knownSite;
    const startMs = new Date(tr.start).getTime();
    const endMs = new Date(tr.end).getTime();
    const fromRel = visitRelevance.get(tr.from.placeKey)
      ?? (tr.from.knownSite ? 'work_confirmed' : 'unknown_requires_lookup');
    const toRel = visitRelevance.get(tr.to.placeKey)
      ?? (tr.to.knownSite ? 'work_confirmed' : 'unknown_requires_lookup');
    const fromIsWork = isMainJournalRelevance(fromRel);
    const toIsWork = isMainJournalRelevance(toRel);
    const fromIsPrivate = fromRel === 'private_or_background';
    const toIsPrivate = toRel === 'private_or_background';
    const overlapsWorkContext = isWindowRelevant(startMs, endMs);

    // Pre-workday lead-in: SLUTAR vid (eller före) dagens första arbetsankare
    // och origin är inte arbetsrelevant → privat/pendling, aldrig huvudjournal.
    const isLeadInToFirstAnchor =
      firstWorkAnchorMs != null
      && endMs <= firstWorkAnchorMs + ANCHOR_SLACK_MS
      && !fromIsWork;

    let travelClass: TravelClass;
    let reason: string;
    if (isLeadInToFirstAnchor) {
      travelClass = 'commute_or_background';
      reason = 'pre_workday_lead_in';
    } else if (fromIsPrivate && !toIsWork) {
      travelClass = 'commute_or_background';
      reason = 'private_origin_no_work_destination';
    } else if (isNightLocal(tr.start) && isNightLocal(tr.end) && !overlapsWorkContext) {
      travelClass = 'commute_or_background';
      reason = 'night_no_work_overlap';
    } else if (bothKnown || (fromIsWork && toIsWork) || overlapsWorkContext) {
      travelClass = 'work_travel';
      reason = bothKnown ? 'both_known_sites'
        : overlapsWorkContext ? 'overlaps_workday_or_timer'
        : 'both_endpoints_work_relevant';
    } else if (fromIsWork || toIsWork) {
      travelClass = 'uncertain_travel';
      reason = 'one_endpoint_work_relevant';
    } else {
      travelClass = 'commute_or_background';
      reason = 'no_work_context';
    }

    // Bakåtkompat: mappa till WorkRelevance som UI redan filtrerar på.
    const travelRelevance: WorkRelevance =
      travelClass === 'work_travel' ? 'work_confirmed'
      : travelClass === 'uncertain_travel' ? 'work_possible'
      : 'private_or_background';
    const workRelevant = isMainJournalRelevance(travelRelevance);

    const labelFromTo = `${fromLabel ?? 'okänd plats'} → ${toLabel ?? 'okänd plats'}`;
    const label =
      travelClass === 'commute_or_background'
        ? (isLeadInToFirstAnchor
            ? `Bakgrunds-GPS före arbetsdagens start: ${labelFromTo}`
            : `Bakgrunds-GPS / pendling: ${labelFromTo}`)
        : travelClass === 'uncertain_travel'
          ? `Möjlig förflyttning – kräver granskning: ${labelFromTo}`
          : `Förflyttning: ${labelFromTo}`;

    events.push({
      id: `gps-trv:${tr.key}`,
      at: tr.start,
      until: tr.end,
      kind: 'gps_travel',
      severity: travelClass === 'work_travel' && bothKnown ? 'info' : 'warning',
      label,
      durationMin: tr.durationMin,
      meta: {
        fromCentre: tr.from.knownSite ? null : { lat: tr.from.centre.lat, lng: tr.from.centre.lng },
        toCentre: tr.to.knownSite ? null : { lat: tr.to.centre.lat, lng: tr.to.centre.lng },
        fromPlaceKey: tr.from.placeKey,
        toPlaceKey: tr.to.placeKey,
        fromKnownSiteId: tr.from.knownSite?.id ?? null,
        toKnownSiteId: tr.to.knownSite?.id ?? null,
        // Slingrar tillbaka till samma plats — GPS-jitter / kort utsträckning.
        samePlaceTravel: tr.from.placeKey === tr.to.placeKey
          || (!!tr.from.knownSite && tr.from.knownSite.id === tr.to.knownSite?.id),
        travelOrigin: 'gps_movement',
        bothKnown,
        approved: false,
        workRelevant,
        workRelevance: travelRelevance,
        travelClass,
        travelClassReason: reason,
        preWorkdayLeadIn: isLeadInToFirstAnchor,
        firstWorkAnchorAt: firstWorkAnchorMs ? new Date(firstWorkAnchorMs).toISOString() : null,
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

  // 10) Planerade assignments → "Planerad start" + ev. "Ingen app/GPS-signal"
  // Assignment är FÖRVÄNTAN, inte bevis. Om det inte finns någon
  // arbetssignal mellan planerad start och första bekräftade händelse,
  // emittera planned_signal_gap så UI kan visa "Kräver granskning".
  const plannedAssignments = input.plannedAssignments ?? [];
  if (plannedAssignments.length > 0) {
    // Första bekräftade arbetssignalen idag: workday.started_at, första timer/
    // tidrapport-start, eller första GPS-ping.
    const firstPingMs = sortedPings.length
      ? new Date(sortedPings[0].recorded_at).getTime()
      : null;
    const firstTimerMs = (() => {
      const candidates: number[] = [];
      for (const e of input.locationEntries) candidates.push(new Date(e.entered_at).getTime());
      for (const r of input.timeReports) candidates.push(new Date(r.start_iso).getTime());
      if (input.workday) candidates.push(new Date(input.workday.started_at).getTime());
      return candidates.length ? Math.min(...candidates) : null;
    })();
    const firstSignalMs = [firstPingMs, firstTimerMs]
      .filter((x): x is number => x != null)
      .reduce<number | null>((m, x) => (m == null || x < m ? x : m), null);

    for (const pa of plannedAssignments) {
      const plannedStartMs = new Date(pa.plannedStart).getTime();
      // OBS: planned_start emitteras INTE längre som ett event — planeringen
      // är ren förväntan och exponeras separat via model.planningItems så
      // den aldrig kan blandas in som faktisk händelse i tidslinjen.
      // Om första bekräftade signal saknas, eller är >15 min efter planerad
      // start → planned_signal_gap.
      const SIGNAL_GAP_MS = 15 * 60_000;
      if (firstSignalMs == null || firstSignalMs > plannedStartMs + SIGNAL_GAP_MS) {
        const gapEndIso = firstSignalMs != null
          ? new Date(firstSignalMs).toISOString()
          : (now > new Date(plannedStartMs) ? now.toISOString() : pa.plannedEnd ?? pa.plannedStart);
        const gapMin = Math.max(
          0,
          Math.round(((firstSignalMs ?? now.getTime()) - plannedStartMs) / 60_000),
        );
        events.push({
          id: `planned-gap:${pa.id}`,
          at: pa.plannedStart,
          until: gapEndIso,
          kind: 'planned_signal_gap',
          severity: 'warning',
          label: 'Ingen app/GPS-signal under planerad tid',
          detail: `Planerad start ${formatStockholmHm(pa.plannedStart)} på ${pa.label}, men ingen GPS-ping eller timer registrerad${firstSignalMs != null ? ` förrän ${formatStockholmHm(firstSignalMs)}` : ' under perioden'}.`,
          durationMin: gapMin,
          meta: {
            assignmentId: pa.id,
            plannedStart: pa.plannedStart,
            plannedEnd: pa.plannedEnd ?? null,
            firstSignalAt: firstSignalMs != null ? new Date(firstSignalMs).toISOString() : null,
            anomalyType: 'planned_time_without_signal',
            isEvidence: false,
            requiresReview: true,
            suggestedActions: [
              { id: 'create_workday_from_planned', label: `Skapa arbetsdag från planerad start ${formatStockholmHm(pa.plannedStart)}` },
              firstSignalMs != null
                ? { id: 'start_from_first_signal', label: `Starta från första GPS ${formatStockholmHm(firstSignalMs)}` }
                : null,
              { id: 'set_custom_start', label: 'Ange annan starttid' },
              { id: 'mark_absence', label: 'Markera frånvaro / ignorera planerad tid' },
            ].filter(Boolean),
          },
        });
      }
    }
  }

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  for (const ev of events) {
    if (ev.durationMin == null && ev.until) {
      ev.durationMin = minutesBetween(ev.at, ev.until);
    }
  }

  // ── ActualVisits (komprimerad form av PlaceVisit) ────────────────
  const knownSites = input.knownSites ?? [];
  const CANDIDATE_RADIUS_METERS = 150;
  const findNearestSites = (c: { lat: number; lng: number }): {
    nearest: NearestKnownSiteDebug | null;
    candidates: NearestKnownSiteDebug[];
  } => {
    if (!knownSites.length) return { nearest: null, candidates: [] };
    const all: NearestKnownSiteDebug[] = knownSites.map(s => {
      const d = haversineMeters({ lat: s.lat, lng: s.lng }, c);
      return {
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        radiusMeters: s.radiusMeters,
        distanceMeters: Math.round(d),
        outsideByMeters: Math.round(d - s.radiusMeters),
        autoLoginEligible: (s as any).autoLoginEligible ?? undefined,
        daysFromActiveWindow: (s as any).daysFromActiveWindow ?? undefined,
        activeWindowLabel: (s as any).activeWindowLabel ?? null,
      };
    }).sort((a, b) => a.distanceMeters - b.distanceMeters);
    const nearest = all[0] ?? null;
    const candidates = all.filter(s => s.distanceMeters <= CANDIDATE_RADIUS_METERS);
    return { nearest, candidates };
  };

  const actualVisits: ActualVisit[] = input.visits.map(v => {
    const accs = v.pings.map(p => (p.accuracy == null ? NaN : Number(p.accuracy))).filter(n => Number.isFinite(n));
    const avgAccuracy = accs.length ? Math.round((accs.reduce((s, n) => s + n, 0) / accs.length) * 10) / 10 : null;
    const isUnknown = !v.knownSite;
    const { nearest, candidates } = isUnknown ? findNearestSites(v.centre) : { nearest: null, candidates: [] };
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
      candidatesWithinRadius: candidates,
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

  // Föreslå ny workday-start om bekräftad arbetsplatsnärvaro finns FÖRE workday.
  // Endast `work_confirmed` (matchad känd plats / hård evidens) får tidigarelägga
  // workday — `work_possible` (≤800m, närliggande), okänd adress, hem, travel
  // och rena GPS-pings räknas ALDRIG. Se isConfirmedWorksitePresence + memo:
  // [Time Data Authority] / [Confirmed Worksite Presence v1].
  let proposedWorkdayStart = input.workday?.started_at ?? null;
  let proposedWorkdayEnd = input.workday?.ended_at ?? null;
  const anomalies: ProposedAnomaly[] = [];

  if (input.workday) {
    const wdStartMs = new Date(input.workday.started_at).getTime();
    // Pre-workday anomaly får ENDAST baseras på första BEKRÄFTADE arbetsplats-
    // visit (work_confirmed). Närliggande/okända/privata visits ignoreras helt
    // för auto-justeringen — de visas separat som "Okänd vistelse under
    // arbetsdag – kräver granskning" om de ligger inom workday-fönstret.
    const earliestConfirmedWorksiteVisit = actualVisits.find(v => {
      const r = visitRelevance.get(v.key);
      return r === 'work_confirmed';
    });
    if (
      earliestConfirmedWorksiteVisit
      && new Date(earliestConfirmedWorksiteVisit.start).getTime() < wdStartMs - 5 * 60_000
    ) {
      // Hard work-evidence i pre-workday-fönstret = timer, time_report eller
      // assistant_event ANTINGEN inom visiten ELLER mellan visit-start och
      // workday-start. Bara känd plats räknas INTE — en GPS-vistelse på FA
      // Warehouse 00:00–07:00 ska inte göra hela natten till arbetstid bara
      // för att platsen är känd.
      const visitStartMs = new Date(earliestConfirmedWorksiteVisit.start).getTime();
      const preWindowEndMs = wdStartMs;
      const preWindowStartMs = visitStartMs;
      const overlapsPreWindow = (s: number, e: number) =>
        s < preWindowEndMs && e > preWindowStartMs;
      const hasHardEvidenceBeforeWorkday =
        timerWindows.some(w => overlapsPreWindow(w.s, w.e))
        || trWindows.some(w => overlapsPreWindow(w.s, w.e))
        || assistantTimes.some(t => t >= preWindowStartMs && t <= preWindowEndMs);

      anomalies.push({
        id: `pre-wd:${earliestConfirmedWorksiteVisit.key}`,
        label: 'Bekräftad arbetsplats före arbetsdagens start',
        detail: `Vistelse på ${earliestConfirmedWorksiteVisit.label} ${formatStockholmHm(earliestConfirmedWorksiteVisit.start)} — workday startade ${formatStockholmHm(input.workday.started_at)}.`,
        severity: 'warning',
        suggestion: hasHardEvidenceBeforeWorkday
          ? `Start automatiskt justerad från ${formatStockholmHm(input.workday.started_at)} till ${formatStockholmHm(earliestConfirmedWorksiteVisit.start)} baserat på bekräftad projektnärvaro.`
          : `GPS visade aktivitet på ${earliestConfirmedWorksiteVisit.label} före arbetsdagens start, men inga timers eller tidrapporter stödjer arbete under den tiden. Justera arbetsdagens start manuellt om det var arbete, annars ignorera.`,
      });
      // Idempotent auto-justering: bara om
      //   1) hård bevisning finns,
      //   2) workday inte är godkänd/låst (admin-override skyddas av
      //      reportState.workday.review_status / approved_at i UI-lagret),
      //   3) ny start faktiskt är tidigare än existerande start.
      if (
        hasHardEvidenceBeforeWorkday
        && earliestConfirmedWorksiteVisit.start < input.workday.started_at
      ) {
        proposedWorkdayStart = earliestConfirmedWorksiteVisit.start;
      }
    }
  }

  // Planerad tid utan signal → anomaly per assignment.
  for (const ev of events) {
    if (ev.kind !== 'planned_signal_gap') continue;
    const meta = (ev.meta ?? {}) as any;
    const plannedStartIso: string = meta.plannedStart ?? ev.at;
    const firstSignalIso: string | null = meta.firstSignalAt ?? null;
    const gapMin = ev.durationMin ?? (firstSignalIso
      ? Math.max(0, Math.round((new Date(firstSignalIso).getTime() - new Date(plannedStartIso).getTime()) / 60_000))
      : 0);
    anomalies.push({
      id: `planned-gap:${meta.assignmentId ?? ev.at}`,
      label: 'Planerad tid utan GPS/app-signal',
      detail: ev.detail ?? '',
      severity: 'warning',
      suggestion: 'Kräver granskning – välj: skapa arbetsdag från planerad start, starta från första GPS, ange annan starttid eller markera frånvaro.',
      action: {
        kind: 'planned_time_without_signal',
        assignmentId: meta.assignmentId ?? null,
        plannedStartIso,
        firstSignalIso,
        noSignalGapMinutes: gapMin,
        label: ev.place ?? ev.label ?? 'Planerad aktivitet',
      },
    });
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

  // Beslutsmatris för arbetsstart (Case A–E).
  const firstSignalIsoForDecision = (() => {
    const candidates: number[] = [];
    if (sortedPings.length) candidates.push(new Date(sortedPings[0].recorded_at).getTime());
    for (const e of input.locationEntries) candidates.push(new Date(e.entered_at).getTime());
    for (const r of input.timeReports) candidates.push(new Date(r.start_iso).getTime());
    if (input.workday) candidates.push(new Date(input.workday.started_at).getTime());
    if (!candidates.length) return null;
    return new Date(Math.min(...candidates)).toISOString();
  })();
  const earliestPlannedStartIso = (input.plannedAssignments ?? []).length
    ? (input.plannedAssignments ?? [])
        .map(a => a.plannedStart)
        .sort()[0] ?? null
    : null;
  const workStartDecision = classifyWorkStart({
    visits: input.visits,
    travels: input.travels,
    plannedAssignments: input.plannedAssignments ?? [],
    privateZones: input.privateZones ?? [],
    visitRelevance,
    earliestPlannedStartIso,
    firstSignalIso: firstSignalIsoForDecision,
  });

  return {
    date: input.date,
    actualEvents: events,
    planningItems: (input.plannedAssignments ?? []).map(pa => ({
      id: `planning:${pa.id}`,
      assignmentId: pa.id,
      label: pa.label,
      plannedStart: pa.plannedStart,
      plannedEnd: pa.plannedEnd ?? null,
      source: 'planning' as const,
    })),
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
    workStartDecision,
  };
}
