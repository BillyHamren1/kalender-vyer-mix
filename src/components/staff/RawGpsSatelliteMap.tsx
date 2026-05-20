import { useEffect, useMemo, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxMap from '@/components/maps/MapboxMap';
import type { RawStaffGpsPing } from '@/hooks/staff/useStaffGpsPingsForDay';
import { formatStockholmHms } from '@/lib/staff/formatStockholmTime';
import { downsamplePingsByBucket } from '@/lib/staff/downsamplePingsByBucket';
import { groupPingsByStay, type StayMarker } from '@/lib/staff/groupPingsByStay';

interface Props {
  pings: RawStaffGpsPing[];
  className?: string;
  /** Bucket window in minutes (default 5). */
  bucketMinutes?: number;
  /** Min span before a same-location group collapses into a stay marker. Default 20 min. */
  stayMinMinutes?: number;
  /** Radius for considering consecutive pings as same stay. Default 60 m. */
  stayRadiusMeters?: number;
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

export default function RawGpsSatelliteMap({
  pings,
  className,
  bucketMinutes = 5,
  stayMinMinutes = 20,
  stayRadiusMeters = 60,
}: Props) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const sampled = useMemo(
    () => downsamplePingsByBucket(pings, bucketMinutes * 60 * 1000),
    [pings, bucketMinutes],
  );

  const markers = useMemo(
    () =>
      groupPingsByStay(sampled, {
        minStayMs: stayMinMinutes * 60 * 1000,
        radiusMeters: stayRadiusMeters,
      }),
    [sampled, stayMinMinutes, stayRadiusMeters],
  );

  const handleReady = (map: mapboxgl.Map) => {
    mapRef.current = map;
    renderLayers(map, sampled, markers);
  };

  useEffect(() => {
    if (mapRef.current) renderLayers(mapRef.current, sampled, markers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampled, markers]);

  function renderLayers(
    map: mapboxgl.Map,
    data: RawStaffGpsPing[],
    markers: StayMarker<RawStaffGpsPing>[],
  ) {
    const apply = () => {
      // remove previous (including legacy cluster layers/sources)
      for (const id of [
        'gps-raw-points',
        'gps-raw-line',
        'gps-raw-first',
        'gps-raw-last',
        'gps-raw-time-labels',
        'gps-raw-stays',
        'gps-raw-stay-labels',
        'gps-raw-clusters',
        'gps-raw-cluster-count',
        'gps-raw-cluster-span',
      ]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      for (const id of [
        'gps-raw-points-src',
        'gps-raw-stays-src',
        'gps-raw-line-src',
        'gps-raw-endpoints-src',
        'gps-raw-clusters-src',
      ]) {
        if (map.getSource(id)) map.removeSource(id);
      }
      if (!data.length) return;

      // Separate markers into individual point pings vs collapsed stays
      const pointFeatures: any[] = [];
      const stayFeatures: any[] = [];
      let stayIdx = 0;
      const stayList: Array<Extract<StayMarker<RawStaffGpsPing>, { kind: 'stay' }>> = [];
      for (const m of markers) {
        if (m.kind === 'point') {
          const p = m.ping;
          pointFeatures.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
            properties: {
              id: p.id,
              t: p.recorded_at,
              label: formatHm(p.recorded_at),
            },
          });
        } else {
          const i = stayIdx++;
          stayList.push(m);
          const durMin = Math.round(m.durationMs / 60000);
          stayFeatures.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
            properties: {
              idx: i,
              label: `${formatHm(m.startIso)}–${formatHm(m.endIso)}`,
              sub: `${durMin} min · ${m.pings.length} pings`,
              count: m.pings.length,
            },
          });
        }
      }


      map.addSource('gps-raw-points-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: pointFeatures },
      });
      map.addSource('gps-raw-stays-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: stayFeatures },
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

      // Individual point markers (non-stay) with HH:MM label
      map.addLayer({
        id: 'gps-raw-points',
        type: 'circle',
        source: 'gps-raw-points-src',
        paint: {
          'circle-radius': 5,
          'circle-color': '#38bdf8',
          'circle-stroke-color': '#0f172a',
          'circle-stroke-width': 1,
        },
      });
      map.addLayer({
        id: 'gps-raw-time-labels',
        type: 'symbol',
        source: 'gps-raw-points-src',
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

      // Stay markers: bigger circle scaled by ping count, with HH:MM–HH:MM label
      map.addLayer({
        id: 'gps-raw-stays',
        type: 'circle',
        source: 'gps-raw-stays-src',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 2, 10, 50, 22],
          'circle-color': 'rgba(250, 204, 21, 0.35)',
          'circle-stroke-color': '#facc15',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'gps-raw-stay-labels',
        type: 'symbol',
        source: 'gps-raw-stays-src',
        layout: {
          'text-field': ['format', ['get', 'label'], {}, '\n', {}, ['get', 'sub'], { 'font-scale': 0.85 }],
          'text-size': 12,
          'text-offset': [0, -1.6],
          'text-anchor': 'bottom',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#fff',
          'text-halo-color': '#0f172a',
          'text-halo-width': 1.8,
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

      // Point popup: look up by id
      const pingById = new Map(data.map((p) => [p.id, p]));
      map.on('click', 'gps-raw-points', (e) => {
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
      map.on('mouseenter', 'gps-raw-points', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'gps-raw-points', () => (map.getCanvas().style.cursor = ''));

      // Stay popup with full timespan + min/max accuracy
      map.on('click', 'gps-raw-stays', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const i = Number((f.properties as any)?.idx);
        const s = stayList[i];
        if (!s) return;
        const durMin = Math.round(s.durationMs / 60000);
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ closeButton: true })
          .setLngLat([s.lng, s.lat])
          .setHTML(
            `<div style="font:12px/1.4 system-ui;min-width:200px">
              <div><b>Vistelse</b></div>
              <div>${formatStockholmHms(s.startIso)} – ${formatStockholmHms(s.endIso)}</div>
              <div style="color:#64748b">${durMin} min · ${s.pings.length} pings</div>
              <div>Lat: ${s.lat.toFixed(6)}</div>
              <div>Lng: ${s.lng.toFixed(6)}</div>
            </div>`,
          )
          .addTo(map);
      });
      map.on('mouseenter', 'gps-raw-stays', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'gps-raw-stays', () => (map.getCanvas().style.cursor = ''));


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
