import { useState, useEffect, useCallback, useRef } from 'react';
import { mobileApi, MobileBooking } from '@/services/mobileApiService';
import { PendingArrival, clearPendingArrivals } from '@/hooks/useBackgroundLocationReporter';

export const ENTER_RADIUS = 150; // meters
const EXIT_RADIUS = 200;  // hysteresis to avoid flapping
const TIMERS_KEY = 'eventflow-mobile-timers';
const GPS_SETTINGS_KEY = 'eventflow-mobile-gps-settings';
const GEOFENCE_TARGETS_KEY = 'eventflow-geofence-targets';
const PENDING_ARRIVALS_KEY = 'eventflow-pending-arrivals';

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
    
    // Clean up stale timers older than 24 hours
    const staleThreshold = Date.now() - 24 * 60 * 60 * 1000;
    for (const [key, timer] of map) {
      if (new Date(timer.startTime).getTime() < staleThreshold) {
        console.log('[Geofence] Removing stale timer:', key, timer.startTime);
        map.delete(key);
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
  const [geofenceEvent, setGeofenceEvent] = useState<GeofenceEvent | null>(null);
  const [nearbyBookings, setNearbyBookings] = useState<(MobileBooking & { distance: number })[]>([]);
  const [orgLocations, setOrgLocations] = useState<OrganizationLocationMobile[]>([]);

  const watchIdRef = useRef<number | null>(null);
  const triggeredEnterRef = useRef<Set<string>>(new Set());
  const triggeredExitRef = useRef<Set<string>>(new Set());
  const lastLocationReportRef = useRef<number>(0);
  const staffIdRef = useRef(staffId);
  const activeTimersRef = useRef(activeTimers);

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

        // Fetch open (active) location_time_entries from server
        const today = new Date().toISOString().split('T')[0];
        const entriesRes = await mobileApi.getLocationTimeEntries({ date_from: today, limit: 50 });
        if (cancelled) return;
        const openEntries = (entriesRes.entries || []).filter((e: any) => !e.exited_at);

        // Only restore user-confirmed (manual) timers, NOT auto-GPS entries
        const manualEntries = openEntries.filter((e: any) => e.source !== 'gps');

        if (manualEntries.length > 0) {
          setActiveTimers(prev => {
            const next = new Map(prev);
            for (const entry of manualEntries) {
              const locKey = `location-${entry.location_id}`;
              // Don't overwrite if user already has a local timer for this location
              if (next.has(locKey)) continue;
              const loc = locations.find((l: any) => l.id === entry.location_id);
              next.set(locKey, {
                bookingId: locKey,
                client: loc?.name || 'Plats',
                startTime: entry.entered_at,
                isAutoStarted: false,
                locationId: entry.location_id,
                locationName: loc?.name || 'Plats',
              });
              // Mark as already triggered so geofence doesn't re-fire
              triggeredEnterRef.current.add(locKey);
            }
            return next;
          });
          console.log('[Geofence] Restored', manualEntries.length, 'active manual timers');
        }
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

  // Single consolidated GPS watcher
  useEffect(() => {
    const settings = getGpsSettings();
    if (!settings.enabled || !navigator.geolocation) return;

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
            mobileApi.reportLocation({
              latitude,
              longitude,
              accuracy: accuracy ?? null,
              speed: speed ?? null,
            }).catch((error) => {
              console.warn('Location report failed:', error?.message || error);
            });
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

  // Geofence checks for bookings AND fixed locations
  useEffect(() => {
    if (!userPosition) return;

    const settings = getGpsSettings();
    const enterRadius = settings.radius || ENTER_RADIUS;
    const exitRadius = enterRadius + 50;

    const nearby: (MobileBooking & { distance: number })[] = [];

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
          triggeredEnterRef.current.add(projectKey);
          triggeredExitRef.current.delete(projectKey);
          setGeofenceEvent({
            type: 'enter',
            booking,
            distance: Math.round(dist),
            locationType: 'project',
            largeProjectId: lpId,
            largeProjectName: lpName,
            largeProjectAddress: booking.deliveryaddress || undefined,
            arrivalTimestamp: Date.now(),
          });
        }

        if (dist > exitRadius && hasTimer && activeTimers.get(projectKey)?.isAutoStarted && !triggeredExitRef.current.has(projectKey)) {
          triggeredExitRef.current.add(projectKey);
          triggeredEnterRef.current.delete(projectKey);
          setGeofenceEvent({
            type: 'exit',
            booking,
            distance: Math.round(dist),
            locationType: 'project',
            largeProjectId: lpId,
            largeProjectName: lpName,
            largeProjectAddress: booking.deliveryaddress || undefined,
          });
        }
      } else {
        // Standalone booking
        const hasTimer = activeTimers.has(booking.id);

        if (dist <= enterRadius && !hasTimer && !triggeredEnterRef.current.has(booking.id)) {
          triggeredEnterRef.current.add(booking.id);
          triggeredExitRef.current.delete(booking.id);
          setGeofenceEvent({ type: 'enter', booking, distance: Math.round(dist), locationType: 'booking', arrivalTimestamp: Date.now() });
        }

        if (dist > exitRadius && hasTimer && activeTimers.get(booking.id)?.isAutoStarted && !triggeredExitRef.current.has(booking.id)) {
          triggeredExitRef.current.add(booking.id);
          triggeredEnterRef.current.delete(booking.id);
          setGeofenceEvent({ type: 'exit', booking, distance: Math.round(dist), locationType: 'booking' });
        }
      }
    }

    // Check fixed locations
    for (const loc of orgLocations) {
      const dist = haversineDistance(userPosition.lat, userPosition.lng, loc.latitude, loc.longitude);
      const locKey = `location-${loc.id}`;
      const hasTimer = activeTimers.has(locKey);

      if (dist <= loc.radius_meters && !hasTimer && !triggeredEnterRef.current.has(locKey)) {
        triggeredEnterRef.current.add(locKey);
        triggeredExitRef.current.delete(locKey);
        setGeofenceEvent({
          type: 'enter',
          distance: Math.round(dist),
          locationType: 'fixed',
          locationId: loc.id,
          locationName: loc.name,
          locationAddress: loc.address || undefined,
          arrivalTimestamp: Date.now(),
        });
      }

      if (dist > (loc.radius_meters + 50) && hasTimer && activeTimers.get(locKey)?.isAutoStarted && !triggeredExitRef.current.has(locKey)) {
        triggeredExitRef.current.add(locKey);
        triggeredEnterRef.current.delete(locKey);
        setGeofenceEvent({
          type: 'exit',
          distance: Math.round(dist),
          locationType: 'fixed',
          locationId: loc.id,
          locationName: loc.name,
          locationAddress: loc.address || undefined,
        });
      }
    }

    nearby.sort((a, b) => a.distance - b.distance);
    setNearbyBookings(nearby);
  }, [userPosition, bookings, activeTimers, orgLocations]);

  const startTimer = useCallback((bookingId: string, client: string, isAuto = false, taskId?: string, taskTitle?: string, locationId?: string, locationName?: string, largeProjectId?: string, customStartTime?: string): boolean => {
    const key = locationId ? `location-${locationId}` : bookingId;
    // Block if another timer is already running (allow re-starting the same key)
    const current = activeTimersRef.current;
    if (current.size > 0 && !current.has(key)) {
      return false;
    }
    setActiveTimers(prev => {
      const next = new Map(prev);
      next.set(key, {
        bookingId: key,
        client,
        startTime: customStartTime || new Date().toISOString(),
        isAutoStarted: isAuto,
        establishmentTaskId: taskId,
        establishmentTaskTitle: taskTitle,
        locationId,
        locationName,
        largeProjectId,
      });
      return next;
    });
    triggeredEnterRef.current.add(key);

    // If it's a fixed location manual start, call the API
    if (locationId) {
      mobileApi.startLocationTimer(locationId)
        .then(res => {
          // If timer was already active on server, use the server start time
          if (res.already_active && res.entry?.entered_at) {
            setActiveTimers(prev => {
              const next = new Map(prev);
              const existing = next.get(key);
              if (existing) {
                next.set(key, { ...existing, startTime: res.entry.entered_at });
              }
              return next;
            });
          }
        })
        .catch(err => {
          console.warn('Failed to start location timer on server:', err);
        });
    }
    return true;
  }, []);

  const stopTimer = useCallback((bookingId: string): ActiveTimer | null => {
    const stopped = activeTimersRef.current.get(bookingId) || null;
    setActiveTimers(prev => {
      const next = new Map(prev);
      next.delete(bookingId);
      return next;
    });
    triggeredExitRef.current.add(bookingId);
    // Keep bookingId in triggeredEnterRef so geofence doesn't re-trigger immediately
    triggeredEnterRef.current.add(bookingId);

    // If it's a fixed location, stop on server
    if (stopped?.locationId) {
      mobileApi.stopLocationTimer({ location_id: stopped.locationId }).catch(err => {
        console.warn('Failed to stop location timer on server:', err);
      });
    }

    return stopped;
  }, []);

  const dismissGeofenceEvent = useCallback(() => {
    const event = geofenceEvent;
    setGeofenceEvent(null);

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
    stopTimer,
    dismissGeofenceEvent,
  };
}
