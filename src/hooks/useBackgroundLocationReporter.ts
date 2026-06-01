import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BackgroundGeolocation } from '@capgo/background-geolocation';
import {
  enqueueLocationPoint,
  forceFlushLocationQueue,
  getLocationSyncStatus,
  setLocationUploadPolicy,
  subscribeLocationSyncStatus,
  type LocationSyncStatus,
} from '@/services/locationSyncQueue';
import { deriveCaptureUploadPolicy } from '@/lib/geofence/captureUploadPolicy';

import { getBatterySnapshot } from '@/lib/mobile/getBatterySnapshot';
import { GpsPosition, haversineDistance, ENTER_RADIUS } from '@/hooks/useGeofencing';
import {
  decideLocationMode,
  logModeChange,
  type LocationMode,
  type LocationModeDecision,
} from '@/lib/geofence/locationMode';
import { resolveAppliedTrackingDistanceFilter } from '@/lib/geofence/nativeTrackingPolicy';
import { isInDismissCooldown } from '@/lib/geofence/dismissCooldown';
import { mergeTrackingPolicy } from '@/lib/geofence/mergeTrackingPolicy';
import { isWorkdayActive } from '@/lib/workday/workdayActiveSignal';
import { recordAppHealthEvent } from '@/lib/mobile/recordAppHealthEvent';
import {
  isInsideGeofence,
  shouldTriggerEnter,
  shouldTriggerExit,
  type GeoJSONPolygon,
} from '@/lib/geofenceEval';


const PENDING_ARRIVALS_KEY = 'eventflow-pending-arrivals';
const GEOFENCE_TARGETS_KEY = 'eventflow-geofence-targets';

export interface PendingArrival {
  key: string;
  name: string;
  type: 'fixed' | 'project' | 'booking';
  timestamp: number;
  locationId?: string;
  largeProjectId?: string;
  bookingId?: string;
  address?: string;
  radius: number;
  lat: number;
  lng: number;
}

interface GeofenceTarget {
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
  geofence_mode?: 'circle' | 'polygon' | null;
  geofence_polygon?: GeoJSONPolygon | null;
}

