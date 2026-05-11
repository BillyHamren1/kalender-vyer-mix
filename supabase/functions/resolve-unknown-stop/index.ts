// @ts-nocheck
// resolve-unknown-stop
//
// READ-ONLY enrichment for "Osäker period" / unknown_place blocks i admin-tidrapporten.
// Tar lat/lng + staff + tid och returnerar:
//   - reverse-geocodad adress (Mapbox)
//   - närmaste organization_locations
//   - personalens private zone (home/manual_ignore/recurring_night)
//   - matchande bokningar (idag/framtida/tidigare) inom radius
//   - tidigare besök på platsen (staff_location_history)
//
// Inga writes. Org-isolerat. JWT eller mobile-token via _shared/staff-auth.

import { authenticateStaffRequest } from '../_shared/staff-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const trimAddress = (full: string): string => {
  const parts = full.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
  return parts[0] || full;
};

async function reverseGeocode(lat: number, lng: number): Promise<{ label: string; source: 'mapbox' } | null> {
  const token = Deno.env.get('MAPBOX_PUBLIC_TOKEN') || Deno.env.get('MAPBOX_TOKEN');
  if (!token) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&language=sv&types=address,poi,locality,place&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const placeName: string | undefined = data?.features?.[0]?.place_name;
    if (!placeName) return null;
    return { label: trimAddress(placeName), source: 'mapbox' };
  } catch {
    return null;
  }
}

interface RequestBody {
  staffId: string;
  lat: number;
  lng: number;
  atIso: string;
  radiusMeters?: number;
}

