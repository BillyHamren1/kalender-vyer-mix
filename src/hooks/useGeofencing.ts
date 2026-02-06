import { useState, useEffect, useCallback, useRef } from 'react';
import { MobileBooking } from '@/services/mobileApiService';

const ENTER_RADIUS = 150; // meters
const EXIT_RADIUS = 200;  // hysteresis to avoid flapping
const TIMERS_KEY = 'eventflow-mobile-timers';
const GPS_SETTINGS_KEY = 'eventflow-mobile-gps-settings';

export interface ActiveTimer {
  bookingId: string;
  client: string;
  startTime: string; // ISO
  isAutoStarted: boolean;
}

export interface GeofenceEvent {
  type: 'enter' | 'exit';
  booking: MobileBooking;
  distance: number;
}

interface GpsSettings {
  enabled: boolean;
  radius: number;
}

// Haversine distance in meters (from track-vehicle-gps)
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

export function useGeofencing(bookings: MobileBooking[]) {
  const [activeTimers, setActiveTimers] = useState<Map<string, ActiveTimer>>(loadTimers);
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [geofenceEvent, setGeofenceEvent] = useState<GeofenceEvent | null>(null);
  const [nearbyBookings, setNearbyBookings] = useState<(MobileBooking & { distance: number })[]>([]);

  const watchIdRef = useRef<number | null>(null);
  const triggeredEnterRef = useRef<Set<string>>(new Set());
  const triggeredExitRef = useRef<Set<string>>(new Set());

  // Persist timers on change
  useEffect(() => {
    saveTimers(activeTimers);
  }, [activeTimers]);

  // GPS tracking
  useEffect(() => {
    const settings = getGpsSettings();
    if (!settings.enabled || !navigator.geolocation) return;

    setIsTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        console.warn('GPS error:', err.message);
        setIsTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTracking(false);
    };
  }, []);

  // Geofence checks
  useEffect(() => {
    if (!userPosition) return;

    const settings = getGpsSettings();
    const enterRadius = settings.radius || ENTER_RADIUS;
    const exitRadius = enterRadius + 50; // hysteresis

    const nearby: (MobileBooking & { distance: number })[] = [];

    for (const booking of bookings) {
      if (!booking.delivery_latitude || !booking.delivery_longitude) continue;

      const dist = haversineDistance(
        userPosition.lat, userPosition.lng,
        booking.delivery_latitude, booking.delivery_longitude
      );

      if (dist < 1000) {
        nearby.push({ ...booking, distance: Math.round(dist) });
      }

      const hasTimer = activeTimers.has(booking.id);

      // ENTER geofence
      if (dist <= enterRadius && !hasTimer && !triggeredEnterRef.current.has(booking.id)) {
        triggeredEnterRef.current.add(booking.id);
        triggeredExitRef.current.delete(booking.id);
        setGeofenceEvent({ type: 'enter', booking, distance: Math.round(dist) });
      }

      // EXIT geofence
      if (dist > exitRadius && hasTimer && activeTimers.get(booking.id)?.isAutoStarted && !triggeredExitRef.current.has(booking.id)) {
        triggeredExitRef.current.add(booking.id);
        triggeredEnterRef.current.delete(booking.id);
        setGeofenceEvent({ type: 'exit', booking, distance: Math.round(dist) });
      }
    }

    nearby.sort((a, b) => a.distance - b.distance);
    setNearbyBookings(nearby);
  }, [userPosition, bookings, activeTimers]);

  const startTimer = useCallback((bookingId: string, client: string, isAuto = false) => {
    setActiveTimers(prev => {
      const next = new Map(prev);
      next.set(bookingId, {
        bookingId,
        client,
        startTime: new Date().toISOString(),
        isAutoStarted: isAuto,
      });
      return next;
    });
    triggeredEnterRef.current.add(bookingId);
  }, []);

  const stopTimer = useCallback((bookingId: string): ActiveTimer | null => {
    let stopped: ActiveTimer | null = null;
    setActiveTimers(prev => {
      const next = new Map(prev);
      stopped = next.get(bookingId) || null;
      next.delete(bookingId);
      return next;
    });
    triggeredExitRef.current.add(bookingId);
    triggeredEnterRef.current.delete(bookingId);
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
    startTimer,
    stopTimer,
    dismissGeofenceEvent,
  };
}
