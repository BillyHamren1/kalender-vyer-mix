import { useCallback, useEffect, useState } from 'react';
import { mobileApi } from '@/services/mobileApiService';
import type { GpsPosition } from '@/hooks/useGeofencing';

/**
 * useUnplannedSiteVisit
 * ---------------------
 * Tracks a single in-progress "unplanned site visit" — i.e. when the user
 * accepted Scenario A and we opened a location_time_entry against the
 * planned booking.
 *
 * Stops automatically when the user moves >300 m away from the visit's
 * coordinates (geofence-exit), or manually via end().
 */

const STORAGE_KEY = 'eventflow-unplanned-site-visit';
const EXIT_RADIUS_M = 300;

export interface UnplannedVisit {
  entry_id: string;
  booking_id: string;
  client: string;
  lat: number;
  lng: number;
  started_at: string;
  note: string;
}

function load(): UnplannedVisit | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(v: UnplannedVisit | null) {
  if (v) localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  else localStorage.removeItem(STORAGE_KEY);
}

function distMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useUnplannedSiteVisit(latestPosition: GpsPosition | null) {
  const [visit, setVisit] = useState<UnplannedVisit | null>(load);

  const start = useCallback((v: UnplannedVisit) => {
    save(v);
    setVisit(v);
  }, []);

  const end = useCallback(async () => {
    const current = visit || load();
    if (!current) return;
    try {
      await mobileApi.endUnplannedSiteVisit({ entry_id: current.entry_id });
    } catch (err) {
      console.warn('[useUnplannedSiteVisit] end failed:', err);
    }
    save(null);
    setVisit(null);
  }, [visit]);

  // Auto-stop on geofence exit
  useEffect(() => {
    if (!visit || !latestPosition) return;
    const d = distMeters(visit.lat, visit.lng, latestPosition.lat, latestPosition.lng);
    if (d > EXIT_RADIUS_M) {
      void end();
    }
  }, [visit, latestPosition, end]);

  return { visit, active: !!visit, start, end };
}