function relativeDays(eventDate: string, atIso: string): { rel: number; dir: 'today' | 'future' | 'past' } {
  const a = new Date(`${eventDate}T00:00:00Z`).getTime();
  const b = new Date(atIso).getTime();
  const diffDays = Math.round((a - b) / (24 * 3600 * 1000));
  if (diffDays === 0) return { rel: 0, dir: 'today' };
  return { rel: diffDays, dir: diffDays > 0 ? 'future' : 'past' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonRes({ error: 'method_not_allowed' }, 405);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonRes({ error: 'invalid_json' }, 400);
  }
  const { staffId, lat, lng, atIso } = body;
  const radiusMeters = Math.min(Math.max(body.radiusMeters ?? 250, 50), 1000);
  if (!staffId || typeof lat !== 'number' || typeof lng !== 'number' || !atIso) {
    return jsonRes({ error: 'missing_params' }, 400);
  }

  const authRes = await authenticateStaffRequest(req);
  if (!authRes.ok) return jsonRes({ error: authRes.err.error }, authRes.err.status);
  const { admin, organizationId } = authRes.auth;

  // Verify staffId belongs to caller's org (mobile mode self-check redan i auth)
  const { data: staffRow } = await admin
    .from('staff_members')
    .select('id, organization_id')
    .eq('id', staffId)
    .maybeSingle();
  if (!staffRow || staffRow.organization_id !== organizationId) {
    return jsonRes({ error: 'staff_not_in_org' }, 404);
  }

  // Parallellt: reverse-geocode + fyra DB-queries (alla org-filtrerade)
  const PRIVATE_ZONE_RADIUS = 100;
  const PRIOR_VISIT_RADIUS = 100;
  const sixtyDays = 60 * 24 * 3600 * 1000;
  const fromDate = new Date(new Date(atIso).getTime() - sixtyDays).toISOString().slice(0, 10);
  const toDate = new Date(new Date(atIso).getTime() + sixtyDays).toISOString().slice(0, 10);

  const [
    reverseGeocoded,
    locationsRes,
    privateZonesRes,
    bookingsRes,
    historyRes,
  ] = await Promise.all([
    reverseGeocode(lat, lng),
    admin
      .from('organization_locations')
      .select('id, name, address, latitude, longitude, radius_meters, is_active')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null),
    admin
      .from('staff_private_zones')
      .select('id, kind, label, lat, lng, radius_m, active')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .eq('active', true),
    admin
      .from('bookings')
      .select('id, booking_number, title, client, deliveryaddress, delivery_latitude, delivery_longitude, eventdate, status')
      .eq('organization_id', organizationId)
      .gte('eventdate', fromDate)
      .lte('eventdate', toDate)
      .not('delivery_latitude', 'is', null)
      .not('delivery_longitude', 'is', null)
      .limit(2000),
    admin
      .from('staff_location_history')
      .select('lat, lng, recorded_at')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .lt('recorded_at', atIso)
      .gte('recorded_at', new Date(new Date(atIso).getTime() - 180 * 24 * 3600 * 1000).toISOString())
      .limit(5000),
  ]);

  // Närmaste organization_location
  let knownLocation: { id: string; name: string; address: string | null; distanceMeters: number } | null = null;
  for (const l of (locationsRes.data ?? [])) {
    if (l.latitude == null || l.longitude == null) continue;
    const d = haversineMeters(lat, lng, l.latitude, l.longitude);
    if (d <= radiusMeters && (!knownLocation || d < knownLocation.distanceMeters)) {
      knownLocation = {
        id: l.id,
        name: l.name,
        address: l.address ?? null,
        distanceMeters: Math.round(d),
      };
    }
  }

  // Privat zon (närmaste inom 100 m, valfri större radie)
  let privateZone:
    | { kind: string; label: string; distanceMeters: number }
    | null = null;
  for (const z of (privateZonesRes.data ?? [])) {
    if (z.lat == null || z.lng == null) continue;
    const d = haversineMeters(lat, lng, Number(z.lat), Number(z.lng));
    const radius = Math.max(z.radius_m ?? 0, PRIVATE_ZONE_RADIUS);
    if (d <= radius && (!privateZone || d < privateZone.distanceMeters)) {
      privateZone = {
        kind: z.kind,
        label: z.label || (z.kind === 'home' ? 'Hemma' : z.kind),
        distanceMeters: Math.round(d),
      };
    }
  }

  // Matchande bokningar inom radius. Sortera på närhet i tid (idag först, sedan absolut diff).
  const bookingMatches: Array<{
    bookingId: string;
    bookingNumber: string | null;
    label: string;
    address: string | null;
    eventDate: string;
    relativeDays: number;
    direction: 'today' | 'future' | 'past';
    distanceMeters: number;
  }> = [];
  for (const b of (bookingsRes.data ?? [])) {
    if (b.delivery_latitude == null || b.delivery_longitude == null || !b.eventdate) continue;
    const d = haversineMeters(lat, lng, b.delivery_latitude, b.delivery_longitude);
    if (d > radiusMeters) continue;
    const { rel, dir } = relativeDays(b.eventdate, atIso);
    bookingMatches.push({
      bookingId: b.id,
      bookingNumber: b.booking_number ?? null,
      label: b.title || b.client || b.deliveryaddress || (b.booking_number ?? 'Bokning'),
      address: b.deliveryaddress ?? null,
      eventDate: b.eventdate,
      relativeDays: rel,
      direction: dir,
      distanceMeters: Math.round(d),
    });
  }
  bookingMatches.sort((a, b) => Math.abs(a.relativeDays) - Math.abs(b.relativeDays) || a.distanceMeters - b.distanceMeters);
  const matchingBookings = bookingMatches.slice(0, 5);

  // Tidigare besök: GPS-pings inom 100 m som inte ligger inom denna timme.
  const oneHourMs = 60 * 60 * 1000;
  const atMs = new Date(atIso).getTime();
  const visitDays = new Set<string>();
  let totalNearbyPings = 0;
  let firstSeenIso: string | null = null;
  let lastSeenIso: string | null = null;
  for (const h of (historyRes.data ?? [])) {
    if (h.lat == null || h.lng == null || !h.recorded_at) continue;
    const d = haversineMeters(lat, lng, Number(h.lat), Number(h.lng));
    if (d > PRIOR_VISIT_RADIUS) continue;
    const ts = new Date(h.recorded_at).getTime();
    if (Math.abs(ts - atMs) < oneHourMs) continue; // exkludera den aktuella vistelsen
    totalNearbyPings++;
    visitDays.add(h.recorded_at.slice(0, 10));
    if (!firstSeenIso || h.recorded_at < firstSeenIso) firstSeenIso = h.recorded_at;
    if (!lastSeenIso || h.recorded_at > lastSeenIso) lastSeenIso = h.recorded_at;
  }
  // Approximera total tid: pings × ~1 min (heuristisk) — markerat som approx
  const priorVisits = totalNearbyPings > 0
    ? {
        visitCount: visitDays.size,
        pingCount: totalNearbyPings,
        firstSeenIso,
        lastSeenIso,
        approxMinutes: totalNearbyPings, // 1 ping ≈ 1 min
      }
    : null;

  return jsonRes({
    reverseGeocoded,
    knownLocation,
    privateZone,
    matchingBookings,
    priorVisits,
    debug: {
      organizationId,
      staffId,
      lat,
      lng,
      atIso,
      radiusMeters,
      locationsScanned: (locationsRes.data ?? []).length,
      privateZonesScanned: (privateZonesRes.data ?? []).length,
      bookingsScanned: (bookingsRes.data ?? []).length,
      historyPingsScanned: (historyRes.data ?? []).length,
    },
  });
});
