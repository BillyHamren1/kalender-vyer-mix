/**
 * Pure helper: konverterar en lista av kända platser/targets till
 * Mapbox-ready GeoJSON FeatureCollections för:
 *   - fyllning (polygon)
 *   - kantlinje (samma polygon, ritas som line)
 *   - etikett (Point i centroid)
 *
 * Färg och typ avgörs av id-prefix:
 *   loc:     → organization_location (blå)
 *   booking: → bokning (grön)
 *   project: → projekt (orange)
 *   large:   → large_project (lila)
 *   (övrigt) → neutral grå
 *
 * Geometri:
 *   - Om `polygon` finns på platsen → använd den EXAKTA polygonen.
 *     Cirkel ritas ALDRIG samtidigt.
 *   - Annars → bygg cirkel från lat/lng + radiusMeters.
 *
 * Inga DB-anrop. Ingen React.
 */
import circleToPolygon from '@/lib/maps/circleToPolygon';

export interface GeofenceSite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  /** Om satt: rita ENDAST denna polygon. Cirkel ignoreras. */
  polygon?: GeoJSON.Polygon;
}

export type GeofenceKind = 'location' | 'booking' | 'project' | 'large' | 'other';

export interface GeofenceTheme {
  kind: GeofenceKind;
  /** Hex för outline + label-halo accent. */
  color: string;
  /** Mänsklig etikett för popup. */
  label: string;
}

export function themeForId(id: string): GeofenceTheme {
  if (id.startsWith('loc:')) return { kind: 'location', color: '#38bdf8', label: 'Plats' };
  if (id.startsWith('booking:')) return { kind: 'booking', color: '#22c55e', label: 'Bokning' };
  if (id.startsWith('project:')) return { kind: 'project', color: '#f97316', label: 'Projekt' };
  if (id.startsWith('large:')) return { kind: 'large', color: '#a855f7', label: 'Stort projekt' };
  return { kind: 'other', color: '#94a3b8', label: 'Target' };
}

export interface GeofenceFeatureCollections {
  fill: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
  outline: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
  labels: GeoJSON.FeatureCollection<GeoJSON.Point>;
}

function isValidPolygon(p: unknown): p is GeoJSON.Polygon {
  if (!p || typeof p !== 'object') return false;
  const g = p as any;
  if (g.type !== 'Polygon') return false;
  if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) return false;
  const ring = g.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4) return false;
  return ring.every(
    (pt: any) =>
      Array.isArray(pt) &&
      pt.length >= 2 &&
      Number.isFinite(pt[0]) &&
      Number.isFinite(pt[1]),
  );
}

function bboxCentroid(polygon: GeoJSON.Polygon): { lng: number; lat: number } {
  const ring = polygon.coordinates[0];
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 };
}

export function geofencesToFeatures(sites: GeofenceSite[]): GeofenceFeatureCollections {
  const fill: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  const outline: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  const labels: GeoJSON.Feature<GeoJSON.Point>[] = [];

  for (const s of sites) {
    const theme = themeForId(s.id);
    const hasValidPolygon = isValidPolygon(s.polygon);

    let geometry: GeoJSON.Polygon;
    let labelCentre: { lng: number; lat: number };
    let labelText: string;
    let radiusForProps: number;

    if (hasValidPolygon) {
      // POLYGON-läge — ignorera lat/lng/radius för geometrin.
      geometry = s.polygon as GeoJSON.Polygon;
      labelCentre = bboxCentroid(geometry);
      labelText = s.name;
      radiusForProps = 0;
    } else {
      // CIRKEL-läge — kräver giltiga koordinater.
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
      const radius = Math.max(10, Number(s.radiusMeters) || 200);
      geometry = circleToPolygon([s.lng, s.lat], radius, 64);
      labelCentre = { lng: s.lng, lat: s.lat };
      labelText = `${s.name} · ${Math.round(radius)} m`;
      radiusForProps = radius;
    }

    const props = {
      id: s.id,
      name: s.name,
      kind: theme.kind,
      kindLabel: theme.label,
      color: theme.color,
      radius: radiusForProps,
      shape: hasValidPolygon ? 'polygon' : 'circle',
      lat: labelCentre.lat,
      lng: labelCentre.lng,
    };

    fill.push({ type: 'Feature', geometry, properties: props });
    outline.push({ type: 'Feature', geometry, properties: props });
    labels.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [labelCentre.lng, labelCentre.lat] },
      properties: { ...props, label: labelText },
    });
  }

  return {
    fill: { type: 'FeatureCollection', features: fill },
    outline: { type: 'FeatureCollection', features: outline },
    labels: { type: 'FeatureCollection', features: labels },
  };
}
