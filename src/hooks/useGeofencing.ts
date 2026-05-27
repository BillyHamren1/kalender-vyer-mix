/**
 * useGeofencing — GPS SIGNAL LAYER (not a controller).
 * ====================================================
 *
 * UNIFIED MODEL (Tidappen):
 *   1. Dagtimer (workday) = HUVUDSPÅR. Startas av manuell "Starta dagen"
 *      eller riktig geofence/start-action via useTimerStartFlow.
 *   2. Aktivitetstid (projekt/plats/bokning) = INUTI dagen. Geofence
 *      enter/exit kan trigga start/stopp av aktivitet — men aktivitet
 *      definierar aldrig dagen.
 *   3. "Avsluta dagen" = SEPARAT, explicit handling (useWorkDay.end).
 *      Geofence får aldrig själv avsluta workday som sidoeffekt.
 *   4. Geofence = SIGNAL. Central start/stop-logik = ACTION.
 *
 * Responsibility split — read this before editing:
 *
 *   • useGeofencing  →  SIGNAL.   Detects enter/exit, emits assistant /
 *                                  audit events (`workplace-exit`, anomaly
 *                                  open/close, departure reports), and
 *                                  delegates real action to autoActionsRef.
 *                                  It MUST NOT call workdayApi/start, must
 *                                  not write time_reports, must not own
 *                                  the workday lifecycle.
 *
 *   • useTimerStartFlow → DECISION/ACTION for START.  performStart
 *                         guarantees workday-first via ensureWorkDayActive
 *                         and routes through evaluateStartConflict +
 *                         distance check before startSession.
 *
 *   • useWorkSession.stopSession → DECISION/ACTION for STOP. Owns break
 *                         prompt + save-then-stop + time_report write.
 *                         Stoppar ENBART aktiviteten — aldrig workday.
 *
 *   • useWorkDay / workdays table → SOURCE OF TRUTH for the workday.
 *                         Activity timers are SECONDARY segments on top
 *                         of the workday and never define it.
 *
 * The three exposed stop verbs (saveAndStopTimer / stopLocationTimerWithoutReport
 * / cancelPendingTimer) are LOW-LEVEL primitives consumed exclusively by
 * useWorkSession — feature code must not call them directly (locked by
 * timerStopApi.contract.test.ts).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { mobileApi, MobileBooking } from '@/services/mobileApiService';
import { PendingArrival, clearPendingArrivals } from '@/hooks/useBackgroundLocationReporter';
import { enqueueTimerStart, removeFromQueue, isTimerPendingSync } from '@/services/timerSyncQueue';
import { enqueueLocationPoint, flushLocationQueue } from '@/services/locationSyncQueue';
import { STOP_TRAVEL_EVENT, type StopTravelEventDetail } from '@/hooks/useTravelDetection';
import {
  shouldTriggerEnter as evalShouldEnter,
  shouldTriggerExit as evalShouldExit,
  isInsideGeofence,
  GEOFENCE_MAX_ACCURACY_M,
} from '@/lib/geofenceEval';
// NOTE: 'autoStartWorkDay' import deliberately removed (2026-04).
// Geofence is a SIGNAL — not a workday/timer controller. Workday-first
// is enforced centrally by useTimerStartFlow.performStart →
// ensureWorkDayActive, which runs inside the same tryStartFromArrival
// call we already invoke via autoActionsRef.start. Letting geofence ALSO
// fire its own workday/start race-conditions with that path and creates
// duplicate audit notes. See useTimerStartFlow for the canonical flow.
import {
  computePlannedDaySignals,
  decideExitAction,
  type ExitDecision,
} from '@/lib/workday/plannedDay';
import {
  recordEnter as recordSubdivisionEnter,
  recordExit as recordSubdivisionExit,
} from '@/lib/projectAddressVisits';
import { getLocalIsoDate, isBookingPlannedOnDate } from '@/lib/mobileBookingPlanning';
import {
  createExitTracker,
  resetExitTracker,
  recordExitPing,
  evaluateStableExit,
  buildExitMetadata,
  type ExitTrackerState,
  type ExitEvaluation,
} from '@/lib/geofence/stableExit';
import {
  createEntryTracker,
  resetEntryTracker,
  recordEntryPing,
  evaluateStableEntry,
  buildEntryMetadata,
  firstReliableArrivalTs,
  type EntryTrackerState,
  type EntryEvaluation,
} from '@/lib/geofence/stableEntry';
import { recordDismissCooldown } from '@/lib/geofence/dismissCooldown';
import { Capacitor } from '@capacitor/core';

/**
 * Fire the cross-hook signal that ends an open `travel_time_logs` row.
 * Called from every geofence ENTER on a known workplace (warehouse,
 * project, booking) so a trip ALWAYS ends at a real arrival, never on
 * low GPS speed at an unknown address.
 */
const emitStopTravelOnArrival = (lat: number, lng: number) => {
  const detail: StopTravelEventDetail = { lat, lng, auto: true };
  window.dispatchEvent(new CustomEvent(STOP_TRAVEL_EVENT, { detail }));
};

export const ENTER_RADIUS = 150; // meters
const EXIT_RADIUS = 200;  // hysteresis to avoid flapping
const TIMERS_KEY = 'eventflow-mobile-timers';
const GPS_SETTINGS_KEY = 'eventflow-mobile-gps-settings';
const GEOFENCE_TARGETS_KEY = 'eventflow-geofence-targets';
const PENDING_ARRIVALS_KEY = 'eventflow-pending-arrivals';

// ─────────────────────────────────────────────────────────────────────
// AUTO-FIRST CALLBACKS (Auto-first 2026-04)
//
// `useGeofencing` mountas på flera ställen i appen och får INTE känna
// till `useTimerStartFlow` / `useWorkSession` direkt (cirkulära deps).
// Lösning: en singleton-registry. `MobileGlobalOverlays` registrerar
// auto-start och auto-stop EN GÅNG vid mount; geofence-effekten anropar
// dem från ENTER/EXIT-grenarna. Saknas registrering → inga auto-actions
// (säker default; faller tillbaka på prompten).
// ─────────────────────────────────────────────────────────────────────
export interface AutoStartActivityArgs {
  kind: 'location' | 'project' | 'booking';
  targetId: string;
  label: string;
  /** Useful for assistant_event audit only — server uses arrived_at it stored. */
  arrivedAtIso: string;
  /**
   * True if this target is planned/assigned for today (booking on rig/event/
   * down/assignment_dates, or sub-booking of a large project today). Locations
   * are always considered "known workplaces" → planned=true.
   * Drives confidence + "oplanerad aktivitet" tagging on the auto-start.
   */
  isPlannedToday: boolean;
  /** Stable-entry audit fields. Persisted in assistant_events metadata. */
  arrivalPingsCount?: number;
  firstArrivalPingAtIso?: string;
  arrivalDwellMs?: number;
}
export interface AutoStartActivityOutcome {
  /**
   * Aligned with useTimerStartFlow.StartStatus. Geofence-paths only need to
   * distinguish "real progress" (started/already_running) from defer/abort.
   */
  status:
    | 'started'
    | 'already_running'
    | 'workday_failed'
    | 'conflict'
    | 'awaiting_distance_confirmation'
    | 'start_failed';
}
export type AutoStartActivityFn =
  (args: AutoStartActivityArgs) => Promise<AutoStartActivityOutcome>;
export interface AutoStopActivityArgs {
  /** ActiveTimer key (booking.id, project-<id>, location-<id>). */
  key: string;
  exitedAtIso: string;
}
export type AutoStopActivityFn = (args: AutoStopActivityArgs) => Promise<void>;

const autoActionsRef: {
  start: AutoStartActivityFn | null;
  stop: AutoStopActivityFn | null;
} = { start: null, stop: null };

export function registerGeofenceAutoActions(actions: {
  start: AutoStartActivityFn;
  stop: AutoStopActivityFn;
}): () => void {
  autoActionsRef.start = actions.start;
  autoActionsRef.stop = actions.stop;
  return () => {
    autoActionsRef.start = null;
    autoActionsRef.stop = null;
  };
}

export interface ActiveTimer {
  bookingId: string;
  client: string;
  startTime: string; // ISO
  isAutoStarted: boolean;
  establishmentTaskId?: string;
  establishmentTaskTitle?: string;
  locationId?: string;       // if this is a fixed-location timer
  locationName?: string;
  largeProjectId?: string;   // if this is a project timer
  isStale?: boolean;         // older than 24h with no server match — needs user action
  staleReason?: 'age' | 'no_server_match';
  /** Server has not yet confirmed the start. Banner should show "Synkroniserar…". */
  pendingSync?: boolean;
  /** Server-side id of the matching open location_time_entries row, once confirmed. */
  serverEntryId?: string;
}

export interface GeofenceEvent {
  type: 'enter' | 'exit';
  booking?: MobileBooking;
  distance: number;
  locationType?: 'booking' | 'fixed' | 'project';
  locationId?: string;
  locationName?: string;
  locationAddress?: string;
  largeProjectId?: string;
  largeProjectName?: string;
  largeProjectAddress?: string;
  arrivalTimestamp?: number;
}

