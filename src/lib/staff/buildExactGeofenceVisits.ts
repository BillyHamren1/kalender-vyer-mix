/**
 * buildExactGeofenceVisits — räknar projektblock från råpings + geofences.
 *
 * Regler (se mem://):
 *  - Första pingen inom ett geofence öppnar ett aktivt projektblock.
 *  - Pings inom samma projekt → ligger kvar i ett `inside`-delblock.
 *  - Pings utanför ALLA geofences medan projektet är aktivt → bildar
 *    ett `outside_geo`-delblock UNDER samma projekt. Tiden får ALDRIG
 *    försvinna bara för att personen lämnat staketet kort.
 *  - Pings inom ett ANNAT projekts geofence → enda sättet att avsluta
 *    nuvarande projektkedja. Då startar ett nytt projektblock där.
 *  - Slut på dagen utan återinträde → eventuellt `outside_geo`-delblock
 *    ligger kvar under aktivt projekt.
 *
 * Returvärdet är en flat lista av PlaceVisit där varje sub-block är
 * en egen rad. Alla sub-blocks som hör till samma projektkedja delar
 * `knownSite.id` och `centre` så att UI:s gruppering per projekt
 * (Map<knownSite.id, ...>) sätter dem i samma panel i rätt ordning.
 *
 * `subKind: 'inside' | 'outside_geo'` används av UI för att etikettera
 * raden ("B2 (Utanför geo)").
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

type SubKind = 'inside' | 'outside_geo';

interface OpenSub {
  kind: SubKind;
  pings: Ping[];
}

export function buildExactGeofenceVisits(rawPings: Ping[], sites: GeofenceSite[]): PlaceVisit[] {
  if (!rawPings.length || !sites.length) return [];

  const sorted = [...rawPings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );

  const visits: PlaceVisit[] = [];
  let activeSite: GeofenceSite | null = null;
  let openSubs: OpenSub[] = [];
  let current: OpenSub | null = null;

  const flushSubsForActive = (opts: { dropTrailingOutside: boolean }) => {
    if (!activeSite) return;
    let subs = openSubs;
    if (opts.dropTrailingOutside) {
      // Personen lämnade projektet och kom ALDRIG tillbaka (eller dagen tog slut).
      // Då ska efterföljande outside_geo-block INTE visas — projektet stängs
      // vid sista pingen inne i geofencen.
      while (subs.length && subs[subs.length - 1].kind === 'outside_geo') {
        subs = subs.slice(0, -1);
      }
    }
    for (const sub of subs) {
      if (!sub.pings.length) continue;
      const start = sub.pings[0].recorded_at;
      const end = sub.pings[sub.pings.length - 1].recorded_at;
      const durationMin = Math.max(
        0,
        Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000),
      );
      visits.push({
        placeKey: `site:${activeSite.id}:${sub.kind}:${start}`,
        knownSite: { id: activeSite.id, name: activeSite.name },
        centre: { lat: activeSite.lat, lng: activeSite.lng },
        start,
        end,
        durationMin,
        pingCount: sub.pings.length,
        pings: [...sub.pings],
        subKind: sub.kind,
      });
    }
    openSubs = [];
    current = null;
    activeSite = null;
  };


  const startSub = (kind: SubKind, ping: Ping) => {
    current = { kind, pings: [ping] };
    openSubs.push(current);
  };

  for (const ping of sorted) {
    const fence = resolveFence(ping, sites);

    // Inget aktivt projekt — vänta tills vi går in i en geofence.
    if (!activeSite) {
      if (fence) {
        activeSite = fence;
        startSub('inside', ping);
      }
      continue;
    }

    // Aktivt projekt finns.
    if (fence && fence.id === activeSite.id) {
      // Tillbaka inne i samma projekt.
      if (current && current.kind === 'inside') {
        current.pings.push(ping);
      } else {
        startSub('inside', ping);
      }
      continue;
    }

    if (fence && fence.id !== activeSite.id) {
      // Bytt projekt → enda läget som avslutar aktivt projekt.
      // Trailing outside_geo bevaras under det gamla projektet (transport
      // till nya platsen tillhör avresan).
      flushSubsForActive({ dropTrailingOutside: false });
      activeSite = fence;
      startSub('inside', ping);
      continue;
    }

    // Utanför alla geofences medan projektet är aktivt.
    if (current && current.kind === 'outside_geo') {
      current.pings.push(ping);
    } else {
      startSub('outside_geo', ping);
    }
  }

  // Slut på dagen utan återinträde → släng trailing outside_geo.
  flushSubsForActive({ dropTrailingOutside: true });
  return visits;
}

