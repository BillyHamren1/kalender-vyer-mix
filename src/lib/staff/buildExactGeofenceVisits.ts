/**
 * buildExactGeofenceVisits — räknar projektblock från råpings + geofences.
 *
 * Regel (förenklad):
 *  - Första pingen inom ett geofence öppnar ett projektblock.
 *  - Alla efterföljande pings — innanför ELLER utanför geofencen —
 *    räknas till samma projektblock så länge personen inte går in i
 *    ett ANNAT projekts geofence.
 *  - Pings inne i ett annat projekts geofence avslutar nuvarande
 *    block och öppnar ett nytt där.
 *  - När dagen tar slut utan återinträde trimmas trailing-pings som
 *    ligger utanför geofencen bort — blocket stängs vid sista pingen
 *    inne i staketet.
 *
 * Kort sagt: pings utanför geo hanteras EXAKT som om de vore innanför.
 * Inga "Utanför geo"-delblock, inga separata sub-rader.
 */
import type { Ping } from '@/lib/staff/movementDetection';
import { haversineMeters } from '@/lib/staff/movementDetection';
import type { GeofenceSite } from '@/lib/staff/geofencesToFeatures';
import type { PlaceVisit } from '@/lib/staff/pingPlaceSegments';

function pointInPolygon(lng: number, lat: number, polygon: GeoJSON.Polygon): boolean {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function containsPing(site: GeofenceSite, ping: Ping): boolean {
  if (site.polygon) return pointInPolygon(ping.lng, ping.lat, site.polygon);
  const radius = Math.max(10, Number(site.radiusMeters) || 200);
  return haversineMeters({ lat: site.lat, lng: site.lng }, { lat: ping.lat, lng: ping.lng }) <= radius;
}

function resolveFence(ping: Ping, sites: GeofenceSite[]): GeofenceSite | null {
  let best: { site: GeofenceSite; score: number } | null = null;
  for (const site of sites) {
    if (!containsPing(site, ping)) continue;
    const rawDistance = haversineMeters({ lat: site.lat, lng: site.lng }, { lat: ping.lat, lng: ping.lng });
    const score = site.polygon ? rawDistance : rawDistance / Math.max(1, Number(site.radiusMeters) || 1);
    if (!best || score < best.score) best = { site, score };
  }
  return best?.site ?? null;
}

interface OpenVisit {
  site: GeofenceSite;
  pings: Ping[];
}

interface ClosedVisit {
  site: GeofenceSite;
  pings: Ping[];
  endOverride?: string;
}

export function buildExactGeofenceVisits(rawPings: Ping[], sites: GeofenceSite[]): PlaceVisit[] {
  if (!rawPings.length || !sites.length) return [];

  const sorted = [...rawPings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );

  const visits: PlaceVisit[] = [];
  let open: OpenVisit | null = null;

  const flush = (opts: { endOverride?: string } = {}) => {
    if (!open) return;
    const closed: ClosedVisit = {
      site: open.site,
      pings: open.pings,
      endOverride: opts.endOverride,
    };
    const pings = closed.pings;
    if (pings.length) {
      const start = pings[0].recorded_at;
      const end = closed.endOverride ?? pings[pings.length - 1].recorded_at;
      const durationMin = Math.max(
        0,
        Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000),
      );
      visits.push({
        placeKey: `site:${closed.site.id}:${start}`,
        knownSite: { id: closed.site.id, name: closed.site.name },
        centre: { lat: closed.site.lat, lng: closed.site.lng },
        start,
        end,
        durationMin,
        pingCount: pings.length,
        pings: [...pings],
        subKind: 'inside',
      });
    }
    open = null;
  };

  for (const ping of sorted) {
    const fence = resolveFence(ping, sites);

    if (!open) {
      if (fence) {
        open = { site: fence, pings: [ping] };
      }
      continue;
    }

    if (fence && fence.id !== open.site.id) {
      // Bytt projekt — stäng nuvarande exakt där nästa block tar vid.
      flush({ endOverride: ping.recorded_at });
      open = { site: fence, pings: [ping] };
      continue;
    }

    // Inne i samma fence ELLER utanför alla — räknas till samma block.
    open.pings.push(ping);
  }

  // Slut på dagen — sista öppna blocket tar hela vägen till dagens sista ping.
  flush();
  return visits;
}
