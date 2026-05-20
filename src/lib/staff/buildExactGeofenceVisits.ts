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

export function buildExactGeofenceVisits(rawPings: Ping[], sites: GeofenceSite[]): PlaceVisit[] {
  if (!rawPings.length || !sites.length) return [];

  const sorted = [...rawPings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );

  const visits: PlaceVisit[] = [];
  let activeSite: GeofenceSite | null = null;
  let activePings: Ping[] = [];

  const closeActive = () => {
    if (!activeSite || !activePings.length) return;
    const start = activePings[0].recorded_at;
    const end = activePings[activePings.length - 1].recorded_at;
    visits.push({
      placeKey: `site:${activeSite.id}:${start}`,
      knownSite: { id: activeSite.id, name: activeSite.name },
      centre: { lat: activeSite.lat, lng: activeSite.lng },
      start,
      end,
      durationMin: Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000)),
      pingCount: activePings.length,
      pings: [...activePings],
    });
    activeSite = null;
    activePings = [];
  };

  for (const ping of sorted) {
    const nextSite = resolveFence(ping, sites);
    if (!activeSite) {
      if (nextSite) {
        activeSite = nextSite;
        activePings = [ping];
      }
      continue;
    }

    if (nextSite && nextSite.id === activeSite.id) {
      activePings.push(ping);
      continue;
    }

    closeActive();
    if (nextSite) {
      activeSite = nextSite;
      activePings = [ping];
    }
  }

  closeActive();
  return visits;
}