export interface OrganizationLocationMobile {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  show_as_project?: boolean;
  geofence_mode?: 'circle' | 'polygon';
  geofence_polygon?: { type: 'Polygon'; coordinates: number[][][] } | null;
  /**
   * Privata bostadsplatser (t.ex. "Boende - Vällsta") fungerar som
   * "stäng-av-dagen-zon": ingen auto-arrival/start, och om man går IN
   * i polygonen med en aktiv timer triggas End-Of-Day-flödet.
   */
  location_type?: string | null;
  is_private_residence?: boolean | null;
  privacy_level?: string | null;
}

interface GpsSettings {
  enabled: boolean;
  radius: number;
}

export interface GpsPosition {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  timestamp: number;
}

// Haversine distance in meters
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function loadTimers(): Map<string, ActiveTimer> {
  try {
    const raw = localStorage.getItem(TIMERS_KEY);
    if (!raw) return new Map();
    const arr: [string, ActiveTimer][] = JSON.parse(raw);
    const map = new Map(arr);

    // Per architectural decision: NEVER silently delete stale timers.
    // Flag them so the user can decide (save / discard).
    const staleThreshold = Date.now() - 24 * 60 * 60 * 1000;
    for (const [key, timer] of map) {
      if (new Date(timer.startTime).getTime() < staleThreshold && !timer.isStale) {
        map.set(key, { ...timer, isStale: true, staleReason: 'age' });
        console.warn('[Geofence] Flagged stale timer (>24h):', key, timer.startTime);
      }
    }

    return map;
  } catch {
    return new Map();
  }
}

function saveTimers(timers: Map<string, ActiveTimer>) {
  localStorage.setItem(TIMERS_KEY, JSON.stringify(Array.from(timers.entries())));
}

/**
 * Wipe the local active-timer cache + all related sidecar state.
 *
 * Called on logout / user switch so user A's cached timers can never
 * be displayed under user B's session, and so background-arrival
 * payloads from a previous session don't auto-trigger for the new user.
 *
 * SAFETY: this is a local-only wipe. Server-side open entries remain
 * authoritative and will be re-restored on the next mount via the
 * `getLocationTimeEntries` query in useGeofencing.
 */
export function clearLocalTimerSession() {
  localStorage.removeItem(TIMERS_KEY);
  localStorage.removeItem(GEOFENCE_TARGETS_KEY);
  localStorage.removeItem(PENDING_ARRIVALS_KEY);
  localStorage.removeItem('eventflow-pending-stop');
  // Notify any listening hook/banner so they re-read storage immediately.
  window.dispatchEvent(new Event('timer-state-changed'));
}

export function getGpsSettings(): GpsSettings {
  try {
    const raw = localStorage.getItem(GPS_SETTINGS_KEY);
    if (!raw) return { enabled: true, radius: ENTER_RADIUS };
    return JSON.parse(raw);
  } catch {
    return { enabled: true, radius: ENTER_RADIUS };
  }
}

export function setGpsSettings(settings: GpsSettings) {
  localStorage.setItem(GPS_SETTINGS_KEY, JSON.stringify(settings));
}

