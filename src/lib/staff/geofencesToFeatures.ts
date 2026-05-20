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
 * Inga DB-anrop. Ingen React.
 */
import circleToPolygon from '@/lib/maps/circleToPolygon';

export interface GeofenceSite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
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

export function geofencesToFeatures(sites: GeofenceSite[]): GeofenceFeatureCollections {
  const fill: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  const outline: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  const labels: GeoJSON.Feature<GeoJSON.Point>[] = [];

  for (const s of sites) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    const radius = Math.max(10, Number(s.radiusMeters) || 200);
    const theme = themeForId(s.id);
    const polygon = circleToPolygon([s.lng, s.lat], radius, 64);
    const props = {
      id: s.id,
      name: s.name,
      kind: theme.kind,
      kindLabel: theme.label,
      color: theme.color,
      radius,
      lat: s.lat,
      lng: s.lng,
    };
    fill.push({ type: 'Feature', geometry: polygon, properties: props });
    outline.push({ type: 'Feature', geometry: polygon, properties: props });
    labels.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: { ...props, label: `${s.name} · ${Math.round(radius)} m` },
    });
  }

  return {
    fill: { type: 'FeatureCollection', features: fill },
    outline: { type: 'FeatureCollection', features: outline },
    labels: { type: 'FeatureCollection', features: labels },
  };
}
