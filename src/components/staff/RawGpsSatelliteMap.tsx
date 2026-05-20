import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxMap from '@/components/maps/MapboxMap';
import type { RawStaffGpsPing } from '@/hooks/staff/useStaffGpsPingsForDay';
import { formatStockholmHms } from '@/lib/staff/formatStockholmTime';
import {
  segmentPingsForDisplay,
  colorForSegment,
  type PingSegment,
} from '@/lib/staff/segmentPingsForDisplay';
import {
  geofencesToFeatures,
  type GeofenceSite,
} from '@/lib/staff/geofencesToFeatures';
import type { PlaceVisit } from '@/lib/staff/pingPlaceSegments';

interface Props {
  pings: RawStaffGpsPing[];
  geofences?: GeofenceSite[];
  visits?: PlaceVisit[];
  className?: string;
}

function formatHm(iso: string): string {
  const hms = formatStockholmHms(iso);
  return hms.length >= 5 ? hms.slice(0, 5) : hms;
}

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function dash(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number' && !Number.isFinite(v)) return '—';
  return String(v);
}

function popupHtml(p: RawStaffGpsPing): string {
  const rows: Array<[string, string]> = [
    ['Tid', formatStockholmHms(p.recorded_at)],
    ['Lat', p.lat.toFixed(6)],
    ['Lng', p.lng.toFixed(6)],
    ['Accuracy', p.accuracy != null ? `${p.accuracy.toFixed(0)} m` : '—'],
    ['Speed', p.speed != null ? `${p.speed.toFixed(1)} m/s` : '—'],
    ['Source', dash(p.source)],
    ['Battery', p.battery_percent != null ? `${p.battery_percent}%${p.is_charging ? ' ⚡' : ''}` : '—'],
    ['App', `${dash(p.app_version)} (${dash(p.app_build)})`],
    ['Platform', `${dash(p.platform)} ${dash(p.os_version)}`],
    ['Device', dash(p.device_model)],
    ['App-id', dash(p.app_id)],
  ];
  return `<div style="font:12px/1.4 system-ui;min-width:200px">${rows
    .map(([k, v]) => `<div><b>${k}:</b> ${v}</div>`)
    .join('')}</div>`;
}

function stayPopupHtml(seg: Extract<PingSegment<RawStaffGpsPing>, { kind: 'stay' }>): string {
  return `<div style="font:12px/1.4 system-ui;min-width:200px">
    <div><b>Vistelse</b></div>
    <div>${formatStockholmHms(seg.startIso)} – ${formatStockholmHms(seg.endIso)}</div>
    <div><b>Längd:</b> ${formatDuration(seg.durationMs)}</div>
    <div><b>Pings:</b> ${seg.pings.length}</div>
    <div><b>Lat:</b> ${seg.lat.toFixed(6)}</div>
    <div><b>Lng:</b> ${seg.lng.toFixed(6)}</div>
  </div>`;
}

const LAYER_IDS = [
  'geofence-fill',
  'geofence-outline-casing',
  'geofence-outline',
  'geofence-label',
  'gps-line-segments',
  'gps-move-points',
  'gps-move-labels',
  'gps-stay-points',
  'gps-stay-labels',
  'gps-first',
  'gps-last',
];
const SOURCE_IDS = [
  'geofence-fill-src',
  'geofence-outline-src',
  'geofence-label-src',
  'gps-line-src',
  'gps-move-points-src',
  'gps-stay-points-src',
  'gps-endpoints-src',
];