export function useGeofencing(bookings: MobileBooking[], staffId?: string) {
  const [activeTimers, setActiveTimers] = useState<Map<string, ActiveTimer>>(loadTimers);
  const [userPosition, setUserPosition] = useState<GpsPosition | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  // Time Legacy Purge 6 — geofenceEvent är intern signal/telemetri. Ingen
  // komponent renderar längre den som popup (GeofencePrompt borttagen). GPS
  // skickar pings/evidence; Time Engine tolkar närvaron i efterhand.
  const [geofenceEvent, setGeofenceEvent] = useState<GeofenceEvent | null>(null);
  const [nearbyBookings, setNearbyBookings] = useState<(MobileBooking & { distance: number })[]>([]);
  const [orgLocations, setOrgLocations] = useState<OrganizationLocationMobile[]>([]);

  const watchIdRef = useRef<number | null>(null);
  const triggeredEnterRef = useRef<Set<string>>(new Set());
  const triggeredExitRef = useRef<Set<string>>(new Set());
  // Private-residence "kill switch" — minns vilka hemzoner vi redan har
  // dispatchat End-Of-Day för under aktuellt besök. Rensas vid utträde.
  const triggeredHomeEndDayRef = useRef<Set<string>>(new Set());
  const lastLocationReportRef = useRef<number>(0);
  const staffIdRef = useRef(staffId);
  const activeTimersRef = useRef(activeTimers);

  // ── Departure-promotion (Auto-first 2026-04) ──────────────────────
  // Spårar enter-tidpunkt per geofence-target. När user lämnar och varit
  // inne ≥5 min → rapportera departure-event som AUDIT (assistant_events).
  // Den faktiska activity-stoppen sker via autoActionsRef.stop i EXIT-
  // grenarna nedan; departure-eventet är endast review-/audit-underlag.
  const DEPARTURE_DWELL_MS = 5 * 60 * 1000;
  const dwellTrackerRef = useRef<Map<string, {
    enteredAtMs: number;
    kind: 'location' | 'project' | 'booking';
    targetId: string;
    label: string | null;
    reported: boolean;
  }>>(new Map());

  // ── Stable-exit tracker (Auto-stop hardening 2026-05) ────────────
  // En enskild GPS-punkt utanför radien får ALDRIG stoppa en
  // activity-timer. Vi samlar konsekutiva outside-pings per target
  // och kräver stabilitet (se lib/geofence/stableExit.ts).
  // Workdayen rörs aldrig av geofence — endast aktivitetstimern.
  const exitTrackersRef = useRef<Map<string, ExitTrackerState>>(new Map());
  const getExitTracker = (key: string): ExitTrackerState => {
    let t = exitTrackersRef.current.get(key);
    if (!t) {
      t = createExitTracker();
      exitTrackersRef.current.set(key, t);
    }
    return t;
  };

  // ── Stable-entry tracker (Auto-start hardening 2026-05) ──────────
  // En enskild inside-ping (GPS-spike) får ALDRIG starta workday/timer.
  // Vi samlar konsekutiva inside-pings per target och kräver stabilitet
  // (≥3 pings ELLER ≥2 min dwell, rimlig accuracy).
  const entryTrackersRef = useRef<Map<string, EntryTrackerState>>(new Map());
  const getEntryTracker = (key: string): EntryTrackerState => {
    let t = entryTrackersRef.current.get(key);
    if (!t) {
      t = createEntryTracker();
      entryTrackersRef.current.set(key, t);
    }
    return t;
  };

  const noteEnterForDeparture = useCallback((
    key: string,
    kind: 'location' | 'project' | 'booking',
    targetId: string,
    label: string | null,
  ) => {
    const existing = dwellTrackerRef.current.get(key);
    if (existing && !existing.reported) return;
    dwellTrackerRef.current.set(key, {
      enteredAtMs: Date.now(),
      kind, targetId, label, reported: false,
    });
  }, []);

  const maybeReportDeparture = useCallback((key: string, exitedAtIso: string) => {
    const tracked = dwellTrackerRef.current.get(key);
    if (!tracked || tracked.reported) return;
    const dwellMs = new Date(exitedAtIso).getTime() - tracked.enteredAtMs;
    if (dwellMs < DEPARTURE_DWELL_MS) {
      dwellTrackerRef.current.delete(key);
      return;
    }
    tracked.reported = true;
    const dwellMin = Math.round(dwellMs / 60000);
    mobileApi
      .reportDeparture({
        kind: tracked.kind,
        target_id: tracked.targetId,
        target_label: tracked.label,
        departed_at: exitedAtIso,
        dwell_minutes: dwellMin,
      })
      .catch((err) => console.warn('[Departure] report failed:', err?.message || err));
  }, []);

  // Keep refs in sync
  useEffect(() => { staffIdRef.current = staffId; }, [staffId]);
  useEffect(() => { activeTimersRef.current = activeTimers; }, [activeTimers]);

  // Reset triggered refs when staffId changes (new login session)
  useEffect(() => {
    if (staffId) {
      console.log('[Geofence] New session for staff:', staffId, '— resetting triggered refs');
      triggeredEnterRef.current.clear();
      triggeredExitRef.current.clear();
    }
  }, [staffId]);

  // Persist timers on change and notify global banner
  useEffect(() => {
    saveTimers(activeTimers);
    window.dispatchEvent(new Event('timer-state-changed'));
  }, [activeTimers]);

  // Sync from external changes (e.g. global banner stopping a timer)
  useEffect(() => {
    const handler = () => {
      const stored = loadTimers();
      if (stored.size !== activeTimersRef.current.size) {
        setActiveTimers(stored);
      }
    };
    window.addEventListener('timer-state-changed', handler);
    return () => window.removeEventListener('timer-state-changed', handler);
  }, []);

  // Fetch organization locations once, then restore any active server-side timers
  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;

    (async () => {
      try {
        // Fetch org locations
        const locRes = await mobileApi.getOrganizationLocations();
        if (cancelled) return;
        const locations = locRes.locations || [];
        setOrgLocations(locations);

        // Fetch open (active) location_time_entries from server.
        // ROBUSTHET: använd ett fönster på 2 dygn (igår + idag) så att en
        // timer som startades sent kvällen innan en app-restart strax efter
        // midnatt fortfarande hittas. Server-radens entry_date är yesterday
        // även om vi just nu är klockan 00:30 idag.
        const today = new Date();
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const dateFrom = yesterday.toISOString().split('T')[0];
        const entriesRes = await mobileApi.getLocationTimeEntriesLegacy({ date_from: dateFrom, limit: 50 });
        if (cancelled) return;
        const openEntries = (entriesRes.entries || []).filter((e: any) => !e.exited_at);

        // Only restore user-confirmed (manual) timers, NOT auto-GPS entries
        const manualEntries = openEntries.filter((e: any) => e.source !== 'gps');

        // Restore ALL three timer types from server (architectural decision:
        // server is source of truth — local map is just a cache).
        if (manualEntries.length > 0) {
          setActiveTimers(prev => {
            const next = new Map(prev);
            for (const entry of manualEntries) {
              let key: string | null = null;
              const patch: Partial<ActiveTimer> = {
                startTime: entry.entered_at,
                isAutoStarted: false,
                serverEntryId: entry.id,
                pendingSync: false,
              };
              if (entry.location_id) {
                key = `location-${entry.location_id}`;
                const loc = locations.find((l: any) => l.id === entry.location_id);
                patch.client = loc?.name || 'Plats';
                patch.locationId = entry.location_id;
                patch.locationName = loc?.name || 'Plats';
              } else if (entry.large_project_id) {
                key = `project-${entry.large_project_id}`;
                patch.client = 'Projekt';
                patch.largeProjectId = entry.large_project_id;
              } else if (entry.booking_id) {
                key = entry.booking_id;
                patch.client = 'Uppdrag';
              }
              if (!key) continue;
              const existing = next.get(key);
              if (existing) {
                // Local timer exists — adopt server start time + server id, but keep local label.
                next.set(key, { ...existing, ...patch, client: existing.client });
              } else {
                next.set(key, { bookingId: key, ...patch } as ActiveTimer);
              }
              triggeredEnterRef.current.add(key);
            }
            return next;
          });
          console.log('[Geofence] Restored', manualEntries.length, 'active timers from server');
        }

        // RECOVERY SWEEP (PROMPT 3 hardening): clear stuck pendingSync flags
        // for local timers that are NOT on the server AND NOT in the local
        // sync queue — those flags can otherwise stay forever if a sync
        // confirmation event was dispatched before the listener was mounted.
        // Doing this AFTER the server restore guarantees we don't accidentally
        // unflag a timer that's genuinely still mid-flight in the queue.
        const serverKeys = new Set<string>();
        for (const e of manualEntries) {
          if (e.location_id) serverKeys.add(`location-${e.location_id}`);
          else if (e.large_project_id) serverKeys.add(`project-${e.large_project_id}`);
          else if (e.booking_id) serverKeys.add(e.booking_id);
        }
        setActiveTimers(prev => {
          let mutated = false;
          const next = new Map(prev);
          for (const [k, t] of prev) {
            if (t.pendingSync && !serverKeys.has(k) && !isTimerPendingSync(k)) {
              next.set(k, { ...t, pendingSync: false });
              mutated = true;
              console.warn('[Geofence] Cleared stuck pendingSync for orphan timer:', k);
            }
          }
          return mutated ? next : prev;
        });
      } catch (err) {
        console.warn('Failed to fetch org locations / active timers:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [staffId]);

  // Cache geofence targets to localStorage for background geofence checks
  useEffect(() => {
    const targets: Array<{
      key: string;
      name: string;
      type: 'fixed' | 'project' | 'booking';
      lat: number;
      lng: number;
      radius: number;
      locationId?: string;
      largeProjectId?: string;
      bookingId?: string;
      address?: string;
    }> = [];

    // Add fixed locations
    for (const loc of orgLocations) {
      targets.push({
        key: `location-${loc.id}`,
        name: loc.name,
        type: 'fixed',
        lat: loc.latitude,
        lng: loc.longitude,
        radius: loc.radius_meters,
        locationId: loc.id,
        address: loc.address || undefined,
      });
    }

    // Add bookings with coordinates — consolidate large projects
    const seenProjects = new Set<string>();
    for (const booking of bookings) {
      if (!booking.delivery_latitude || !booking.delivery_longitude) continue;

      if (booking.large_project_id && booking.large_project_name) {
        if (seenProjects.has(booking.large_project_id)) continue;
        seenProjects.add(booking.large_project_id);
        targets.push({
          key: `project-${booking.large_project_id}`,
          name: booking.large_project_name,
          type: 'project',
          lat: booking.delivery_latitude,
          lng: booking.delivery_longitude,
          radius: getGpsSettings().radius || ENTER_RADIUS,
          largeProjectId: booking.large_project_id,
          address: booking.deliveryaddress || undefined,
        });
      } else {
        targets.push({
          key: booking.id,
          name: booking.client,
          type: 'booking',
          lat: booking.delivery_latitude,
          lng: booking.delivery_longitude,
          radius: getGpsSettings().radius || ENTER_RADIUS,
          bookingId: booking.id,
          address: booking.deliveryaddress || undefined,
        });
      }
    }

    localStorage.setItem(GEOFENCE_TARGETS_KEY, JSON.stringify(targets));
  }, [orgLocations, bookings]);

  // Read pending arrivals from background geofence on mount / staffId change
  useEffect(() => {
    if (!staffId) return;

    try {
      const raw = localStorage.getItem(PENDING_ARRIVALS_KEY);
      if (!raw) return;
      const pendingArrivals: PendingArrival[] = JSON.parse(raw);
      if (pendingArrivals.length === 0) return;

      // Process the first pending arrival (queue the rest by keeping them in localStorage)
      const arrival = pendingArrivals[0];

      // Skip if timer is already running for this key
      if (activeTimersRef.current.has(arrival.key)) {
        clearPendingArrivals([arrival.key]);
        return;
      }

      // Mark as triggered so live geofence doesn't re-fire
      triggeredEnterRef.current.add(arrival.key);

      // Create geofence event with the real background arrival timestamp
      const event: GeofenceEvent = {
        type: 'enter',
        distance: 0, // We don't have exact distance from background
        arrivalTimestamp: arrival.timestamp,
        locationType: arrival.type === 'fixed' ? 'fixed' : arrival.type === 'project' ? 'project' : 'booking',
        locationId: arrival.locationId,
        locationName: arrival.name,
        locationAddress: arrival.address,
        largeProjectId: arrival.largeProjectId,
        largeProjectName: arrival.type === 'project' ? arrival.name : undefined,
        largeProjectAddress: arrival.type === 'project' ? arrival.address : undefined,
      };

      // For booking type, try to find the booking object
      if (arrival.type === 'booking' && arrival.bookingId) {
        const booking = bookings.find(b => b.id === arrival.bookingId);
        if (booking) {
          event.booking = booking;
        }
      }

      // For project type, find a representative booking
      if (arrival.type === 'project' && arrival.largeProjectId) {
        const booking = bookings.find(b => b.large_project_id === arrival.largeProjectId);
        if (booking) {
          event.booking = booking;
        }
      }

      setGeofenceEvent(event);

      // Remove this arrival from pending (keep others for next cycle)
      clearPendingArrivals([arrival.key]);

      console.log('[Geofence] Restored pending arrival:', arrival.name, 'from', new Date(arrival.timestamp).toLocaleTimeString('sv-SE'));
    } catch (err) {
      console.warn('[Geofence] Failed to read pending arrivals:', err);
    }
  }, [staffId, bookings]);

  // Single consolidated GPS watcher.
  // NATIVE GUARD: on iOS/Android the @capgo/background-geolocation engine
  // owned by useBackgroundLocationReporter is the SOLE GPS source — do not
  // start a second navigator.geolocation.watchPosition here (would burn
  // battery and create racey state). Web/PWA still uses the foreground watcher.
  useEffect(() => {
    const settings = getGpsSettings();
    if (!settings.enabled || !navigator.geolocation) return;
    if (Capacitor.isNativePlatform()) {
      setIsTracking(true); // background reporter is the source of truth
      return;
    }

    setIsTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, speed } = pos.coords;
        const gpsPos: GpsPosition = {
          lat: latitude,
          lng: longitude,
          accuracy: accuracy ?? null,
          speed: speed ?? null,
          timestamp: Date.now(),
        };
        setUserPosition(gpsPos);
        setIsTracking(true); // Restore tracking state on successful position

        // Throttled location report (max every 30s)
        const now = Date.now();
        if (now - lastLocationReportRef.current >= 30000) {
          lastLocationReportRef.current = now;
          const currentStaffId = staffIdRef.current;
          if (currentStaffId) {
            enqueueLocationPoint({
              latitude,
              longitude,
              accuracy: accuracy ?? null,
              speed: speed ?? null,
              source: 'foreground',
            });
            // Ingen direkt flush — 10-min batch sköter upload.
          }
        }
      },
      (err) => {
        console.warn('GPS error:', err.message);
        // Only mark tracking as failed on permission denied (code 1)
        // Timeout (code 3) and unavailable (code 2) are temporary
        if (err.code === 1) {
          setIsTracking(false);
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTracking(false);
    };
  }, []); // Single watcher, refs used for current values

  // ── GEOFENCE ENTER/EXIT CONTRACT (Tidappen, Auto-first 2026-04) ───────
  //
  // Geofence ENTER = "användaren har kommit till en riktig arbetsplats".
  // Den hanteras ALLTID i denna ordning, oavsett target (project / booking /
  // location):
  //
  //   1. Confidence-gate FÖRST. Vi startar inget automatiskt om matchen
  //      inte är tillförlitlig:
  //        • bookings/projects  → kräver att användaren är assigned IDAG
  //          (`isAssignedToday`). Att bara råka passera adressen räknas
  //          inte som arrival.
  //        • fixed locations    → kräver `accuracyOk` (GPS accuracy under
  //          GEOFENCE_MAX_ACCURACY_M) + hysteresis via `evalShouldEnter`.
  //      Faller gaten → vi startar varken workday eller aktivitet. Vi kan
  //      logga assistant-event för review, men gör ingen autostart.
  //
  //   2. Delegera start till central action (`autoActionsRef.start`), som
  //      i sin tur går genom useTimerStartFlow.tryStartFromArrival. Den
  //      vägen säkerställer:
  //        a) Workday-first: `ensureWorkDayActive()` körs FÖRST.
  //           - Ingen dag aktiv → starta dag.
  //           - Dag redan aktiv → no-op (server idempotent + lokal dedupe).
  //           Misslyckas workday → aktivitet startas INTE.
  //        b) Aktivitet startas för rätt target (project | booking | location).
  //        c) Konfliktlogik: redan aktiv för exakt samma target = duplicate
  //           (no-op). Annan timer aktiv = TimerConflictDialog.
  //      → Ingen dubbelstart av workday och inga parallella aktiva timers.
  //
  // Denna hook äger ENDAST signal-sidan (detect + delegate). Den startar
  // aldrig workday själv och skriver inte time_reports direkt.
  //
  // EXIT-grenarna stoppar löpande activity via autoActionsRef.stop och
  // skickar `workplace-exit`-event för downstream-beslut. Att stoppa en
  // aktivitet avslutar ALDRIG workdayen (det är "Avsluta dagen", separat).
  useEffect(() => {
    if (!userPosition) return;

    const settings = getGpsSettings();
    const enterRadius = settings.radius || ENTER_RADIUS;
    const exitRadius = enterRadius + 50;

    const nearby: (MobileBooking & { distance: number })[] = [];

    // Background anomaly helpers (fire-and-forget, no UI)
    const fireAnomalyStart = (params: { locationId?: string; bookingId?: string; largeProjectId?: string }) => {
      mobileApi.startAnomaly({
        location_id: params.locationId,
        booking_id: params.bookingId,
        large_project_id: params.largeProjectId,
        started_at: new Date().toISOString(),
      }).catch(err => console.warn('[Anomaly] start failed:', err?.message || err));
    };
    const fireAnomalyStop = (params: { locationId?: string; bookingId?: string }) => {
      mobileApi.stopAnomaly({
        location_id: params.locationId,
        booking_id: params.bookingId,
        ended_at: new Date().toISOString(),
      }).catch(err => console.warn('[Anomaly] stop failed:', err?.message || err));
    };

    // ── STABLE-EXIT EVALUATION (Auto-stop hardening 2026-05) ────────
    // En enskild GPS-punkt utanför radien får ALDRIG stoppa en timer.
    // Vi loggar outside-pingen i per-target-trackern och frågar
    // evaluateStableExit om vi har en stabil exit. Endast 'stable'
    // tillåter auto-stop. 'insufficient' / 'unstable' → emittera
    // assistant_event review_departure och låt timern fortsätta.
    // 'no_signal' → gör ingenting alls.
    // VIKTIGT: workdayen rörs aldrig härifrån — bara aktivitetstimern.
    const lastPingAgeMs = userPosition?.timestamp
      ? Date.now() - userPosition.timestamp
      : null;

    const evaluateExit = (
      key: string,
      dist: number,
    ): ExitEvaluation => {
      const tracker = getExitTracker(key);
      recordExitPing(tracker, {
        ts: Date.now(),
        distance: dist,
        accuracy: userPosition?.accuracy ?? null,
      });
      return evaluateStableExit(tracker, Date.now(), lastPingAgeMs);
    };

    const emitReviewDeparture = (params: {
      kind: 'location' | 'project' | 'booking';
      targetId: string;
      label: string | null;
      ev: ExitEvaluation;
    }) => {
      try {
        mobileApi.assistantEvents
          .create({
            event_type: 'departure',
            target_type: params.kind,
            target_id: params.targetId,
            target_label: params.label,
            happened_at: new Date().toISOString(),
            source: 'geofence',
            suggested_action: 'review_departure',
            metadata: {
              ...buildExitMetadata(params.ev),
              note: 'Möjlig lämning — instabil GPS-signal, timer stoppades inte automatiskt',
            },
          })
          .catch((err) =>
            console.warn('[Geofence] review_departure emit failed:', err?.message || err),
          );
      } catch (err) {
        console.warn('[Geofence] review_departure emit threw:', err);
      }
    };

    // ── STABLE-ENTRY EVALUATION (Auto-start hardening 2026-05) ───────
    // En enskild GPS-spike inom radien får ALDRIG starta workday/timer.
    // Vi loggar inside-pingen i per-target entry-trackern. Endast 'stable'
    // tillåter auto-start. 'insufficient'/'unstable' → emittera
    // assistant_events 'possible_arrival' (throttlat) och returnera utan
    // att starta. 'no_signal' → ingenting.
    const evaluateEntry = (
      key: string,
      dist: number,
    ): EntryEvaluation => {
      const tracker = getEntryTracker(key);
      recordEntryPing(tracker, {
        ts: Date.now(),
        distance: dist,
        accuracy: userPosition?.accuracy ?? null,
      });
      return evaluateStableEntry(tracker, Date.now(), lastPingAgeMs);
    };

    const emitPossibleArrival = (params: {
      kind: 'location' | 'project' | 'booking';
      targetId: string;
      label: string | null;
      ev: EntryEvaluation;
    }) => {
      // Throttla: bara 1 event per 4:e ping så vi inte spammar.
      if (params.ev.pings.length % 4 !== 1) return;
      mobileApi.assistantEvents
        .create({
          event_type: 'arrival',
          target_type: params.kind,
          target_id: params.targetId,
          target_label: params.label,
          happened_at: new Date().toISOString(),
          source: 'geofence',
          suggested_action: 'possible_arrival',
          metadata: {
            ...buildEntryMetadata(params.ev),
            note: 'Möjlig ankomst — instabil GPS, ingen auto-start',
          },
        })
        .catch((err) =>
          console.warn('[Geofence] possible_arrival emit failed:', err?.message || err),
        );
    };

    const exitDecision: ExitDecision = (() => {
      const signals = computePlannedDaySignals(bookings, new Date());
      return decideExitAction(signals);
    })();

    // AUTO-START POLICY (2026-05): Personal som befinner sig på en KÄND
    // arbetsplats (org_location, någon projekt-/booking-adress vi har i
    // EventFlow) ska få workday + activity-timer auto-startat — även om
    // de inte är assignade just idag. 9/10 är detta korrekt; det fåtal
    // gånger det är fel hanteras av "Detta var inte arbete"-knappen i
    // banner-notisen som visas direkt efter auto-start.
    const todayLocal = getLocalIsoDate();
    const isAssignedToday = (b: MobileBooking) =>
      isBookingPlannedOnDate(b, todayLocal);

    // Check bookings — consolidate large project bookings
    const triggeredProjects = new Set<string>();

    for (const booking of bookings) {
      if (!booking.delivery_latitude || !booking.delivery_longitude) continue;

      const dist = haversineDistance(
        userPosition.lat, userPosition.lng,
        booking.delivery_latitude, booking.delivery_longitude
      );

      if (dist < 1000) {
        nearby.push({ ...booking, distance: Math.round(dist) });
      }

      // If booking belongs to a large project, use project-level geofence
      const lpId = booking.large_project_id;
      const lpName = booking.large_project_name;

      // ── SUBDIVISION TRACKING ────────────────────────────────────────
      // When a project timer is active, record per-sub-booking ENTER/EXIT
      // intervals. These become subdivision time_reports (per-address
      // breakdown of the project total) when the timer is stopped.
      // Runs BEFORE the triggeredProjects continue-guard so every
      // sub-booking gets evaluated, not just the first one we see.
      if (lpId) {
        const projectKey = `project-${lpId}`;
        const hasProjectTimer = activeTimers.has(projectKey);
        if (hasProjectTimer) {
          const subKey = `sub:${lpId}:${booking.id}`;
          const insideSub = dist <= enterRadius;
          const outsideSub = dist > exitRadius;
          if (insideSub && !triggeredEnterRef.current.has(subKey)) {
            triggeredEnterRef.current.add(subKey);
            triggeredExitRef.current.delete(subKey);
            recordSubdivisionEnter({
              largeProjectId: lpId,
              bookingId: booking.id,
              bookingLabel: booking.client || null,
              address: booking.deliveryaddress || null,
            });
          } else if (outsideSub && triggeredEnterRef.current.has(subKey) && !triggeredExitRef.current.has(subKey)) {
            triggeredExitRef.current.add(subKey);
            triggeredEnterRef.current.delete(subKey);
            recordSubdivisionExit({
              largeProjectId: lpId,
              bookingId: booking.id,
            });
          }
        }
      }

      if (lpId && lpName) {
        // Skip if we already triggered for this project in this cycle
        if (triggeredProjects.has(lpId)) continue;
        triggeredProjects.add(lpId);

        const projectKey = `project-${lpId}`;
        const hasTimer = activeTimers.has(projectKey);
        const alreadyTriggered = triggeredEnterRef.current.has(projectKey);

        if (dist <= enterRadius) {
          console.log(`[Geofence] Project "${lpName}" dist=${Math.round(dist)}m, hasTimer=${hasTimer}, alreadyTriggered=${alreadyTriggered}`);
        }

        if (dist <= enterRadius && !hasTimer && !alreadyTriggered) {
          // STABLE-ENTRY GATE — en GPS-spike får inte starta workday/timer.
          const entryEv = evaluateEntry(projectKey, dist);
          if (entryEv.status !== 'stable') {
            if (entryEv.status === 'insufficient' || entryEv.status === 'unstable') {
              emitPossibleArrival({ kind: 'project', targetId: lpId, label: lpName, ev: entryEv });
            }
            continue;
          }
          // Stabil ankomst — fortsätt med auto-start.
          triggeredEnterRef.current.add(projectKey);
          triggeredExitRef.current.delete(projectKey);
          emitStopTravelOnArrival(userPosition.lat, userPosition.lng);
          // Använd FÖRSTA pålitliga ping-tiden som arrival-tid, inte "nu".
          const firstTs = firstReliableArrivalTs(getEntryTracker(projectKey));
          const arrivedAtIso = new Date(firstTs ?? Date.now()).toISOString();
          resetEntryTracker(getEntryTracker(projectKey));
          mobileApi.reportArrival({ kind: 'project', target_id: lpId, arrived_at: arrivedAtIso })
            .catch(err => console.warn('[Arrival] project register failed:', err?.message || err));
          noteEnterForDeparture(projectKey, 'project', lpId, lpName);

          // ── AUTO-FIRST: starta activity direkt. Visa prompt enbart vid
          // äkta osäkerhet (conflict / workday-failed). ───────────────────
          const startFn = autoActionsRef.start;
          if (startFn) {
            const projectPlannedToday = bookings.some(
              (b) => b.large_project_id === lpId && isAssignedToday(b),
            );
            const entryMeta = buildEntryMetadata(entryEv);
            void startFn({
              kind: 'project',
              targetId: lpId,
              label: lpName,
              arrivedAtIso,
              isPlannedToday: projectPlannedToday,
              arrivalPingsCount: entryMeta.entry_ping_count,
              firstArrivalPingAtIso: (entryMeta as any).entry_first_at,
              arrivalDwellMs: (entryMeta as any).entry_dwell_ms,
            })
              .then((res) => {
                if (res.status === 'conflict' || res.status === 'workday_failed') {
                  setGeofenceEvent({
                    type: 'enter', booking, distance: Math.round(dist),
                    locationType: 'project', largeProjectId: lpId,
                    largeProjectName: lpName,
                    largeProjectAddress: booking.deliveryaddress || undefined,
                    arrivalTimestamp: Date.now(),
                  });
                }
              })
              .catch((err) => {
                console.warn('[Geofence] auto-start project failed:', err);
                setGeofenceEvent({
                  type: 'enter', booking, distance: Math.round(dist),
                  locationType: 'project', largeProjectId: lpId,
                  largeProjectName: lpName,
                  largeProjectAddress: booking.deliveryaddress || undefined,
                  arrivalTimestamp: Date.now(),
                });
              });
          } else {
            // Auto-actions not registered yet → fall back to prompt.
            setGeofenceEvent({
              type: 'enter', booking, distance: Math.round(dist),
              locationType: 'project', largeProjectId: lpId,
              largeProjectName: lpName,
              largeProjectAddress: booking.deliveryaddress || undefined,
              arrivalTimestamp: Date.now(),
            });
          }
        }

        // Re-entry: timer is active and we just came back inside → close any open anomaly
        if (dist <= enterRadius && hasTimer && triggeredExitRef.current.has(projectKey)) {
          triggeredExitRef.current.delete(projectKey);
          resetExitTracker(getExitTracker(projectKey));
          fireAnomalyStop({ bookingId: projectKey });
        }
        // Inside again → clear any accumulated outside-pings (no exit in progress).
        if (dist <= enterRadius) {
          resetExitTracker(getExitTracker(projectKey));
        }

        // PRESENCE-EXIT CLEANUP (no timer): städa triggeredEnterRef när vi
        // stabilt lämnat platsen, så att ett återbesök samma session kan
        // trigga auto-arrival/auto-switch igen.
        if (dist > exitRadius && !hasTimer && triggeredEnterRef.current.has(projectKey)) {
          const ev = evaluateExit(projectKey, dist);
          if (ev.status === 'stable' || ev.status === 'stale_autostop') {
            triggeredEnterRef.current.delete(projectKey);
            resetExitTracker(getExitTracker(projectKey));
          }
        }

        // EXIT while timer is running → STABLE-EXIT GATE (2026-05).
        // En enskild outside-ping stoppar inte timern. Vi kräver
        // ≥3 konsekutiva outside-pings över ≥2 min med ok accuracy.
        // Saknas det: emittera review_departure men låt timern vara.
        // Workdayen rörs ALDRIG av geofence — bara aktivitetstimern.
        if (dist > exitRadius && hasTimer && !triggeredExitRef.current.has(projectKey)) {
          const ev = evaluateExit(projectKey, dist);
          const isStable = ev.status === 'stable' || ev.status === 'stale_autostop';
          if (!isStable) {
            if (ev.status === 'insufficient' || ev.status === 'unstable') {
              emitReviewDeparture({
                kind: 'project', targetId: lpId, label: lpName, ev,
              });
            }
            // no_signal → vänta. Hoppa över stop tills vi har stabil exit.
          } else {
            triggeredExitRef.current.add(projectKey);
            triggeredEnterRef.current.delete(projectKey);
            const exitedAtIso = ev.exitedAtIso ?? new Date().toISOString();
            maybeReportDeparture(projectKey, exitedAtIso);
            const stopMeta = buildExitMetadata(ev);
            const stopReason = ev.status === 'stale_autostop' ? 'stale_autostop_30min' : 'stable_exit';
            const stopFn = autoActionsRef.stop;
            if (stopFn) {
              void stopFn({ key: projectKey, exitedAtIso }).catch((err) => {
                console.warn('[Geofence] auto-stop project failed:', err);
                fireAnomalyStart({ bookingId: projectKey, largeProjectId: lpId });
              });
              // Audit-event så admin ser exakt VARFÖR auto-stop skedde.
              mobileApi.assistantEvents.create({
                event_type: 'departure',
                target_type: 'project',
                target_id: lpId,
                target_label: lpName,
                happened_at: exitedAtIso,
                source: 'geofence',
                suggested_action: 'auto_stopped_activity',
                metadata: { ...stopMeta, stop_source: 'geofence_auto', stop_reason: stopReason },
              }).catch(() => {});
            } else {
              fireAnomalyStart({ bookingId: projectKey, largeProjectId: lpId });
            }
            resetExitTracker(getExitTracker(projectKey));
            window.dispatchEvent(new CustomEvent('workplace-exit', {
              detail: {
                kind: 'project',
                key: projectKey,
                bookingId: projectKey,
                largeProjectId: lpId,
                exitedAtIso,
                decision: exitDecision,
                exit_metadata: stopMeta,
                stop_reason: stopReason,
              },
            }));
            // Subtil feedback — UI ska INTE upplevas som "timer stoppad",
            // utan som att fördelningen ändrats. Arbetsdagen rörs inte.
            const nextLabel = exitDecision === 'auto_start_travel' ? 'Resa' : 'Ej fördelat';
            toast.message(`Tid registreras inte längre på ${lpName ?? 'projektet'} → ${nextLabel}`);
          }
        }
      } else {
        // Standalone booking
        const hasTimer = activeTimers.has(booking.id);

        if (dist <= enterRadius && !hasTimer && !triggeredEnterRef.current.has(booking.id)) {
          // STABLE-ENTRY GATE — kräv stabil ankomst innan auto-start.
          const entryEv = evaluateEntry(booking.id, dist);
          if (entryEv.status !== 'stable') {
            if (entryEv.status === 'insufficient' || entryEv.status === 'unstable') {
              emitPossibleArrival({ kind: 'booking', targetId: booking.id, label: booking.client || null, ev: entryEv });
            }
            continue;
          }
          triggeredEnterRef.current.add(booking.id);
          triggeredExitRef.current.delete(booking.id);
          emitStopTravelOnArrival(userPosition.lat, userPosition.lng);
          const firstTs = firstReliableArrivalTs(getEntryTracker(booking.id));
          const arrivedAtIso = new Date(firstTs ?? Date.now()).toISOString();
          resetEntryTracker(getEntryTracker(booking.id));
          mobileApi.reportArrival({ kind: 'booking', target_id: booking.id, arrived_at: arrivedAtIso })
            .catch(err => console.warn('[Arrival] booking register failed:', err?.message || err));
          noteEnterForDeparture(booking.id, 'booking', booking.id, booking.client || null);

          // ── AUTO-FIRST: starta activity direkt; prompt endast vid äkta osäkerhet.
          const startFn = autoActionsRef.start;
          const fallbackPrompt = () => setGeofenceEvent({
            type: 'enter', booking, distance: Math.round(dist),
            locationType: 'booking', arrivalTimestamp: Date.now(),
          });
          if (startFn) {
            const entryMeta = buildEntryMetadata(entryEv);
            void startFn({
              kind: 'booking',
              targetId: booking.id,
              label: booking.client || 'Uppdrag',
              arrivedAtIso,
              isPlannedToday: isAssignedToday(booking),
              arrivalPingsCount: entryMeta.entry_ping_count,
              firstArrivalPingAtIso: (entryMeta as any).entry_first_at,
              arrivalDwellMs: (entryMeta as any).entry_dwell_ms,
            })
              .then((res) => {
                if (res.status === 'conflict' || res.status === 'workday_failed') fallbackPrompt();
              })
              .catch((err) => {
                console.warn('[Geofence] auto-start booking failed:', err);
                fallbackPrompt();
              });
          } else {
            fallbackPrompt();
          }
        }

        // Re-entry while timer is active → close any open anomaly
        if (dist <= enterRadius && hasTimer && triggeredExitRef.current.has(booking.id)) {
          triggeredExitRef.current.delete(booking.id);
          resetExitTracker(getExitTracker(booking.id));
          fireAnomalyStop({ bookingId: booking.id });
        }
        if (dist <= enterRadius) resetExitTracker(getExitTracker(booking.id));

        // PRESENCE-EXIT CLEANUP (no timer) — se project-grenen.
        if (dist > exitRadius && !hasTimer && triggeredEnterRef.current.has(booking.id)) {
          const ev = evaluateExit(booking.id, dist);
          if (ev.status === 'stable' || ev.status === 'stale_autostop') {
            triggeredEnterRef.current.delete(booking.id);
            resetExitTracker(getExitTracker(booking.id));
          }
        }

        // EXIT while timer is running → STABLE-EXIT GATE (2026-05).
        if (dist > exitRadius && hasTimer && !triggeredExitRef.current.has(booking.id)) {
          const ev = evaluateExit(booking.id, dist);
          const isStable = ev.status === 'stable' || ev.status === 'stale_autostop';
          if (!isStable) {
            if (ev.status === 'insufficient' || ev.status === 'unstable') {
              emitReviewDeparture({
                kind: 'booking', targetId: booking.id, label: booking.client || null, ev,
              });
            }
          } else {
            triggeredExitRef.current.add(booking.id);
            triggeredEnterRef.current.delete(booking.id);
            const exitedAtIso = ev.exitedAtIso ?? new Date().toISOString();
            maybeReportDeparture(booking.id, exitedAtIso);
            const stopMeta = buildExitMetadata(ev);
            const stopReason = ev.status === 'stale_autostop' ? 'stale_autostop_30min' : 'stable_exit';
            const stopFn = autoActionsRef.stop;
            if (stopFn) {
              void stopFn({ key: booking.id, exitedAtIso }).catch((err) => {
                console.warn('[Geofence] auto-stop booking failed:', err);
                fireAnomalyStart({ bookingId: booking.id });
              });
              mobileApi.assistantEvents.create({
                event_type: 'departure',
                target_type: 'booking',
                target_id: booking.id,
                target_label: booking.client || null,
                happened_at: exitedAtIso,
                source: 'geofence',
                suggested_action: 'auto_stopped_activity',
                metadata: { ...stopMeta, stop_source: 'geofence_auto', stop_reason: stopReason },
              }).catch(() => {});
            } else {
              fireAnomalyStart({ bookingId: booking.id });
            }
            resetExitTracker(getExitTracker(booking.id));
            window.dispatchEvent(new CustomEvent('workplace-exit', {
              detail: {
                kind: 'booking',
                key: booking.id,
                bookingId: booking.id,
                exitedAtIso,
                decision: exitDecision,
                exit_metadata: stopMeta,
                stop_reason: stopReason,
              },
            }));
            const nextLabel = exitDecision === 'auto_start_travel' ? 'Resa' : 'Ej fördelat';
            toast.message(`Tid registreras inte längre på ${booking.client ?? 'bokningen'} → ${nextLabel}`);
          }
        }
      }
    }

    // Check fixed locations (supports both circle and polygon geofences,
    // with hysteresis + GPS accuracy gating to prevent night-time false positives).
    const accuracy = userPosition.accuracy;
    const accuracyOk = accuracy == null || accuracy <= GEOFENCE_MAX_ACCURACY_M;

    for (const loc of orgLocations) {
      const target = {
        latitude: loc.latitude,
        longitude: loc.longitude,
        radius_meters: loc.radius_meters,
        geofence_mode: loc.geofence_mode || 'circle',
        geofence_polygon: loc.geofence_polygon || null,
      };
      const inside = isInsideGeofence(userPosition.lat, userPosition.lng, target);
      const dist = inside ? 0 : Math.round(haversineDistance(userPosition.lat, userPosition.lng, loc.latitude, loc.longitude));
      const locKey = `location-${loc.id}`;
      const hasTimer = activeTimers.has(locKey);

      // ── PRIVATE RESIDENCE / HOME ZONE ────────────────────────────────
      // Hemadresser (t.ex. "Boende - Vällsta") får ALDRIG bli arbetsplats:
      //   • ingen auto-arrival/start
      //   • ingen ankomst-prompt
      //   • OM man går in i polygonen och har en aktiv timer/workday
      //     → trigga End-Of-Day-flödet (banner stoppar timers, EOD-dialog).
      // One-shot per besök: triggeredHomeEndDayRef rensas på utträde.
      if (loc.is_private_residence === true) {
        if (inside && accuracyOk) {
          if (activeTimers.size > 0 && !triggeredHomeEndDayRef.current.has(locKey)) {
            triggeredHomeEndDayRef.current.add(locKey);
            console.log(`[Geofence] Inside private residence "${loc.name}" with ${activeTimers.size} active timer(s) → dispatching request-end-day`);
            try {
              window.dispatchEvent(new CustomEvent('request-end-day', {
                detail: { reason: 'arrived_home', locationId: loc.id, locationName: loc.name },
              }));
              toast.message(`Hemma (${loc.name}) — avslutar dagen automatiskt`);
            } catch (err) {
              console.warn('[Geofence] failed to dispatch request-end-day for home zone:', err);
            }
          }
        } else if (!inside) {
          // Lämnat polygonen → tillåt ny end-day vid nästa hemkomst.
          triggeredHomeEndDayRef.current.delete(locKey);
        }
        // Hoppa över alla auto-arrival/-start/-exit-grenar för denna location.
        continue;
      }


      // ENTER: CONFIDENCE-GATE — hysteresis + GPS accuracy gate (se ENTER-contract).
      // Låg confidence (dålig accuracy eller utanför hysteresis) → ingen autostart.
      if (
        accuracyOk &&
        evalShouldEnter(userPosition.lat, userPosition.lng, target, accuracy) &&
        !hasTimer &&
        !triggeredEnterRef.current.has(locKey)
      ) {
        // STABLE-ENTRY GATE — kräv stabil ankomst.
        const entryEv = evaluateEntry(locKey, dist);
        if (entryEv.status !== 'stable') {
          if (entryEv.status === 'insufficient' || entryEv.status === 'unstable') {
            emitPossibleArrival({ kind: 'location', targetId: loc.id, label: loc.name, ev: entryEv });
          }
          continue;
        }
        triggeredEnterRef.current.add(locKey);
        triggeredExitRef.current.delete(locKey);
        emitStopTravelOnArrival(userPosition.lat, userPosition.lng);
        const firstTs = firstReliableArrivalTs(getEntryTracker(locKey));
        const arrivedAtIso = new Date(firstTs ?? Date.now()).toISOString();
        resetEntryTracker(getEntryTracker(locKey));
        mobileApi.reportArrival({ kind: 'location', target_id: loc.id, arrived_at: arrivedAtIso })
          .catch(err => console.warn('[Arrival] location register failed:', err?.message || err));
        noteEnterForDeparture(locKey, 'location', loc.id, loc.name);

        // ── AUTO-FIRST: starta activity direkt; prompt endast vid äkta osäkerhet.
        const startFn = autoActionsRef.start;
        const fallbackPrompt = () => setGeofenceEvent({
          type: 'enter', distance: dist,
          locationType: 'fixed', locationId: loc.id, locationName: loc.name,
          locationAddress: loc.address || undefined,
          arrivalTimestamp: Date.now(),
        });
        if (startFn) {
          const entryMeta = buildEntryMetadata(entryEv);
          void startFn({
            kind: 'location',
            targetId: loc.id,
            label: loc.name,
            arrivedAtIso,
            isPlannedToday: true,
            arrivalPingsCount: entryMeta.entry_ping_count,
            firstArrivalPingAtIso: (entryMeta as any).entry_first_at,
            arrivalDwellMs: (entryMeta as any).entry_dwell_ms,
          })
            .then((res) => {
              if (res.status === 'conflict' || res.status === 'workday_failed') fallbackPrompt();
            })
            .catch((err) => {
              console.warn('[Geofence] auto-start location failed:', err);
              fallbackPrompt();
            });
        } else {
          fallbackPrompt();
        }
      }

      // Re-entry while timer is active → close any open anomaly for this location
      if (accuracyOk && inside && hasTimer && triggeredExitRef.current.has(locKey)) {
        triggeredExitRef.current.delete(locKey);
        resetExitTracker(getExitTracker(locKey));
        fireAnomalyStop({ locationId: loc.id });
      }
      if (inside) resetExitTracker(getExitTracker(locKey));

      // PRESENCE-EXIT CLEANUP (no timer) — gör så att andra besöket samma
      // session triggar auto-arrival igen (annars sitter locKey kvar i
      // triggeredEnterRef och ENTER-grenen hoppas över).
      if (
        accuracyOk &&
        evalShouldExit(userPosition.lat, userPosition.lng, target, accuracy) &&
        !hasTimer &&
        triggeredEnterRef.current.has(locKey)
      ) {
        const ev = evaluateExit(locKey, dist);
        if (ev.status === 'stable' || ev.status === 'stale_autostop') {
          triggeredEnterRef.current.delete(locKey);
          resetExitTracker(getExitTracker(locKey));
        }
      }

      // EXIT: hysteresis + accuracy gate + STABLE-EXIT GATE (2026-05).
      // En enskild punkt utanför stoppar inte timern. Workdayen rörs aldrig.
      if (
        accuracyOk &&
        evalShouldExit(userPosition.lat, userPosition.lng, target, accuracy) &&
        hasTimer &&
        !triggeredExitRef.current.has(locKey)
      ) {
        const ev = evaluateExit(locKey, dist);
        const isStable = ev.status === 'stable' || ev.status === 'stale_autostop';
        if (!isStable) {
          if (ev.status === 'insufficient' || ev.status === 'unstable') {
            emitReviewDeparture({
              kind: 'location', targetId: loc.id, label: loc.name, ev,
            });
          }
        } else {
          triggeredExitRef.current.add(locKey);
          triggeredEnterRef.current.delete(locKey);
          const exitedAtIso = ev.exitedAtIso ?? new Date().toISOString();
          maybeReportDeparture(locKey, exitedAtIso);
          const stopMeta = buildExitMetadata(ev);
          const stopReason = ev.status === 'stale_autostop' ? 'stale_autostop_30min' : 'stable_exit';
          const stopFn = autoActionsRef.stop;
          if (stopFn) {
            void stopFn({ key: locKey, exitedAtIso }).catch((err) => {
              console.warn('[Geofence] auto-stop location failed:', err);
              fireAnomalyStart({ locationId: loc.id });
            });
            mobileApi.assistantEvents.create({
              event_type: 'departure',
              target_type: 'location',
              target_id: loc.id,
              target_label: loc.name,
              happened_at: exitedAtIso,
              source: 'geofence',
              suggested_action: 'auto_stopped_activity',
              metadata: { ...stopMeta, stop_source: 'geofence_auto', stop_reason: stopReason },
            }).catch(() => {});
          } else {
            fireAnomalyStart({ locationId: loc.id });
          }
          resetExitTracker(getExitTracker(locKey));
          window.dispatchEvent(new CustomEvent('workplace-exit', {
            detail: {
              kind: 'location',
              key: locKey,
              locationId: loc.id,
              exitedAtIso,
              decision: exitDecision,
              exit_metadata: stopMeta,
              stop_reason: stopReason,
            },
          }));
          const nextLabel = exitDecision === 'auto_start_travel' ? 'Resa' : 'Ej fördelat';
          toast.message(`Tid registreras inte längre på ${loc.name ?? 'platsen'} → ${nextLabel}`);
        }
      }
    }

    nearby.sort((a, b) => a.distance - b.distance);
    setNearbyBookings(nearby);
  }, [userPosition, bookings, activeTimers, orgLocations]);

  // ─────────────────────────────────────────────────────────────────────
  // PRESENCE-BASED TRAVEL STOP (timer-independent watchdog)
  //
  // The ENTER-branches above only fire on a real out→in transition AND
  // require !hasTimer + !alreadyTriggered. That means a refresh while
  // already inside, or arrival while a lager-/projekt-timer is already
  // running, leaves the open travel_time_logs row ticking forever.
  //
  // This effect runs every GPS tick and, IF a travel row is open, emits
  // STOP_TRAVEL_EVENT whenever the user is currently inside ANY known
  // geofence (org_location, booking, or large project they're assigned
  // to). It does NOT touch ENTER-prompts or anomaly tracking.
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userPosition) return;
    // Cheap localStorage read — TravelDetection persists state here.
    let hasOpenTravel = false;
    try {
      const raw = localStorage.getItem('eventflow-travel-state');
      if (raw) {
        const parsed = JSON.parse(raw);
        hasOpenTravel = !!parsed?.activeTravelLogId;
      }
    } catch { /* ignore */ }
    if (!hasOpenTravel) return;

    const todayLocal = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const isAssignedToday = (b: MobileBooking) =>
      Array.isArray(b.assignment_dates) && b.assignment_dates.includes(todayLocal);

    // 1) Inside any fixed org location?
    for (const loc of orgLocations) {
      const target = {
        latitude: loc.latitude,
        longitude: loc.longitude,
        radius_meters: loc.radius_meters,
        geofence_mode: loc.geofence_mode || 'circle',
        geofence_polygon: loc.geofence_polygon || null,
      };
      if (isInsideGeofence(userPosition.lat, userPosition.lng, target)) {
        console.log(`[TravelDetection] Stopping travel — user already inside ${loc.name} geofence`);
        emitStopTravelOnArrival(userPosition.lat, userPosition.lng);
        return;
      }
    }

    // 2) Inside any assigned-today booking / large-project geofence?
    for (const booking of bookings) {
      if (!booking.delivery_latitude || !booking.delivery_longitude) continue;
      if (!isAssignedToday(booking)) continue;
      const dist = haversineDistance(
        userPosition.lat, userPosition.lng,
        booking.delivery_latitude, booking.delivery_longitude
      );
      if (dist <= ENTER_RADIUS) {
        const label = booking.large_project_name || booking.client || 'workplace';
        console.log(`[TravelDetection] Stopping travel — user already inside ${label} geofence`);
        emitStopTravelOnArrival(userPosition.lat, userPosition.lng);
        return;
      }
    }
  }, [userPosition, bookings, orgLocations]);

  // SINGLE-TIMER POLICY (single-timer-policy-v1):
  //
  // Mobile app owns only day start/stop.
  // Timeline allocation is owned by Time Engine.
  // GPS/geofence is evidence only, not a project timer.
  //
  // Den här metoden var tidigare entry-point för att skapa
  // boknings-/projekt-/plats-timers från mobilen. I single-timer-modellen
  // får ingen sådan timer skapas från klienten — endast `WorkDayPanel`
  // får starta/stoppa arbetsdagen via mobileApi.startTimeRegistration /
  // stopTimeRegistration. Tidsfördelning sker i admin-tidslinjen.
  //
  // Vi behåller signaturen så att gamla call-sites inte kraschar, men
  // gör det till en hård no-op. Inga setActiveTimers, ingen sync-queue,
  // inga writes till location_time_entries.
  const startTimer = useCallback((_bookingId: string, _client: string, _isAuto = false, _taskId?: string, _taskTitle?: string, _locationId?: string, _locationName?: string, _largeProjectId?: string, _customStartTime?: string): boolean => {
    if (typeof console !== 'undefined') {
      console.warn(
        '[useGeofencing] startTimer is disabled by single-timer-policy-v1. ' +
        'The mobile app may only start/stop the workday via WorkDayPanel.',
      );
    }
    return false;
  }, []);

  // 3. Reconcile when the queue confirms a start with the server.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{
        timerKey: string;
        serverStartedAt?: string;
        serverEntryId?: string;
        alreadyActive?: boolean;
      }>).detail;
      if (!detail?.timerKey) return;
      setActiveTimers(prev => {
        const existing = prev.get(detail.timerKey);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(detail.timerKey, {
          ...existing,
          pendingSync: false,
          serverEntryId: detail.serverEntryId || existing.serverEntryId,
          // If server reports an earlier (already-active) start, adopt it.
          startTime: detail.alreadyActive && detail.serverStartedAt
            ? detail.serverStartedAt
            : existing.startTime,
        });
        return next;
      });
    };
    window.addEventListener('timer-sync-confirmed', handler);
    // RACE GUARD (2026-05): server kan svara att vår pending start
    // matchar ett fönster som redan är stoppat/rapporterat. Då ska
    // den lokala timern försvinna direkt — annars visar bannern en
    // "spöktimer" som inte motsvarar någon öppen rad på servern.
    const onRejected = (e: Event) => {
      const detail = (e as CustomEvent<{ timerKey: string; reason?: string }>).detail;
      if (!detail?.timerKey) return;
      console.warn('[TimerSync] start rejected by server, clearing local timer:',
        detail.timerKey, detail.reason);
      setActiveTimers(prev => {
        if (!prev.has(detail.timerKey)) return prev;
        const next = new Map(prev);
        next.delete(detail.timerKey);
        return next;
      });
    };
    window.addEventListener('timer-sync-rejected', onRejected);
    return () => {
      window.removeEventListener('timer-sync-confirmed', handler);
      window.removeEventListener('timer-sync-rejected', onRejected);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────
  // STOP API — save-then-stop is the only sanctioned shape.
  //
  // Three intentional verbs are exposed. The legacy free-form `stopTimer`
  // is gone on purpose: it allowed call-sites to remove the timer locally
  // BEFORE the time_report was safely persisted, which violates the
  // architectural decision (server is source of truth, save-then-stop).
  //
  //   1. saveAndStopTimer(key, payload)
  //        Canonical path for booking/project timers.
  //        Order: createTimeReport → stop server entry → clear local state.
  //        Throws on persistence failure → timer survives so the user can retry.
  //
  //   2. stopLocationTimerWithoutReport(key)
  //        Only valid for pure fixed-location timers (no time_report needed,
  //        e.g. closing a "Lager" presence row). Closes the server entry,
  //        then clears local. Throws on failure.
  //
  //   3. cancelPendingTimer(key)
  //        Only valid while the start has not yet synced to the server
  //        (pendingSync === true). Drops the pending queue entry and clears
  //        local — never touches the server because there is nothing there
  //        to close.
  // ─────────────────────────────────────────────────────────────────────

  const _clearLocalTimer = useCallback((key: string) => {
    setActiveTimers(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    triggeredExitRef.current.add(key);
    triggeredEnterRef.current.add(key);
  }, []);

  const _resolveStopPayload = useCallback((timer: ActiveTimer) => {
    const payload: { location_id?: string; booking_id?: string; large_project_id?: string; entry_id?: string } = {};
    if (timer.serverEntryId) payload.entry_id = timer.serverEntryId;
    else if (timer.locationId) payload.location_id = timer.locationId;
    else if (timer.largeProjectId) payload.large_project_id = timer.largeProjectId;
    else payload.booking_id = timer.bookingId;
    return payload;
  }, []);

  /**
   * Result of a save-then-stop. Three distinct id types — each can be
   * null if the corresponding side-effect didn't apply or failed:
   *   • timer         — the cleared local ActiveTimer record.
   *   • serverEntryId — `location_time_entries.id` (presence row).
   *                     Null if the start was still pending-sync.
   *   • timeReportId  — `time_reports.id`. The ONLY id valid for linking
   *                     anomalies via `time_report_id`.
   */
  interface SaveAndStopResult {
    timer: ActiveTimer;
    serverEntryId: string | null;
    timeReportId: string | null;
  }

  /**
   * Save-then-stop. The ONLY sanctioned way to convert an active
   * booking/project timer into a time_report. Sole owner of
   * `time_reports` creation (the legacy DB trigger that auto-created
   * reports from `location_time_entries` was removed 2026-04-22).
   *
   * 1. POST the time_report to the server (mobile-app-api).
   * 2. Close the matching open `location_time_entries` row.
   * 3. Clear the local timer entry.
   *
   * If step 1 fails, the timer stays alive both locally and on the
   * server so the user can retry. Throws the original error.
   */
  const saveAndStopTimer = useCallback(async (
    key: string,
    reportPayload: Parameters<typeof mobileApi.createTimeReport>[0],
  ): Promise<SaveAndStopResult> => {
    const timer = activeTimersRef.current.get(key);
    if (!timer) throw new Error('No active timer for key: ' + key);

    // 1. SAVE FIRST — never clear local state before this succeeds.
    const createRes = await mobileApi.createTimeReport(reportPayload);
    const timeReportId =
      (createRes as any)?.time_report?.id ?? (createRes as any)?.id ?? null;

    // 2. Best-effort: close the server-side open entry. We do NOT
    //    re-throw here because the time_report is already safely stored;
    //    leaving an orphan open entry is recoverable by reconciliation.
    if (isTimerPendingSync(key)) {
      removeFromQueue(key);
    } else {
      try {
        await mobileApi.stopLocationTimer(_resolveStopPayload(timer));
      } catch (err) {
        console.warn('[Stop] server entry close failed (report already saved):', err);
      }
    }

    // 3. Clear local last.
    _clearLocalTimer(key);
    return {
      timer,
      serverEntryId: timer.serverEntryId ?? null,
      timeReportId,
    };
  }, [_clearLocalTimer, _resolveStopPayload]);

  /**
   * Close a pure fixed-location presence timer. No time_report is created
   * (location-only timers are presence rows, not work logs). Throws if the
   * server call fails so the UI can surface the error and keep the timer.
   */
  const stopLocationTimerWithoutReport = useCallback(async (key: string): Promise<ActiveTimer> => {
    const timer = activeTimersRef.current.get(key);
    if (!timer) throw new Error('No active timer for key: ' + key);
    if (!timer.locationId) {
      throw new Error('stopLocationTimerWithoutReport is only valid for fixed-location timers');
    }

    if (isTimerPendingSync(key)) {
      removeFromQueue(key);
    } else {
      // Server first — only clear local on success.
      await mobileApi.stopLocationTimer(_resolveStopPayload(timer));
    }
    _clearLocalTimer(key);
    return timer;
  }, [_clearLocalTimer, _resolveStopPayload]);

  /**
   * Drop a timer that has not yet synced to the server. Useful when a user
   * starts a timer, immediately realises it was a mistake, and the network
   * was offline so the server never saw it. Refuses to run if the start is
   * already confirmed (use saveAndStopTimer / stopLocationTimerWithoutReport).
   */
  const cancelPendingTimer = useCallback((key: string): boolean => {
    const timer = activeTimersRef.current.get(key);
    if (!timer) return false;
    if (!timer.pendingSync && !isTimerPendingSync(key)) {
      console.warn('[cancelPendingTimer] refusing — timer is already server-confirmed:', key);
      return false;
    }
    removeFromQueue(key);
    _clearLocalTimer(key);
    return true;
  }, [_clearLocalTimer]);

  const dismissGeofenceEvent = useCallback(() => {
    const event = geofenceEvent;
    setGeofenceEvent(null);

    // Per-target cooldown so the engine doesn't immediately re-prompt for
    // the same target while the user is still inside its radius.
    try {
      const targetKey =
        (event as any)?.targetKey ||
        (event?.locationId && `fixed-${event.locationId}`) ||
        ((event as any)?.bookingId && `booking-${(event as any).bookingId}`) ||
        ((event as any)?.largeProjectId && `project-${(event as any).largeProjectId}`);
      if (targetKey) recordDismissCooldown(targetKey);
    } catch (err) {
      console.warn('[Geofence] cooldown record failed:', err);
    }

    // If dismissing a location enter event, delete the background GPS entry
    // so no time is recorded for this visit
    if (event?.type === 'enter' && event.locationType === 'fixed' && event.locationId) {
      mobileApi.dismissLocationEntry(event.locationId).catch(err => {
        console.warn('[Geofence] Failed to dismiss location entry:', err);
      });
    }
  }, [geofenceEvent]);

  return {
    activeTimers,
    userPosition,
    isTracking,
    geofenceEvent,
    nearbyBookings,
    orgLocations,
    startTimer,
    saveAndStopTimer,
    stopLocationTimerWithoutReport,
    cancelPendingTimer,
    dismissGeofenceEvent,
  };
}

