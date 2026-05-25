// Time v2 — buildDayMap
// =============================================================================
// PURE: bygger en renderbar karta (geojson route + bounds + markers + areas) av
// dagens pings, segment och kända targets. Appen renderar bara — den bygger
// aldrig själv routeGeoJson/bounds/markers/areas.

import type { GpsTimelineSegment, RawPingInput } from "../timeline/buildGpsDayTimelineOnly.ts";
import type { KnownPlace } from "../timeline/types.ts";

export type MapMarkerKind =
  | "project"
  | "large_project"
  | "location"
  | "booking"
  | "home"
  | "unknown"
  | "travel_start"
  | "travel_end";

export type MapAreaKind = "project" | "large_project" | "location" | "booking" | "home";

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface MapMarker {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind: MapMarkerKind;
  segmentKey: string | null;
}

export interface MapArea {
  id: string;
  label: string;
  kind: MapAreaKind;
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
}

export interface RouteGeoJson {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: Record<string, unknown>;
}

export interface DayMap {
  type: "empty" | "geojson";
  hasPings: boolean;
  routeGeoJson: RouteGeoJson | null;
  bounds: MapBounds | null;
  markers: MapMarker[];
  areas: MapArea[];
}

function segKey(seg: GpsTimelineSegment): string {
  return `${seg.startTs}|${seg.matchedSiteId ?? "unknown"}`;
}

function isFiniteCoord(lat: unknown, lng: unknown): boolean {
  return typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng);
}

export function buildDayMap(input: {
  pings: RawPingInput[];
  segments: GpsTimelineSegment[];
  knownTargets: KnownPlace[];
}): DayMap {
  const coords: [number, number][] = [];
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  const include = (lat: number, lng: number) => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  };

  for (const p of input.pings) {
    if (isFiniteCoord(p.lat, p.lng)) {
      const lat = Number(p.lat), lng = Number(p.lng);
      coords.push([lng, lat]);
      include(lat, lng);
    }
  }

  const markers: MapMarker[] = [];
  for (const s of input.segments) {
    if (s.kind === "stay") {
      if (isFiniteCoord(s.centerLat, s.centerLng)) {
        const kind: MapMarkerKind = s.matchedSiteType ?? "unknown";
        markers.push({
          id: `seg-${segKey(s)}`,
          label: s.label || s.matchedSiteName || "Plats",
          lat: Number(s.centerLat),
          lng: Number(s.centerLng),
          kind,
          segmentKey: segKey(s),
        });
        include(Number(s.centerLat), Number(s.centerLng));
      }
    } else if (s.kind === "travel") {
      if (isFiniteCoord(s.startLat, s.startLng)) {
        markers.push({
          id: `seg-${segKey(s)}-start`,
          label: "Resa start",
          lat: Number(s.startLat),
          lng: Number(s.startLng),
          kind: "travel_start",
          segmentKey: segKey(s),
        });
        include(Number(s.startLat), Number(s.startLng));
      }
      if (isFiniteCoord(s.endLat, s.endLng)) {
        markers.push({
          id: `seg-${segKey(s)}-end`,
          label: "Resa slut",
          lat: Number(s.endLat),
          lng: Number(s.endLng),
          kind: "travel_end",
          segmentKey: segKey(s),
        });
        include(Number(s.endLat), Number(s.endLng));
      }
    }
  }

  // Areas: matchade target-geofences för dagen (begränsa till de targets som
  // ligger inom (eller nära) bounds — så vi inte spammar kartan med alla
  // organisationens platser).
  const seenTargets = new Set<string>();
  for (const s of input.segments) {
    if (s.matchedSiteId && s.matchedSiteType) seenTargets.add(s.matchedSiteId);
  }
  const areas: MapArea[] = [];
  for (const t of input.knownTargets) {
    if (!seenTargets.has(t.id)) continue;
    if (!isFiniteCoord(t.lat, t.lng)) continue;
    const kind = (t.type as MapAreaKind);
    areas.push({
      id: `area-${t.type}-${t.id}`,
      label: t.name ?? "Plats",
      kind,
      centerLat: Number(t.lat),
      centerLng: Number(t.lng),
      radiusMeters: Math.max(10, Number(t.radiusM) || 100),
    });
    include(Number(t.lat), Number(t.lng));
  }

  const hasPings = coords.length > 0;
  const hasAnything = hasPings || markers.length > 0 || areas.length > 0;

  if (!hasAnything) {
    return {
      type: "empty",
      hasPings: false,
      routeGeoJson: null,
      bounds: null,
      markers: [],
      areas: [],
    };
  }

  const bounds: MapBounds | null = Number.isFinite(minLat)
    ? { minLat, maxLat, minLng, maxLng }
    : null;

  const routeGeoJson: RouteGeoJson | null = coords.length >= 2
    ? {
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: { pointCount: coords.length },
      }
    : null;

  return {
    type: "geojson",
    hasPings,
    routeGeoJson,
    bounds,
    markers,
    areas,
  };
}
