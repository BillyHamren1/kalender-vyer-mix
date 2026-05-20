import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxMap from '@/components/maps/MapboxMap';
import type { RawStaffGpsPing } from '@/hooks/staff/useStaffGpsPingsForDay';
import { formatStockholmHms } from '@/lib/staff/formatStockholmTime';

interface Props {
  pings: RawStaffGpsPing[];
  className?: string;
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
        source: 'gps-raw-points-src',
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
