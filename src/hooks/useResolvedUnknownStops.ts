import { useQueries } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ResolvedUnknownStop {
  reverseGeocoded: { label: string; source: 'mapbox' } | null;
  knownLocation: { id: string; name: string; address: string | null; distanceMeters: number } | null;
  privateZone: { kind: string; label: string; distanceMeters: number } | null;
  matchingBookings: Array<{
    bookingId: string;
    bookingNumber: string | null;
    label: string;
    address: string | null;
    eventDate: string;
    relativeDays: number;
    direction: 'today' | 'future' | 'past';
    distanceMeters: number;
  }>;
  priorVisits: {
    visitCount: number;
    pingCount: number;
    firstSeenIso: string | null;
    lastSeenIso: string | null;
    approxMinutes: number;
  } | null;
}

export interface UnknownStopRequest {
  /** Stable id för cache (block.id räcker). */
  key: string;
  staffId: string;
  lat: number;
  lng: number;
  atIso: string;
  radiusMeters?: number;
}

const round = (n: number) => Math.round(n * 1000) / 1000; // ~100m bucket

async function callResolve(req: UnknownStopRequest): Promise<ResolvedUnknownStop | null> {
  const { data, error } = await supabase.functions.invoke('resolve-unknown-stop', {
    body: {
      staffId: req.staffId,
      lat: req.lat,
      lng: req.lng,
      atIso: req.atIso,
      radiusMeters: req.radiusMeters,
    },
  });
  if (error) return null;
  return (data ?? null) as ResolvedUnknownStop | null;
}

/**
 * Slå upp en eller flera "Osäker period"-koordinater i parallell.
 * Returnerar en Map<key, ResolvedUnknownStop | null>.
 */
export function useResolvedUnknownStops(reqs: UnknownStopRequest[]): Map<string, ResolvedUnknownStop | null> {
  const results = useQueries({
    queries: reqs.map((r) => ({
      queryKey: [
        'resolve-unknown-stop',
        r.staffId,
        round(r.lat),
        round(r.lng),
        r.atIso.slice(0, 10),
      ],
      queryFn: () => callResolve(r),
      staleTime: 60 * 60 * 1000,
      gcTime: 6 * 60 * 60 * 1000,
      retry: 1,
    })),
  });
  const out = new Map<string, ResolvedUnknownStop | null>();
  reqs.forEach((r, i) => out.set(r.key, (results[i].data as ResolvedUnknownStop | null) ?? null));
  return out;
}
