import { useEffect, useMemo, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxMap from '@/components/maps/MapboxMap';
import type { RawStaffGpsPing } from '@/hooks/staff/useStaffGpsPingsForDay';
import { formatStockholmHms } from '@/lib/staff/formatStockholmTime';
import { downsamplePingsByBucket } from '@/lib/staff/downsamplePingsByBucket';

interface Props {
  pings: RawStaffGpsPing[];
  className?: string;
  /** Bucket window in minutes (default 5). */
  bucketMinutes?: number;
}

function formatHm(iso: string): string {
  const hms = formatStockholmHms(iso);
  // formatStockholmHms returns HH:MM:SS; trim to HH:MM for label
  return hms.length >= 5 ? hms.slice(0, 5) : hms;
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

export default function RawGpsSatelliteMap({ pings, className }: Props) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const handleReady = (map: mapboxgl.Map) => {
    mapRef.current = map;
    renderLayers(map, pings);
  };

  useEffect(() => {
    if (mapRef.current) renderLayers(mapRef.current, pings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pings]);

  function renderLayers(map: mapboxgl.Map, data: RawStaffGpsPing[]) {
    const apply = () => {
      // remove previous
      for (const id of ['gps-raw-points', 'gps-raw-line', 'gps-raw-first', 'gps-raw-last', 'gps-raw-time-labels', 'gps-raw-clusters', 'gps-raw-cluster-count', 'gps-raw-cluster-span']) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      for (const id of ['gps-raw-points-src', 'gps-raw-line-src', 'gps-raw-endpoints-src', 'gps-raw-clusters-src']) {
        if (map.getSource(id)) map.removeSource(id);
      }
      if (!data.length) return;

      const features = data.map((p, i) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id,
          idx: i,
          t: p.recorded_at,
          ts: new Date(p.recorded_at).getTime(),
          label: i % 5 === 0 ? formatStockholmHms(p.recorded_at) : '',
        },
      }));

      map.addSource('gps-raw-points-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      });
      map.addSource('gps-raw-clusters-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
        cluster: true,
        clusterRadius: 35,
        clusterMaxZoom: 20,
        clusterProperties: {
          ts_min: ['min', ['get', 'ts']],
          ts_max: ['max', ['get', 'ts']],
        },
      });
      map.addSource('gps-raw-line-src', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: data.map((p) => [p.lng, p.lat]),
          },
          properties: {},
        },
      });
      const first = data[0];
      const last = data[data.length - 1];
      map.addSource('gps-raw-endpoints-src', {
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
        id: 'gps-raw-line',
        type: 'line',
        source: 'gps-raw-line-src',
        paint: { 'line-color': '#22d3ee', 'line-width': 2, 'line-opacity': 0.7 },
      });
      map.addLayer({
        id: 'gps-raw-points',
        type: 'circle',
        source: 'gps-raw-clusters-src',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 4,
          'circle-color': [
            'interpolate', ['linear'], ['get', 'idx'],
            0, '#22c55e',
            Math.max(1, data.length - 1), '#ef4444',
          ],
          'circle-stroke-color': '#0f172a',
          'circle-stroke-width': 1,
        },
      });
      map.addLayer({
        id: 'gps-raw-first',
        type: 'circle',
        source: 'gps-raw-endpoints-src',
        filter: ['==', ['get', 'kind'], 'first'],
        paint: { 'circle-radius': 9, 'circle-color': '#16a34a', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
      });
      map.addLayer({
        id: 'gps-raw-last',
        type: 'circle',
        source: 'gps-raw-endpoints-src',
        filter: ['==', ['get', 'kind'], 'last'],
        paint: { 'circle-radius': 9, 'circle-color': '#dc2626', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
      });

      // Time label every 5th ping
      map.addLayer({
        id: 'gps-raw-time-labels',
        type: 'symbol',
        source: 'gps-raw-clusters-src',
        filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'label'], '']],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, -1.2],
          'text-anchor': 'bottom',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#fff',
          'text-halo-color': '#0f172a',
          'text-halo-width': 1.5,
        },
      });

      // Clusters – count + time span
      map.addLayer({
        id: 'gps-raw-clusters',
        type: 'circle',
        source: 'gps-raw-clusters-src',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': 'rgba(34,211,238,0.35)',
          'circle-stroke-color': '#22d3ee',
          'circle-stroke-width': 2,
          'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24],
        },
      });
      map.addLayer({
        id: 'gps-raw-cluster-count',
        type: 'symbol',
        source: 'gps-raw-clusters-src',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['concat', ['to-string', ['get', 'point_count']], ' pings'],
          'text-size': 11,
          'text-offset': [0, -0.6],
          'text-anchor': 'center',
        },
        paint: { 'text-color': '#fff', 'text-halo-color': '#0f172a', 'text-halo-width': 1.5 },
      });

      // Cluster popup with time span on click (Mapbox style expressions can't
      // format epoch ms to HH:MM:SS, so we compute it in JS).
      map.on('click', 'gps-raw-clusters', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const props = f.properties as any;
        const clusterId = props?.cluster_id;
        const tsMin = Number(props?.ts_min);
        const tsMax = Number(props?.ts_max);
        const count = Number(props?.point_count);
        const coords = (f.geometry as any).coordinates as [number, number];
        const spanMin = Number.isFinite(tsMin) ? formatStockholmHms(new Date(tsMin).toISOString()) : '—';
        const spanMax = Number.isFinite(tsMax) ? formatStockholmHms(new Date(tsMax).toISOString()) : '—';
        const durMs = Number.isFinite(tsMin) && Number.isFinite(tsMax) ? tsMax - tsMin : 0;
        const durMin = Math.round(durMs / 60000);
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ closeButton: true })
          .setLngLat(coords)
          .setHTML(
            `<div style="font:12px/1.4 system-ui;min-width:180px">
              <div><b>${count} pings</b></div>
              <div>${spanMin} – ${spanMax}</div>
              <div style="color:#64748b">${durMin} min</div>
            </div>`
          )
          .addTo(map);
        const src = map.getSource('gps-raw-clusters-src') as mapboxgl.GeoJSONSource;
        src.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          // Don't auto-zoom; let user choose. Comment out next line to keep popup-only.
          // map.easeTo({ center: coords, zoom });
        });
      });
      map.on('mouseenter', 'gps-raw-clusters', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'gps-raw-clusters', () => (map.getCanvas().style.cursor = ''));


      map.on('click', 'gps-raw-points', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const idx = (f.properties as any)?.idx as number;
        const p = data[idx];
        if (!p) return;
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ closeButton: true })
          .setLngLat([p.lng, p.lat])
          .setHTML(popupHtml(p))
          .addTo(map);
      });
      map.on('mouseenter', 'gps-raw-points', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'gps-raw-points', () => (map.getCanvas().style.cursor = ''));

      // fit
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
