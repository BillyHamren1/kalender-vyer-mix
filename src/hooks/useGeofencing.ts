import { useState, useEffect, useCallback, useRef } from 'react';
import { mobileApi, MobileBooking } from '@/services/mobileApiService';

const ENTER_RADIUS = 150; // meters
const EXIT_RADIUS = 200;  // hysteresis to avoid flapping
const TIMERS_KEY = 'eventflow-mobile-timers';
const GPS_SETTINGS_KEY = 'eventflow-mobile-gps-settings';

export interface ActiveTimer {
  bookingId: string;
  client: string;
  startTime: string; // ISO
  isAutoStarted: boolean;
  establishmentTaskId?: string;
  establishmentTaskTitle?: string;
  locationId?: string;       // if this is a fixed-location timer
  locationName?: string;
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
}

export interface OrganizationLocationMobile {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
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
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
    return new Map(arr);
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

  // Persist timers on change
  useEffect(() => {
    saveTimers(activeTimers);
  }, [activeTimers]);

  // Fetch organization locations once
  useEffect(() => {
    if (!staffId) return;
    mobileApi.getOrganizationLocations()
      .then(res => setOrgLocations(res.locations || []))
      .catch(err => console.warn('Failed to fetch org locations:', err));
  }, [staffId]);

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
        setIsTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
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
      const lpId = (booking as any).large_project_id;
      const lpName = (booking as any).large_project_name;

      if (lpId && lpName) {
        // Skip if we already triggered for this project in this cycle
        if (triggeredProjects.has(lpId)) continue;
        triggeredProjects.add(lpId);

        const projectKey = `project-${lpId}`;
        const hasTimer = activeTimers.has(projectKey);

        if (dist <= enterRadius && !hasTimer && !triggeredEnterRef.current.has(projectKey)) {
          triggeredEnterRef.current.add(projectKey);
          triggeredExitRef.current.delete(projectKey);
          setGeofenceEvent({
            type: 'enter',
            booking,
            distance: Math.round(dist),
            locationType: 'project',
            largeProjectId: lpId,
            largeProjectName: lpName,
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
          });
        }
      } else {
        // Standalone booking
        const hasTimer = activeTimers.has(booking.id);

        if (dist <= enterRadius && !hasTimer && !triggeredEnterRef.current.has(booking.id)) {
          triggeredEnterRef.current.add(booking.id);
          triggeredExitRef.current.delete(booking.id);
          setGeofenceEvent({ type: 'enter', booking, distance: Math.round(dist), locationType: 'booking' });
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

  const startTimer = useCallback((bookingId: string, client: string, isAuto = false, taskId?: string, taskTitle?: string, locationId?: string, locationName?: string) => {
    const key = locationId ? `location-${locationId}` : bookingId;
    setActiveTimers(prev => {
      const next = new Map(prev);
      next.set(key, {
        bookingId: key,
        client,
        startTime: new Date().toISOString(),
        isAutoStarted: isAuto,
        establishmentTaskId: taskId,
        establishmentTaskTitle: taskTitle,
        locationId,
        locationName,
      });
      return next;
    });
    triggeredEnterRef.current.add(key);

    // If it's a fixed location manual start, call the API
    if (locationId) {
      mobileApi.startLocationTimer(locationId).catch(err => {
        console.warn('Failed to start location timer on server:', err);
      });
    }
  }, []);

  const stopTimer = useCallback((bookingId: string): ActiveTimer | null => {
    const stopped = activeTimersRef.current.get(bookingId) || null;
    setActiveTimers(prev => {
      const next = new Map(prev);
      next.delete(bookingId);
      return next;
    });
    triggeredExitRef.current.add(bookingId);
    triggeredEnterRef.current.delete(bookingId);

    // If it's a fixed location, stop on server
    if (stopped?.locationId) {
      mobileApi.stopLocationTimer({ location_id: stopped.locationId }).catch(err => {
        console.warn('Failed to stop location timer on server:', err);
      });
    }

    return stopped;
  }, []);

  const dismissGeofenceEvent = useCallback(() => {
    setGeofenceEvent(null);
  }, []);

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