export default function RawGpsSatelliteMap({ pings, geofences = [], className }: Props) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const handleReady = (map: mapboxgl.Map) => {
    mapRef.current = map;
    renderLayers(map, pings, geofences);
  };

  useEffect(() => {
    if (mapRef.current) renderLayers(mapRef.current, pings, geofences);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pings, geofences]);

  function renderLayers(map: mapboxgl.Map, data: RawStaffGpsPing[], fences: GeofenceSite[]) {
    const apply = () => {
      for (const id of LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of SOURCE_IDS) if (map.getSource(id)) map.removeSource(id);

      // ── Geofences (ritas FÖRST så pings hamnar ovanpå) ─────────────
      if (fences.length) {
        const { fill, outline, labels } = geofencesToFeatures(fences);
        map.addSource('geofence-fill-src', { type: 'geojson', data: fill });
        map.addSource('geofence-outline-src', { type: 'geojson', data: outline });
        map.addSource('geofence-label-src', { type: 'geojson', data: labels });
        map.addLayer({
          id: 'geofence-fill',
          type: 'fill',
          source: 'geofence-fill-src',
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.10 },
        });
        // Vit "casing" under den färgade kanten — syns alltid mot satellitbakgrund.
        map.addLayer({
          id: 'geofence-outline-casing',
          type: 'line',
          source: 'geofence-outline-src',
          paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-opacity': 0.55 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        map.addLayer({
          id: 'geofence-outline',
          type: 'line',
          source: 'geofence-outline-src',
          paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-opacity': 1 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        map.addLayer({
          id: 'geofence-label',
          type: 'symbol',
          source: 'geofence-label-src',
          layout: {
            'text-field': ['get', 'label'],
            'text-size': 11,
            'text-anchor': 'top',
            'text-offset': [0, 0.6],
            'text-allow-overlap': false,
            'text-optional': true,
          },
          paint: {
            'text-color': '#fff',
            'text-halo-color': '#0f172a',
            'text-halo-width': 1.5,
          },
        });
        map.on('click', 'geofence-fill', (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as any;
          popupRef.current?.remove();
          popupRef.current = new mapboxgl.Popup({ closeButton: true })
            .setLngLat([Number(p.lng), Number(p.lat)])
            .setHTML(
              `<div style="font:12px/1.4 system-ui;min-width:200px">
                <div><b>${p.name}</b></div>
                <div>${p.kindLabel}</div>
                <div><b>Radie:</b> ${Math.round(Number(p.radius))} m</div>
                <div><b>Lat:</b> ${Number(p.lat).toFixed(6)}</div>
                <div><b>Lng:</b> ${Number(p.lng).toFixed(6)}</div>
              </div>`,
            )
            .addTo(map);
        });
        map.on('mouseenter', 'geofence-fill', () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', 'geofence-fill', () => (map.getCanvas().style.cursor = ''));
      }

      if (!data.length) {
        if (fences.length) {
          const b = new mapboxgl.LngLatBounds();
          fences.forEach((f) => b.extend([f.lng, f.lat]));
          try { map.fitBounds(b, { padding: 60, duration: 400, maxZoom: 15 }); } catch {/* ignore */}
        }
        return;
      }


      const segments = segmentPingsForDisplay(data);

      // ── Line features per segment (alla pings ritas) ──────────────
      const lineFeatures = segments
        .filter((s) => s.kind === 'move' && s.pings.length >= 2)
        .map((s) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: s.pings.map((p) => [p.lng, p.lat]),
          },
          properties: { color: colorForSegment(s.colorIndex, 'move') },
        }));

      map.addSource('gps-line-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: lineFeatures },
      });
      map.addLayer({
        id: 'gps-line-segments',
        type: 'line',
        source: 'gps-line-src',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 3,
          'line-opacity': 0.85,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      // ── Move-label points (var ~5 min) ────────────────────────────
      const moveLabelFeatures: any[] = [];
      for (const s of segments) {
        if (s.kind !== 'move') continue;
        const color = colorForSegment(s.colorIndex, 'move');
        for (const p of s.labelPings) {
          moveLabelFeatures.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
            properties: {
              id: p.id,
              color,
              label: formatHm(p.recorded_at),
            },
          });
        }
      }
      map.addSource('gps-move-points-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: moveLabelFeatures },
      });
      map.addLayer({
        id: 'gps-move-points',
        type: 'circle',
        source: 'gps-move-points-src',
        paint: {
          'circle-radius': 5,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#0f172a',
          'circle-stroke-width': 1,
        },
      });
      map.addLayer({
        id: 'gps-move-labels',
        type: 'symbol',
        source: 'gps-move-points-src',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, -1.2],
          'text-anchor': 'bottom',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#fff',
          'text-halo-color': '#0f172a',
          'text-halo-width': 1.5,
        },
      });

      // ── Stay markers ───────────────────────────────────────────────
      const stayFeatures: any[] = [];
      for (const s of segments) {
        if (s.kind !== 'stay') continue;
        stayFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
          properties: {
            index: s.index,
            color: colorForSegment(s.colorIndex, 'stay'),
            label: `${formatHm(s.startIso)}–${formatHm(s.endIso)} · ${formatDuration(s.durationMs)}`,
          },
        });
      }
      map.addSource('gps-stay-points-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: stayFeatures },
      });
      map.addLayer({
        id: 'gps-stay-points',
        type: 'circle',
        source: 'gps-stay-points-src',
        paint: {
          'circle-radius': 10,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.9,
        },
      });
      map.addLayer({
        id: 'gps-stay-labels',
        type: 'symbol',
        source: 'gps-stay-points-src',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-offset': [0, -1.6],
          'text-anchor': 'bottom',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#fff',
          'text-halo-color': '#0f172a',
          'text-halo-width': 2,
        },
      });

      // ── Start/slut-markörer ────────────────────────────────────────
      const first = data[0];
      const last = data[data.length - 1];
      map.addSource('gps-endpoints-src', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [first.lng, first.lat] },
              properties: { kind: 'first' },
            },
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [last.lng, last.lat] },
              properties: { kind: 'last' },
            },
          ],
        },
      });
      map.addLayer({
        id: 'gps-first',
        type: 'circle',
        source: 'gps-endpoints-src',
        filter: ['==', ['get', 'kind'], 'first'],
        paint: { 'circle-radius': 9, 'circle-color': '#16a34a', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
      });
      map.addLayer({
        id: 'gps-last',
        type: 'circle',
        source: 'gps-endpoints-src',
        filter: ['==', ['get', 'kind'], 'last'],
        paint: { 'circle-radius': 9, 'circle-color': '#dc2626', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
      });

      // ── Klick: visa popup ──────────────────────────────────────────
      const pingById = new Map(data.map((p) => [p.id, p]));
      const stayByIndex = new Map(
        segments.filter((s) => s.kind === 'stay').map((s) => [s.index, s as Extract<PingSegment<RawStaffGpsPing>, { kind: 'stay' }>]),
      );

      map.on('click', 'gps-move-points', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = String((f.properties as any)?.id ?? '');
        const p = pingById.get(id);
        if (!p) return;
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ closeButton: true })
          .setLngLat([p.lng, p.lat])
          .setHTML(popupHtml(p))
          .addTo(map);
      });
      map.on('click', 'gps-stay-points', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const idx = Number((f.properties as any)?.index);
        const seg = stayByIndex.get(idx);
        if (!seg) return;
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ closeButton: true })
          .setLngLat([seg.lng, seg.lat])
          .setHTML(stayPopupHtml(seg))
          .addTo(map);
      });
      for (const layer of ['gps-move-points', 'gps-stay-points']) {
        map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
      }

      const bounds = new mapboxgl.LngLatBounds();
      data.forEach((p) => bounds.extend([p.lng, p.lat]));
      try {
        map.fitBounds(bounds, { padding: 40, duration: 400, maxZoom: 16 });
      } catch {/* ignore */}
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }

  return (
    <MapboxMap
      style="satellite"
      className={className}
      onReady={handleReady}
      onDestroy={() => {
        popupRef.current?.remove();
        popupRef.current = null;
        mapRef.current = null;
      }}
    />
  );
}