function loadPendingArrivals(): PendingArrival[] {
  try {
    const raw = localStorage.getItem(PENDING_ARRIVALS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function savePendingArrivals(arrivals: PendingArrival[]) {
  localStorage.setItem(PENDING_ARRIVALS_KEY, JSON.stringify(arrivals));
}

export function clearPendingArrivals(keys?: string[]) {
  if (!keys) {
    localStorage.removeItem(PENDING_ARRIVALS_KEY);
    return;
  }
  const current = loadPendingArrivals();
  const filtered = current.filter(a => !keys.includes(a.key));
  savePendingArrivals(filtered);
}

function loadGeofenceTargets(): GeofenceTarget[] {
  try {
    const raw = localStorage.getItem(GEOFENCE_TARGETS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Continuously reports GPS position to staff_locations every 30s.
 * Uses @capgo/background-geolocation on native (works even when app is backgrounded/killed).
 * Falls back to navigator.geolocation on web.
 *
 * Also performs background geofence checks against cached targets and stores
 * pending arrivals in localStorage so useGeofencing can show prompts with
 * the real arrival time when the app is opened.
 *
 * Exposes `latestPosition` so other hooks (e.g. useTravelDetection)
 * can consume GPS data without creating their own watcher.
 */
// AKUT STABILISERING 2026-05-26: Höjt från 10s → 60s för att stoppa
// Supabase-överbelastning. Native distanceFilter=50m + 60s throttle ger
// max ~1 enqueue/minut per enhet, vilket är mer än nog för kartan och
// Time Engine. GPS-insamling fortsätter, men varje punkt slår inte DB.
const REPORT_THROTTLE_MS = 60_000;     // normal movement-driven report
const DEFAULT_HEARTBEAT_MS = 60_000;   // fallback if mode engine not ready
const DEFAULT_DISTANCE_FILTER = 50;    // fallback if mode engine not ready
const RESTART_MIN_INTERVAL_MS = 60_000; // min time between native restarts
const RESTART_DISTANCE_DELTA = 30;      // only restart if filter changed >=30m

const ACTIVE_TIMERS_KEY = 'eventflow-mobile-timers';

/** Cheap check — reads timer cache from localStorage written by useGeofencing. */
function readHasActiveTimer(): boolean {
  try {
    const raw = localStorage.getItem(ACTIVE_TIMERS_KEY);
    if (!raw) return false;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 0;
  } catch {
    return false;
  }
}

/**
 * Combined "i jobbet"-signal. Workday öppen ELLER aktivitetstimer igång
 * → adaptiv mode ska välja active_timer (tät tracking). Workday-signalen
 * kommer från backend via useWorkDay som speglar in i workdayActiveSignal;
 * timer-cachen från useGeofencing. Båda är localStorage-fallbacks; sann
 * authority är backend, men dessa är cheap reads för heartbeat-loopen.
 */
function readHasActiveSession(): boolean {
  return isWorkdayActive() || readHasActiveTimer();
}

export interface BackgroundLocationDebugInfo {
  currentLocationMode: LocationMode | null;
  selectedHeartbeatMs: number;
  selectedDistanceFilter: number;
  nearestTargetDistanceMeters: number | null;
  hasActiveTimer: boolean;
  hasPendingArrival: boolean;
  /** @deprecated — use lastNativeLocationEventAt + lastJsHeartbeatAt. */
  lastPingAt: number | null;
  /** @deprecated — does NOT mean server-accepted; använd lastAcceptedUploadAt. */
  lastUploadAt: number | null;
  lastNativeRestartAt: number | null;
  // ── Nya, ärliga fält ───────────────────────────────────────────────
  /** Senaste callback från native BGGeo / browser watchPosition. */
  lastNativeLocationEventAt: number | null;
  /** Senaste gång JS-heartbeat-timern fyrade av (sendHeartbeat). */
  lastJsHeartbeatAt: number | null;
  /** Senaste gång forcePing/enqueueFreshPosition lyckades hämta färsk pos. */
  lastFreshResumePingAt: number | null;
  /** Senaste gång en GPS-punkt lagts i lokala kön (≠ server-accepted). */
  lastEnqueuedAt: number | null;
  /** Senaste gång servern faktiskt accepterade en upload. */
  lastAcceptedUploadAt: number | null;
  /** Antal punkter som servern rejecterade i senaste batch. */
  lastUploadRejected: number;
  /** Senaste fel från upload (om något). */
  lastUploadError: string | null;
  /** Senaste fel från native/browser geolocation. */
  lastGeolocationError: string | null;
  currentDistanceFilter: number;
  currentHeartbeatMs: number;
  /** Capture-policyns distanceFilter (lokal native start/restart). */
  currentCaptureDistanceFilter: number;
  /** Capture-policyns enqueue-throttle (ms). */
  currentCaptureThrottleMs: number;
  /** Aktuell upload-policy (auto-flush-cadence i locationSyncQueue). */
  currentUploadMode: string;
  /** Auto-flush-intervall (ms) som upload-policyn just nu kräver. */
  currentUploadIntervalMs: number;
  backendPolicyMode: string | null;
  isNativePlatform: boolean;
  appVisibilityState: 'visible' | 'hidden' | 'unknown';
  /**
   * Sammanvägd "silent"-status baserat på senaste native-event och
   * senaste server-accepted upload. Diagnostik — skapar ALDRIG arbetstid.
   */
  gpsSilentState: 'ok' | 'native_silent' | 'upload_silent' | 'native_and_upload_silent';
}

/**
 * Avgör om GPS-pipelinen är "tyst". Räknas tyst om appen är visible och:
 *   - senaste native location-event är äldre än threshold, ELLER
 *   - senaste server-accepted upload är äldre än threshold
 * Returnerar 'ok' om appen inte är visible (kan inte avgöra) eller om
 * båda signalerna är färska.
 */
export function computeGpsSilentState(args: {
  appVisibilityState: 'visible' | 'hidden' | 'unknown';
  lastNativeLocationEventAt: number | null;
  lastAcceptedUploadAt: number | null;
  now?: number;
  thresholdMs?: number;
}): BackgroundLocationDebugInfo['gpsSilentState'] {
  const now = args.now ?? Date.now();
  const threshold = args.thresholdMs ?? 5 * 60_000;
  if (args.appVisibilityState !== 'visible') return 'ok';
  const nativeSilent =
    args.lastNativeLocationEventAt == null ||
    now - args.lastNativeLocationEventAt > threshold;
  const uploadSilent =
    args.lastAcceptedUploadAt == null ||
    now - args.lastAcceptedUploadAt > threshold;
  if (nativeSilent && uploadSilent) return 'native_and_upload_silent';
  if (nativeSilent) return 'native_silent';
  if (uploadSilent) return 'upload_silent';
  return 'ok';
}

export const useBackgroundLocationReporter = (staffId: string | null | undefined) => {
  const lastReportRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const lastKnownPosRef = useRef<{ lat: number; lng: number; accuracy: number | null; speed: number | null } | null>(null);
  const staffIdRef = useRef<string | null | undefined>(staffId);
  const startedRef = useRef(false);
  const [latestPosition, setLatestPosition] = useState<GpsPosition | null>(null);
  // Track which targets we're currently inside (to avoid duplicate pending arrivals)
  const insideRef = useRef<Set<string>>(new Set());
  // Adaptive mode state
  const currentModeRef = useRef<LocationMode | null>(null);
  const currentHeartbeatMsRef = useRef<number>(DEFAULT_HEARTBEAT_MS);
  const currentDistanceFilterRef = useRef<number>(DEFAULT_DISTANCE_FILTER);
  const lastNativeRestartRef = useRef<number>(0);
  // Senaste native/browser location-event (rå callback)
  const lastNativeLocationEventAtRef = useRef<number | null>(null);
  // Senaste JS heartbeat-timer-fyrning
  const lastJsHeartbeatAtRef = useRef<number | null>(null);
  // Senaste lyckade fresh-getCurrentPosition på resume/focus
  const lastFreshResumePingAtRef = useRef<number | null>(null);
  // Senaste lokala enqueue (≠ server-accepted)
  const lastEnqueuedAtRef = useRef<number | null>(null);
  // Senaste geolocation-fel
  const lastGeolocationErrorRef = useRef<string | null>(null);
  // ── DEPRECATED, behålls för bakåtkomp i debug-vyer som ännu läser dem
  const lastPingAtRef = useRef<number | null>(null);
  const lastUploadAtRef = useRef<number | null>(null);
  // Senaste backend-policy-snapshot (för debug)
  const backendPolicyModeRef = useRef<string | null>(null);
  // Senaste sync-status från locationSyncQueue
  const syncStatusRef = useRef<LocationSyncStatus>(getLocationSyncStatus());
  // Throttle för gps_silent app-health events (max 1/5min per session)
  const lastGpsSilentSentAtRef = useRef<number>(0);
  // Dynamisk capture-throttle (ms) — uppdateras vid rescheduleHeartbeat.
  // Ersätter den hårdkodade REPORT_THROTTLE_MS-konstanten så att inom
  // geofence kan vi enqueueas tätare (30s) och outside_idle släpper igenom
  // bara var 5:e min.
  const captureThrottleMsRef = useRef<number>(REPORT_THROTTLE_MS);
  // Capture-distanceFilter — det är DENNA som styr native start/restart,
  // INTE decision.distanceFilter. Capture-policy får t.ex. välja 20 m
  // inom geofence för tät lokal rörelse även om backend-policyn vill
  // ha grövre värde för upload-cadence.
  const captureDistanceFilterRef = useRef<number>(DEFAULT_DISTANCE_FILTER);
  // Senaste upload-policy från capture/upload-mapping (för debug).
  const currentUploadModeRef = useRef<string>('default');
  const currentUploadIntervalMsRef = useRef<number>(10 * 60_000);


  const [debug, setDebug] = useState<BackgroundLocationDebugInfo>({
    currentLocationMode: null,
    selectedHeartbeatMs: DEFAULT_HEARTBEAT_MS,
    selectedDistanceFilter: DEFAULT_DISTANCE_FILTER,
    nearestTargetDistanceMeters: null,
    hasActiveTimer: readHasActiveSession(),
    hasPendingArrival: false,
    lastPingAt: null,
    lastUploadAt: null,
    lastNativeRestartAt: null,
    lastNativeLocationEventAt: null,
    lastJsHeartbeatAt: null,
    lastFreshResumePingAt: null,
    lastEnqueuedAt: null,
    lastAcceptedUploadAt: null,
    lastUploadRejected: 0,
    lastUploadError: null,
    lastGeolocationError: null,
    currentDistanceFilter: DEFAULT_DISTANCE_FILTER,
    currentHeartbeatMs: DEFAULT_HEARTBEAT_MS,
    currentCaptureDistanceFilter: DEFAULT_DISTANCE_FILTER,
    currentCaptureThrottleMs: REPORT_THROTTLE_MS,
    currentUploadMode: 'default',
    currentUploadIntervalMs: 10 * 60_000,
    backendPolicyMode: null,
    isNativePlatform: typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform(),
    appVisibilityState:
      typeof document !== 'undefined'
        ? (document.visibilityState as 'visible' | 'hidden')
        : 'unknown',
    gpsSilentState: 'ok',
  });

  // Subscribe to upload status from the location sync queue so debug fields
  // can distinguish "lagt i kö" från "servern faktiskt accepterade".
  useEffect(() => {
    const unsub = subscribeLocationSyncStatus((s) => {
      syncStatusRef.current = s;
      setDebug((prev) => ({
        ...prev,
        lastAcceptedUploadAt: s.lastUploadAt,
        lastUploadRejected: s.lastUploadRejected,
        lastUploadError: s.lastErrorMessage,
      }));
    });
    return unsub;
  }, []);

  // Keep ref in sync so heartbeat survives auth-token refreshes without restart
  useEffect(() => { staffIdRef.current = staffId; }, [staffId]);

  // ── SILENT-MONITOR ─────────────────────────────────────────────────────
  // Diagnostik. Var 60:e sekund: när appen är visible, kontrollera om
  // senaste native-event eller senaste accepted upload är äldre än 5 min.
  // Om så, skicka ett `gps_silent` app-health event (throttlat till 1/5min).
  // Skapar ALDRIG arbetstid. Uppdaterar bara debug-state.
  useEffect(() => {
    if (!staffId) return;
    const SILENT_THRESHOLD_MS = 5 * 60_000;
    const THROTTLE_MS = 5 * 60_000;

    const tick = () => {
      const visibility: 'visible' | 'hidden' | 'unknown' =
        typeof document !== 'undefined'
          ? (document.visibilityState as 'visible' | 'hidden')
          : 'unknown';
      const state = computeGpsSilentState({
        appVisibilityState: visibility,
        lastNativeLocationEventAt: lastNativeLocationEventAtRef.current,
        lastAcceptedUploadAt: syncStatusRef.current.lastUploadAt,
        thresholdMs: SILENT_THRESHOLD_MS,
      });

      setDebug((prev) =>
        prev.gpsSilentState === state && prev.appVisibilityState === visibility
          ? prev
          : { ...prev, gpsSilentState: state, appVisibilityState: visibility },
      );

      if (state === 'ok') return;
      const now = Date.now();
      if (now - lastGpsSilentSentAtRef.current < THROTTLE_MS) return;
      lastGpsSilentSentAtRef.current = now;

      let orgId: string | null = null;
      try {
        const raw = localStorage.getItem('eventflow-mobile-staff');
        if (raw) orgId = JSON.parse(raw)?.organization_id ?? null;
      } catch { /* ignore */ }
      if (!orgId) return;

      void recordAppHealthEvent({
        organizationId: orgId,
        staffId,
        eventType: 'gps_silent',
        appState: visibility,
        skipBattery: true,
        metadata: {
          lastNativeLocationEventAt: lastNativeLocationEventAtRef.current,
          lastAcceptedUploadAt: syncStatusRef.current.lastUploadAt,
          lastJsHeartbeatAt: lastJsHeartbeatAtRef.current,
          currentDistanceFilter: currentDistanceFilterRef.current,
          currentHeartbeatMs: currentHeartbeatMsRef.current,
          backendPolicyMode: backendPolicyModeRef.current,
          appVisibilityState: visibility,
          silentState: state,
          reason: 'visible_but_no_recent_gps',
        },
      });
    };

    const id = window.setInterval(tick, 60_000);
    // Kör en initial tick efter 10s så debug-state hinner stabilisera
    const initial = window.setTimeout(tick, 10_000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(initial);
    };
  }, [staffId]);



  useEffect(() => {
    // CRITICAL: Start tracker ONCE per app lifetime. Do NOT stop it just because
    // staffId becomes null (token refresh, brief session loss). iOS kills the
    // background service permanently if we call stop(), and "Allow always"
    // permission can't bring it back without manual app re-open.
    // Pings while staffId is null are simply skipped at the report layer;
    // GPS keeps flowing and we resume reporting as soon as staffId returns.
    if (startedRef.current) return;
    if (!staffId) return; // wait for first login, then never stop
    startedRef.current = true;

    // Reset inside tracking on new session
    insideRef.current.clear();

    let stopped = false;
    let restartingNative = false;
    let appliedDistanceFilter = -1;


    const getCachedOrgId = (): string | null => {
      try {
        const raw = localStorage.getItem('eventflow-mobile-staff');
        if (!raw) return null;
        return JSON.parse(raw)?.organization_id ?? null;
      } catch {
        return null;
      }
    };

    const handlePosition = (
      latitude: number,
      longitude: number,
      accuracy: number | null,
      speed: number | null,
      timestampMs?: number | null,
    ) => {
      const recordedAt = new Date(
        typeof timestampMs === 'number' && Number.isFinite(timestampMs) ? timestampMs : Date.now(),
      ).toISOString();
      lastPingAtRef.current = Date.now();
      lastNativeLocationEventAtRef.current = Date.now();
      setLatestPosition({ lat: latitude, lng: longitude, accuracy, speed, timestamp: Date.now() });
      lastKnownPosRef.current = { lat: latitude, lng: longitude, accuracy, speed };

      const now = Date.now();
      if (now - lastReportRef.current < captureThrottleMsRef.current) {
        // Geofence-check körs ÄVEN under throttle — den enqueuar själv
        // crossing-punkten med source='geofence' så staketpassagen aldrig
        // kan saknas pga capture-throttle.
        checkBackgroundGeofences(latitude, longitude, accuracy, speed, recordedAt);
        return;
      }
      lastReportRef.current = now;

      if (staffIdRef.current) {
        void getBatterySnapshot()
          .catch(() => null)
          .then((battery) => {
            enqueueLocationPoint({
              latitude,
              longitude,
              accuracy,
              speed,
              source: 'background',
              recordedAt,
              batteryLevel: battery?.battery_level ?? null,
              batteryPercent: battery?.battery_percent ?? null,
              isCharging: battery?.is_charging ?? null,
              batteryCapturedAt: battery?.battery_captured_at ?? null,
              batterySource: battery?.battery_source ?? null,
            });
            lastEnqueuedAtRef.current = Date.now();
          });

        lastUploadAtRef.current = now;
      }

      checkBackgroundGeofences(latitude, longitude, accuracy, speed, recordedAt);
    };

    const onLocation = (
      latitude: number,
      longitude: number,
      accuracy: number | null,
      speed: number | null,
      timestampMs?: number | null,
    ) => {
      handlePosition(latitude, longitude, accuracy, speed, timestampMs);
    };

    const sendHeartbeat = () => {
      const pos = lastKnownPosRef.current;
      const sid = staffIdRef.current;
      const now = Date.now();
      lastJsHeartbeatAtRef.current = now;
      if (pos && sid) {
        lastReportRef.current = now;
        void getBatterySnapshot()
          .catch(() => null)
          .then((battery) => {
            enqueueLocationPoint({
              latitude: pos.lat,
              longitude: pos.lng,
              accuracy: pos.accuracy,
              speed: pos.speed,
              source: 'heartbeat',
              batteryLevel: battery?.battery_level ?? null,
              batteryPercent: battery?.battery_percent ?? null,
              isCharging: battery?.is_charging ?? null,
              batteryCapturedAt: battery?.battery_captured_at ?? null,
              batterySource: battery?.battery_source ?? null,
            });
            lastEnqueuedAtRef.current = Date.now();
            // Ingen direkt flush — periodisk 10-min-batch sköter upload.
          });

        lastUploadAtRef.current = now;
      }
      rescheduleHeartbeat();
    };

    /**
     * Hämta en FÄRSK GPS-position via navigator.geolocation och enqueua.
     * Detta är det som körs på resume/focus/visibilitychange — INTE
     * sendHeartbeat (som bara skickar lastKnownPos). Returnerar true
     * om vi lyckades, false annars. Skickar appHealth-event på resultatet.
     */
    const enqueueFreshPosition = async (reason: string): Promise<boolean> => {
      const sid = staffIdRef.current;
      if (!sid) return false;
      if (typeof navigator === 'undefined' || !navigator.geolocation) return false;

      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (v: boolean) => {
          if (settled) return;
          settled = true;
          resolve(v);
        };
        try {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const latitude = pos.coords.latitude;
              const longitude = pos.coords.longitude;
              const accuracy = pos.coords.accuracy ?? null;
              const speed = pos.coords.speed ?? null;
              lastKnownPosRef.current = { lat: latitude, lng: longitude, accuracy, speed };
              setLatestPosition({ lat: latitude, lng: longitude, accuracy, speed, timestamp: pos.timestamp || Date.now() });
              const recordedAt = new Date(pos.timestamp || Date.now()).toISOString();
              const now = Date.now();
              lastReportRef.current = now;
              lastFreshResumePingAtRef.current = now;
              void getBatterySnapshot()
                .catch(() => null)
                .then((battery) => {
                  enqueueLocationPoint({
                    latitude,
                    longitude,
                    accuracy,
                    speed,
                    source: 'foreground',
                    recordedAt,
                    batteryLevel: battery?.battery_level ?? null,
                    batteryPercent: battery?.battery_percent ?? null,
                    isCharging: battery?.is_charging ?? null,
                    batteryCapturedAt: battery?.battery_captured_at ?? null,
                    batterySource: battery?.battery_source ?? null,
                  });
                  lastEnqueuedAtRef.current = Date.now();
                  // Fresh resume = viktig händelse → force-flush direkt
                  // så att bevis för "tillbaka från lång bakgrund" går
                  // upp till backend utan att vänta på 10-min-cykeln.
                  void forceFlushLocationQueue(`fresh_position:${reason}`);
                });

              // App health: success
              const oid = getCachedOrgId();
              if (oid) {
                void recordAppHealthEvent({
                  organizationId: oid,
                  staffId: sid,
                  eventType: 'location_resume_fresh_position_ok',
                  appState: 'active',
                  skipBattery: true,
                  metadata: {
                    reason,
                    accuracy,
                    source: 'fresh_getCurrentPosition',
                  },
                });
              }
              finish(true);
            },
            (err) => {
              const msg = err?.message || `code_${err?.code}`;
              lastGeolocationErrorRef.current = msg;
              const oid = getCachedOrgId();
              if (oid) {
                void recordAppHealthEvent({
                  organizationId: oid,
                  staffId: sid,
                  eventType: 'location_resume_fresh_position_failed',
                  appState: 'active',
                  skipBattery: true,
                  metadata: {
                    reason,
                    errorMessage: msg,
                    fallbackUsed: !!lastKnownPosRef.current,
                  },
                });
              }
              finish(false);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
          );
        } catch (err: any) {
          const msg = err?.message || String(err);
          lastGeolocationErrorRef.current = msg;
          finish(false);
        }
      });
    };



    const rescheduleHeartbeat = () => {
      const decision = computeMode();
      const prevMode = currentModeRef.current;
      currentHeartbeatMsRef.current = decision.heartbeatMs;
      currentDistanceFilterRef.current = decision.distanceFilter;

      // Separera CAPTURE från UPLOAD: härled capture/upload-policy från
      // aktuell mode och skicka upload-delen till locationSyncQueue så
      // auto-flushen får rätt cadence (30 min inside geofence, 60 s vid
      // boundary, osv). captureThrottle styr lokal enqueue-frekvens.
      // captureDistanceFilter styr native start/restart (kan vara 20 m
      // inom geofence) — INTE decision.distanceFilter (som är upload-
      // policyns vy och kan vara grövre).
      const pos = lastKnownPosRef.current;
      // I) Om vi är inne i en känd geofence (insideRef har targets) =>
      //    behandla som inside oavsett om mode råkar säga active_timer.
      //    active_timer utanför känd plats + rörelse ska bli moving_outside.
      let policyMode: LocationMode | null = decision.mode;
      if (decision.mode === 'active_timer') {
        if (insideRef.current.size > 0) {
          policyMode = 'inside_geofence_pending';
        } else if (
          typeof pos?.speed === 'number' && pos.speed >= 1.2
        ) {
          policyMode = 'workday_far';
        }
      }
      const capture = deriveCaptureUploadPolicy({
        mode: policyMode,
        speedMps: pos?.speed ?? null,
      });
      captureThrottleMsRef.current = capture.captureThrottleMs;
      captureDistanceFilterRef.current = capture.captureDistanceFilter;
      currentUploadModeRef.current = capture.uploadMode;
      currentUploadIntervalMsRef.current = capture.uploadIntervalMs;
      setLocationUploadPolicy({ mode: capture.uploadMode, intervalMs: capture.uploadIntervalMs });

      if (heartbeatTimerRef.current != null) clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = window.setTimeout(sendHeartbeat, decision.heartbeatMs);

      if (Capacitor.isNativePlatform()) {
        // A) Använd capture.captureDistanceFilter för native start/restart.
        maybeRestartNative(capture.captureDistanceFilter);
      }

      const arrivals = loadPendingArrivals();
      const syncStatus = syncStatusRef.current;
      setDebug((prev) => ({
        ...prev,
        currentLocationMode: decision.mode,
        selectedHeartbeatMs: decision.heartbeatMs,
        selectedDistanceFilter: decision.distanceFilter,
        nearestTargetDistanceMeters: decision.nearestTargetDistanceMeters,
        hasActiveTimer: readHasActiveSession(),
        hasPendingArrival: arrivals.length > 0,
        lastPingAt: lastPingAtRef.current,
        lastUploadAt: lastUploadAtRef.current,
        lastNativeRestartAt: lastNativeRestartRef.current || null,
        lastNativeLocationEventAt: lastNativeLocationEventAtRef.current,
        lastJsHeartbeatAt: lastJsHeartbeatAtRef.current,
        lastFreshResumePingAt: lastFreshResumePingAtRef.current,
        lastEnqueuedAt: lastEnqueuedAtRef.current,
        lastAcceptedUploadAt: syncStatus.lastUploadAt,
        lastUploadRejected: syncStatus.lastUploadRejected,
        lastUploadError: syncStatus.lastErrorMessage,
        lastGeolocationError: lastGeolocationErrorRef.current,
        currentDistanceFilter: decision.distanceFilter,
        currentHeartbeatMs: decision.heartbeatMs,
        currentCaptureDistanceFilter: capture.captureDistanceFilter,
        currentCaptureThrottleMs: capture.captureThrottleMs,
        currentUploadMode: capture.uploadMode,
        currentUploadIntervalMs: capture.uploadIntervalMs,
        backendPolicyMode: backendPolicyModeRef.current,
        isNativePlatform: Capacitor.isNativePlatform(),
        appVisibilityState:
          typeof document !== 'undefined'
            ? (document.visibilityState as 'visible' | 'hidden')
            : 'unknown',
      }));


      // ── Mode-telemetri ────────────────────────────────────────────────
      // Vid varje LÄGESBYTE: skicka ett app_health-event så admin kan se
      // EXAKT varför pingar blev glesa (mode=idle 50m → telefonen står still
      // → noll OS-events). Best-effort, fire-and-forget. Maxar sig själv
      // till mode-changes så ingen översvämning vid stillastående.
      if (prevMode !== decision.mode) {
        const sid = staffIdRef.current;
        if (sid) {
          void import('@/lib/mobile/recordAppHealthEvent').then(mod => {
            // Hämta org via cached staff in localStorage (samma som MobileAuth)
            let orgId: string | null = null;
            try {
              const raw = localStorage.getItem('eventflow-mobile-staff');
              if (raw) orgId = JSON.parse(raw)?.organization_id ?? null;
            } catch { /* ignore */ }
            if (!orgId) return;
            void mod.recordAppHealthEvent({
              organizationId: orgId,
              staffId: sid,
              eventType: 'location_mode_changed',
              appState: 'active',
              skipBattery: true,
              metadata: {
                from: prevMode,
                to: decision.mode,
                heartbeatMs: decision.heartbeatMs,
                distanceFilter: decision.distanceFilter,
                nearestTargetDistanceMeters: decision.nearestTargetDistanceMeters,
                hasActiveTimer: readHasActiveSession(),
                hasPendingArrival: arrivals.length > 0,
                reason: decision.reasonForModeChange,
              },
            });
          }).catch(() => { /* never crash on diagnostics */ });
        }
      }
    };

    const readBackendPolicy = (): { heartbeatMs: number; distanceFilter: number; mode: string } | null => {
      try {
        const raw = localStorage.getItem('eventflow-tracking-policy');
        if (!raw) return null;
        const p = JSON.parse(raw);
        if (typeof p?.heartbeatMs !== 'number' || typeof p?.distanceFilter !== 'number') return null;
        // Backend cache is considered fresh for 10 min — beyond that fall back
        // to the local mode engine until next snapshot poll arrives.
        if (typeof p?.cachedAt === 'number' && Date.now() - p.cachedAt > 10 * 60_000) return null;
        return { heartbeatMs: p.heartbeatMs, distanceFilter: p.distanceFilter, mode: String(p.mode ?? '') };
      } catch { return null; }
    };

    const computeMode = (): LocationModeDecision => {
      const targets = loadGeofenceTargets();
      const pos = lastKnownPosRef.current;
      const arrivals = loadPendingArrivals();
      const decoratedTargets = targets.map(t => ({
        key: t.key,
        lat: t.lat,
        lng: t.lng,
        radius: t.radius || ENTER_RADIUS,
        cooldownActive: isInDismissCooldown(t.key),
      }));
      const decision = decideLocationMode({
        position: pos ? { lat: pos.lat, lng: pos.lng } : null,
        targets: decoratedTargets,
        // Workday öppen ELLER aktivitetstimer igång → "i jobbet".
        // Authority = backend; cachen är hint för icke-React loop.
        hasActiveTimer: readHasActiveSession(),
        hasPendingArrival: arrivals.length > 0,
        insideKeys: insideRef.current,
        previousMode: currentModeRef.current,
      });
      logModeChange(currentModeRef.current, decision);
      currentModeRef.current = decision.mode;

      // Backend trackingPolicy styr heartbeatMs (server är authority för
      // cadence). MEN backend distanceFilter får inte göra native tracking
      // glesare än vad lokal near-target/inside-logik vill ha — annars
      // blir telefonen blind nära lager/hem när backend råkar svara
      // battery_saver=500m. Vi tar därför min(backend, local) för
      // distanceFilter via mergeTrackingPolicy.
      const backend = readBackendPolicy();
      const merged = mergeTrackingPolicy({
        backend,
        local: {
          heartbeatMs: decision.heartbeatMs,
          distanceFilter: decision.distanceFilter,
          mode: decision.mode,
        },
      });
      backendPolicyModeRef.current = backend?.mode ?? null;
      return {
        ...decision,
        heartbeatMs: merged.heartbeatMs,
        distanceFilter: merged.distanceFilter,
        reasonForModeChange: `${decision.reasonForModeChange} (${merged.reason})`,
      };
    };


    /**
     * Restart the native tracker with a new distanceFilter when the mode
     * change is significant enough to warrant the cost.
     *   - never restart more than once per RESTART_MIN_INTERVAL_MS (60s)
     *   - only restart if the filter delta ≥ RESTART_DISTANCE_DELTA (30m)
     *   - never run two parallel start() calls
     */
    const maybeRestartNative = (nextFilter: number) => {
      const appliedNextFilter = resolveAppliedTrackingDistanceFilter({
        desiredDistanceFilter: nextFilter,
        isNativePlatform: Capacitor.isNativePlatform(),
      });
      if (restartingNative) return;
      if (appliedDistanceFilter < 0) return; // first start() not yet finished
      const now = Date.now();
      if (Math.abs(appliedNextFilter - appliedDistanceFilter) < RESTART_DISTANCE_DELTA) return;
      if (now - lastNativeRestartRef.current < RESTART_MIN_INTERVAL_MS) return;
      restartingNative = true;
      lastNativeRestartRef.current = now;
      // eslint-disable-next-line no-console
      console.info('[BGLocation] restart for distanceFilter change', {
        from: appliedDistanceFilter, to: appliedNextFilter, desiredDistanceFilter: nextFilter,
      });
      BackgroundGeolocation.stop()
        .catch(() => { /* ignore */ })
        .then(() => startNative(nextFilter))
        .finally(() => { restartingNative = false; });
    };

    const startNative = (distanceFilter: number) => {
      const appliedFilter = resolveAppliedTrackingDistanceFilter({
        desiredDistanceFilter: distanceFilter,
        isNativePlatform: Capacitor.isNativePlatform(),
      });
      appliedDistanceFilter = appliedFilter;
      return BackgroundGeolocation.start(
        {
          backgroundMessage: 'EventFlow Time spårar din position',
          backgroundTitle: 'EventFlow Time',
          requestPermissions: true,
          stale: false,
          distanceFilter: appliedFilter,
        },
        (location, error) => {
          if (stopped) return;
          if (error) {
            if (error.code === 'NOT_AUTHORIZED') {
              console.warn('[BGLocation] User denied location permission');
              try {
                window.dispatchEvent(new CustomEvent('location-permission-denied'));
              } catch { /* ignore */ }
            } else {
              console.warn('[BGLocation] error:', error.code);
            }
            return;
          }
          if (location) {
            onLocation(
              location.latitude,
              location.longitude,
              location.accuracy ?? null,
              location.speed ?? null,
              (location as { time?: number }).time ?? null,
            );
          }
        },
      ).then(() => {
        // eslint-disable-next-line no-console
        console.log(`[BGLocation] native tracking active (distanceFilter=${appliedFilter}m, desired=${distanceFilter}m)`);
      }).catch((err) => {
        console.warn('[BGLocation] Failed to start:', err?.message || err);
      });
    };

    // Kick off first scheduling immediately (this also seeds distanceFilter)
    rescheduleHeartbeat();

    // Re-apply heartbeat as soon as a fresh backend policy arrives.
    const onPolicyUpdated = () => { rescheduleHeartbeat(); };
    window.addEventListener('tracking-policy-updated', onPolicyUpdated);

    // ── FOREGROUND/RESUME FORCE-PING ─────────────────────────────────────
    // iOS pausar JS-setTimeout när webview ligger i bakgrund. När appen
    // återupptas (focus / visibilitychange / Capacitor resume) MÅSTE vi
    // tvinga in en ping omedelbart, annars kan telefonen ha varit "tyst"
    // i flera timmar utan en enda rad i staff_location_history.
    const forcePing = async (reason: string) => {
      // eslint-disable-next-line no-console
      console.info('[BGLocation] forcePing on', reason);
      // 1. Försök ALLTID hämta färsk position först — sendHeartbeat skickar
      //    bara lastKnownPos och kan vara timmar gammal efter bakgrundsperiod.
      const ok = await enqueueFreshPosition(reason);
      if (!ok) {
        // 2. Fallback till lastKnownPos om vi inte kunde hämta färsk fix.
        sendHeartbeat();
      }
      // 3. Reschedule så distanceFilter/heartbeat blir rätt för nuvarande mode.
      rescheduleHeartbeat();
    };
    const onWindowFocus = () => { void forcePing('window-focus'); };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void forcePing('visibilitychange');
      }

    };
    window.addEventListener('focus', onWindowFocus);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    // Capacitor App resume (mest pålitligt på iOS).
    let removeCapResume: (() => void) | null = null;
    void (async () => {
      try {
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import('@capacitor/app');
        const h1 = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void forcePing('cap-appStateChange-active');
        });
        const h2 = await App.addListener('resume', () => { void forcePing('cap-resume'); });

        removeCapResume = () => { void h1.remove(); void h2.remove(); };
      } catch { /* not native — ok */ }
    })();

    const checkBackgroundGeofences = (lat: number, lng: number) => {
      const targets = loadGeofenceTargets();
      if (targets.length === 0) return;

      let arrivals = loadPendingArrivals();
      let changed = false;
      let didEnter = false;
      let didExit = false;
      const arrivalKeys = new Set(arrivals.map(a => a.key));

      for (const target of targets) {
        const dist = haversineDistance(lat, lng, target.lat, target.lng);
        const enterRadius = target.radius || ENTER_RADIUS;
        const exitRadius = enterRadius + 50;

        if (dist <= enterRadius) {
          const cooldownActive = isInDismissCooldown(target.key);
          if (!insideRef.current.has(target.key) && !arrivalKeys.has(target.key) && !cooldownActive) {
            insideRef.current.add(target.key);
            arrivals.push({
              key: target.key,
              name: target.name,
              type: target.type,
              timestamp: Date.now(),
              locationId: target.locationId,
              largeProjectId: target.largeProjectId,
              bookingId: target.bookingId,
              address: target.address,
              radius: enterRadius,
              lat: target.lat,
              lng: target.lng,
            });
            changed = true;
            didEnter = true;
            console.log(`[BGLocation] Pending arrival saved: ${target.name} (${target.key})`);
          } else {
            if (!insideRef.current.has(target.key) && !cooldownActive) {
              didEnter = true;
            }
            insideRef.current.add(target.key);
            if (cooldownActive) {
              // eslint-disable-next-line no-console
              console.info('[BGLocation] entry suppressed by per-target cooldown', { key: target.key });
            }
          }
        } else if (dist > exitRadius) {
          if (insideRef.current.has(target.key)) {
            insideRef.current.delete(target.key);
            didExit = true;
            const beforeLen = arrivals.length;
            arrivals = arrivals.filter(a => a.key !== target.key);
            if (arrivals.length !== beforeLen) {
              changed = true;
              console.log(`[BGLocation] Pending arrival removed (exit): ${target.key}`);
            }
          }
        }
      }

      if (changed) savePendingArrivals(arrivals);
      // Geofence boundary cross → forcera upload direkt så backend ser in/ut
      // även om vi just nu kör batch_inside_geofence (30 min auto-flush).
      if (didEnter) void forceFlushLocationQueue('geofence-enter');
      if (didExit) void forceFlushLocationQueue('geofence-exit');
      // Mode may have changed (entered/exited a target) — reschedule
      rescheduleHeartbeat();
    };

    if (Capacitor.isNativePlatform()) {
      const initialFilter = currentDistanceFilterRef.current || DEFAULT_DISTANCE_FILTER;
      void startNative(initialFilter);

      // NOTE: No cleanup that stops BackgroundGeolocation. Once started, the
      // tracker must live for the entire app lifetime. The mode-driven
      // restart inside maybeRestartNative is the ONLY reason we ever call
      // stop(), and it always immediately re-starts with new options.
      return () => {
        // Intentionally empty.
      };
    } else {
      if (!navigator.geolocation) return;

      const onPosition = (pos: GeolocationPosition) => {
        onLocation(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy ?? null,
          pos.coords.speed ?? null,
        );
      };

      watchIdRef.current = navigator.geolocation.watchPosition(onPosition, (err) => {
        console.warn('[BGLocation] watch error:', err.message);
      }, {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 15000,
      });

      return () => {};
    }
  }, [staffId]);

  return { latestPosition, debug };
};

