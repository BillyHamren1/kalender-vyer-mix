import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BackgroundGeolocation } from '@capgo/background-geolocation';
import {
  enqueueLocationPoint,
  flushLocationQueue,
  getLocationSyncStatus,
  subscribeLocationSyncStatus,
  type LocationSyncStatus,
} from '@/services/locationSyncQueue';
import { getBatterySnapshot } from '@/lib/mobile/getBatterySnapshot';
import { GpsPosition, haversineDistance, ENTER_RADIUS } from '@/hooks/useGeofencing';
import {
  decideLocationMode,
  logModeChange,
  type LocationMode,
  type LocationModeDecision,
} from '@/lib/geofence/locationMode';
import { isInDismissCooldown } from '@/lib/geofence/dismissCooldown';
import { isWorkdayActive } from '@/lib/workday/workdayActiveSignal';
import { recordAppHealthEvent } from '@/lib/mobile/recordAppHealthEvent';


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
// Sänkt 2026-05-18 från 30s → 10s. iOS levererar location-events glest i
// bakgrund (en update vid varje >distanceFilter rörelse). 30s throttle slukade
// då ~75 % av dem och det enda spåret in i DB försvann.
const REPORT_THROTTLE_MS = 10_000;     // normal movement-driven report
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
  backendPolicyMode: string | null;
  isNativePlatform: boolean;
  appVisibilityState: 'visible' | 'hidden' | 'unknown';
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
    backendPolicyMode: null,
    isNativePlatform: typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform(),
    appVisibilityState:
      typeof document !== 'undefined'
        ? (document.visibilityState as 'visible' | 'hidden')
        : 'unknown',
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

    const handlePosition = (latitude: number, longitude: number, accuracy: number | null, speed: number | null) => {
      lastPingAtRef.current = Date.now();
      lastNativeLocationEventAtRef.current = Date.now();
      setLatestPosition({ lat: latitude, lng: longitude, accuracy, speed, timestamp: Date.now() });
      lastKnownPosRef.current = { lat: latitude, lng: longitude, accuracy, speed };

      const now = Date.now();
      if (now - lastReportRef.current < REPORT_THROTTLE_MS) {
        checkBackgroundGeofences(latitude, longitude);
        return;
      }
      lastReportRef.current = now;

      if (staffIdRef.current) {
        // Capture battery snapshot but never let it block the GPS ping.
        void getBatterySnapshot()
          .catch(() => null)
          .then((battery) => {
            enqueueLocationPoint({
              latitude,
              longitude,
              accuracy,
              speed,
              source: 'background',
              batteryLevel: battery?.battery_level ?? null,
              batteryPercent: battery?.battery_percent ?? null,
              isCharging: battery?.is_charging ?? null,
              batteryCapturedAt: battery?.battery_captured_at ?? null,
              batterySource: battery?.battery_source ?? null,
            });
            lastEnqueuedAtRef.current = Date.now();
            void flushLocationQueue();
          });
        // DEPRECATED: lastUploadAt = enqueue, INTE server-accepted.
        // Kvar för bakåtkomp. Använd lastAcceptedUploadAt för sanning.
        lastUploadAtRef.current = now;
      }

      checkBackgroundGeofences(latitude, longitude);
    };

    const onLocation = (latitude: number, longitude: number, accuracy: number | null, speed: number | null) => {
      handlePosition(latitude, longitude, accuracy, speed);
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
            void flushLocationQueue();
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
                  void flushLocationQueue();
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
      if (heartbeatTimerRef.current != null) clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = window.setTimeout(sendHeartbeat, decision.heartbeatMs);

      if (Capacitor.isNativePlatform()) {
        maybeRestartNative(decision.distanceFilter);
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

      // Backend trackingPolicy is the single source of truth for heartbeat
      // and distanceFilter when present. The local mode engine still runs to
      // detect approach/inside transitions, but its cadence is overridden so
      // the app cannot invent a denser tracking intensity than the server.
      const backend = readBackendPolicy();
      if (backend) {
        backendPolicyModeRef.current = backend.mode;
        return {
          ...decision,
          heartbeatMs: backend.heartbeatMs,
          distanceFilter: backend.distanceFilter,
          reasonForModeChange: `${decision.reasonForModeChange} (backend:${backend.mode})`,
        };
      }
      backendPolicyModeRef.current = null;
      return decision;
    };


    /**
     * Restart the native tracker with a new distanceFilter when the mode
     * change is significant enough to warrant the cost.
     *   - never restart more than once per RESTART_MIN_INTERVAL_MS (60s)
     *   - only restart if the filter delta ≥ RESTART_DISTANCE_DELTA (30m)
     *   - never run two parallel start() calls
     */
    const maybeRestartNative = (nextFilter: number) => {
      if (restartingNative) return;
      if (appliedDistanceFilter < 0) return; // first start() not yet finished
      const now = Date.now();
      if (Math.abs(nextFilter - appliedDistanceFilter) < RESTART_DISTANCE_DELTA) return;
      if (now - lastNativeRestartRef.current < RESTART_MIN_INTERVAL_MS) return;
      restartingNative = true;
      lastNativeRestartRef.current = now;
      // eslint-disable-next-line no-console
      console.info('[BGLocation] restart for distanceFilter change', {
        from: appliedDistanceFilter, to: nextFilter,
      });
      BackgroundGeolocation.stop()
        .catch(() => { /* ignore */ })
        .then(() => startNative(nextFilter))
        .finally(() => { restartingNative = false; });
    };

    const startNative = (distanceFilter: number) => {
      appliedDistanceFilter = distanceFilter;
      return BackgroundGeolocation.start(
        {
          backgroundMessage: 'EventFlow Time spårar din position',
          backgroundTitle: 'EventFlow Time',
          requestPermissions: true,
          stale: false,
          distanceFilter,
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
            onLocation(location.latitude, location.longitude, location.accuracy ?? null, location.speed ?? null);
          }
        },
      ).then(() => {
        // eslint-disable-next-line no-console
        console.log(`[BGLocation] native tracking active (distanceFilter=${distanceFilter}m)`);
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
          if (isActive) forcePing('cap-appStateChange-active');
        });
        const h2 = await App.addListener('resume', () => forcePing('cap-resume'));
        removeCapResume = () => { void h1.remove(); void h2.remove(); };
      } catch { /* not native — ok */ }
    })();

    const checkBackgroundGeofences = (lat: number, lng: number) => {
      const targets = loadGeofenceTargets();
      if (targets.length === 0) return;

      let arrivals = loadPendingArrivals();
      let changed = false;
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
            console.log(`[BGLocation] Pending arrival saved: ${target.name} (${target.key})`);
          } else {
            insideRef.current.add(target.key);
            if (cooldownActive) {
              // eslint-disable-next-line no-console
              console.info('[BGLocation] entry suppressed by per-target cooldown', { key: target.key });
            }
          }
        } else if (dist > exitRadius) {
          if (insideRef.current.has(target.key)) {
            insideRef.current.delete(target.key);
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

