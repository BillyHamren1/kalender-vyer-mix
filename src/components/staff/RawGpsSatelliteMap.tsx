import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import MapboxMap from '@/components/maps/MapboxMap';
import type { RawStaffGpsPing } from '@/hooks/staff/useStaffGpsPingsForDay';
import { formatStockholmHms } from '@/lib/staff/formatStockholmTime';
import {
  segmentPingsForDisplay,
  pickPingsByGlobalInterval,
  colorForSegment,
  type PingSegment,
} from '@/lib/staff/segmentPingsForDisplay';
import {
  geofencesToFeatures,
  type GeofenceSite,
} from '@/lib/staff/geofencesToFeatures';
import { clipLineOutsideGeofences, pingInsideAnyFence } from '@/lib/staff/clipLineOutsideGeofences';
import type { PlaceVisit } from '@/lib/staff/pingPlaceSegments';

interface Props {
  pings: RawStaffGpsPing[];
  geofences?: GeofenceSite[];
  visits?: PlaceVisit[];
  className?: string;
  /**
   * Anropas när användaren sparar ny radie för en geofence från kartans popup.
   * id-prefix bestämmer mål: `loc:` → organization_locations,
   * `project:` → projects, `large:` → large_projects.
   * Förälder ansvarar för persistens + query-invalidation.
   */
  onSaveRadius?: (id: string, radiusMeters: number) => Promise<void>;
  /**
   * Anropas när användaren ritat (eller tagit bort) en polygon för en geofence.
   * polygon=null återställer till cirkel.
   */
  onSavePolygon?: (id: string, polygon: GeoJSON.Polygon | null) => Promise<void>;
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
  'gps-line-arrows',
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

const ZOOM_DETAIL_THRESHOLD = 14;

export default function RawGpsSatelliteMap({ pings, geofences = [], visits = [], className, onSaveRadius, onSavePolygon }: Props) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const onSaveRadiusRef = useRef<Props['onSaveRadius']>(onSaveRadius);
  onSaveRadiusRef.current = onSaveRadius;
  const onSavePolygonRef = useRef<Props['onSavePolygon']>(onSavePolygon);
  onSavePolygonRef.current = onSavePolygon;
  const drawRef = useRef<MapboxDraw | null>(null);
  const drawHandlersRef = useRef<{ cleanup: () => void } | null>(null);
  const visitMarkersRef = useRef<Array<{ marker: mapboxgl.Marker; el: HTMLElement; kind: 'compact' | 'detail' }>>([]);

  const handleReady = (map: mapboxgl.Map) => {
    mapRef.current = map;
    renderLayers(map, pings, geofences);
    renderVisitMarkers(map, visits);
    map.on('zoom', applyZoomVisibility);
  };


  useEffect(() => {
    if (mapRef.current) renderLayers(mapRef.current, pings, geofences);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pings, geofences]);

  useEffect(() => {
    if (mapRef.current) renderVisitMarkers(mapRef.current, visits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visits]);

  function clearVisitMarkers() {
    for (const m of visitMarkersRef.current) m.marker.remove();
    visitMarkersRef.current = [];
  }

  function applyZoomVisibility() {
    const map = mapRef.current;
    if (!map) return;
    const detailed = map.getZoom() >= ZOOM_DETAIL_THRESHOLD;
    for (const { el, kind } of visitMarkersRef.current) {
      const shouldShow = kind === 'detail' ? detailed : !detailed;
      el.style.display = shouldShow ? '' : 'none';
    }
  }




  function renderVisitMarkers(map: mapboxgl.Map, vs: PlaceVisit[]) {
    clearVisitMarkers();

    // ── Gruppera vistelser per känd plats (geofence) ────────────────
    // Inom samma geofence visar vi ETT block-paneldetaljläge:
    //   Block 1: in–ut · dur
    //   Block 2: in–ut · dur
    //   …
    //   Totalt: …
    // Vistelser UTAN known site (okända platser) får sin egen pill som förr.
    const grouped = new Map<string, PlaceVisit[]>();
    const unknownVisits: PlaceVisit[] = [];
    for (const v of vs) {
      if (!v.pings.length) continue;
      if (v.knownSite) {
        const arr = grouped.get(v.knownSite.id) ?? [];
        arr.push(v);
        grouped.set(v.knownSite.id, arr);
      } else {
        unknownVisits.push(v);
      }
    }

    const addCompactPin = (lng: number, lat: number, title: string) => {
      const pin = document.createElement('div');
      pin.style.cssText =
        'width:12px;height:12px;border-radius:9999px;background:#22c55e;box-shadow:0 0 0 2px #fff,0 1px 4px rgba(0,0,0,.5);cursor:pointer;';
      pin.title = title;
      const marker = new mapboxgl.Marker({ element: pin, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map);
      visitMarkersRef.current.push({ marker, el: pin, kind: 'compact' });
    };

    // ── Per geofence: kompakt pin + detalj block-panel ───────────────
    for (const [, list] of grouped) {
      const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
      // Pin-position: använd första vistelsens centre (mitten på geofencen
      // när knownSite finns).
      const head = sorted[0];
      addCompactPin(
        head.centre.lng,
        head.centre.lat,
        `${head.knownSite?.name ?? ''} · ${sorted.length} block`,
      );

      const totalMin = sorted.reduce((sum, v) => sum + v.durationMin, 0);
      const tHh = Math.floor(totalMin / 60);
      const tMm = totalMin % 60;
      const totalLabel = tHh > 0 ? `${tHh}h ${tMm}m` : `${tMm}m`;

      const mono = 'ui-monospace,SFMono-Regular,Menlo,monospace';
      const blockRows = sorted
        .map((v, i) => {
          const hh = Math.floor(v.durationMin / 60);
          const mm = v.durationMin % 60;
          const dur = hh > 0 ? `${hh}h ${mm}m` : `${mm}m`;
          const isOutside = v.subKind === 'outside_geo';
          const labelColor = isOutside ? 'hsl(38 92% 60%)' : 'hsl(215 16% 65%)';
          const timeColor = isOutside ? 'hsl(215 16% 70%)' : 'hsl(0 0% 98%)';
          const durColor = isOutside ? 'hsl(38 92% 65%)' : 'hsl(199 89% 70%)';
          const suffix = isOutside
            ? ` <span style="color:hsl(38 92% 60%);font-size:9.5px;letter-spacing:.04em;text-transform:uppercase">· Utanför geo</span>`
            : '';
          return `
            <div style="display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:1px 0;font-variant-numeric:tabular-nums">
              <span style="color:${labelColor};font-size:9.5px;letter-spacing:.08em;text-transform:uppercase">B${i + 1}</span>
              <span style="font-family:${mono};font-size:10.5px;color:${timeColor}">${formatHm(v.start)} <span style="color:hsl(215 16% 50%)">→</span> ${formatHm(v.end)}${suffix}</span>
              <span style="font-family:${mono};font-size:10.5px;color:${durColor}">${dur}</span>
            </div>`;
        })
        .join('');


      const panel = document.createElement('div');
      panel.style.cssText = [
        'display:inline-flex','flex-direction:column','gap:2px',
        'padding:8px 10px','border-radius:8px',
        'background:hsl(222 47% 8% / .92)','color:hsl(0 0% 98%)',
        'font:500 10.5px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
        'white-space:nowrap','min-width:180px',
        'border:1px solid hsl(215 16% 28% / .6)',
        'box-shadow:0 8px 24px -8px hsl(222 47% 4% / .8),0 0 0 1px hsl(0 0% 100% / .04)',
        'backdrop-filter:blur(10px) saturate(140%)','-webkit-backdrop-filter:blur(10px) saturate(140%)',
        'pointer-events:auto',
      ].join(';');
      panel.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;padding-bottom:5px;margin-bottom:3px;border-bottom:1px solid hsl(215 16% 28% / .4);max-width:240px">
          <span style="width:5px;height:5px;border-radius:9999px;background:hsl(142 71% 55%);box-shadow:0 0 0 2px hsl(142 71% 55% / .2)"></span>
          <span style="font-weight:600;font-size:11px;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis">${head.knownSite?.name ?? ''}</span>
        </div>
        ${blockRows}
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:4px;padding-top:5px;border-top:1px solid hsl(215 16% 28% / .4);font-variant-numeric:tabular-nums">
          <span style="font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:hsl(215 16% 65%)">Totalt</span>
          <span style="font-family:${mono};font-size:11px;color:hsl(142 71% 60%);font-weight:600">${totalLabel}</span>
        </div>
      `;

      const panelMarker = new mapboxgl.Marker({ element: panel, anchor: 'right', offset: [-14, 0] })
        .setLngLat([head.centre.lng, head.centre.lat])
        .addTo(map);
      visitMarkersRef.current.push({ marker: panelMarker, el: panel, kind: 'detail' });
    }

    // ── Okända vistelser: enkel pill som förr ────────────────────────
    for (const v of unknownVisits) {
      const first = v.pings[0];
      const last = v.pings[v.pings.length - 1];
      const hh = Math.floor(v.durationMin / 60);
      const mm = v.durationMin % 60;
      const dur = hh > 0 ? `${hh}h ${mm}m` : `${mm}m`;
      const inHm = formatHm(v.start);
      const outHm = formatHm(v.end);
      const midLng = (first.lng + last.lng) / 2;
      const midLat = (first.lat + last.lat) / 2;

      addCompactPin(midLng, midLat, `Okänd plats · ${inHm}–${outHm} · ${dur}`);

      const pill = document.createElement('div');
      pill.style.cssText = [
        'display:inline-flex','align-items:center','gap:8px',
        'padding:4px 10px','border-radius:9999px',
        'background:rgba(15,23,42,.88)','color:#fff',
        'font:600 11px/1.2 system-ui,-apple-system,Segoe UI,sans-serif',
        'letter-spacing:.2px','white-space:nowrap',
        'border:1px solid rgba(255,255,255,.18)',
        'box-shadow:0 4px 14px rgba(0,0,0,.45)',
        'backdrop-filter:blur(6px)','-webkit-backdrop-filter:blur(6px)',
        'pointer-events:auto','transform:translateY(-22px)',
      ].join(';');
      pill.innerHTML = `
        <span style="font-variant-numeric:tabular-nums">${inHm}</span>
        <span style="opacity:.55">→</span>
        <span style="font-variant-numeric:tabular-nums">${outHm}</span>
        <span style="opacity:.55">·</span>
        <span style="font-variant-numeric:tabular-nums;color:#7dd3fc">${dur}</span>
      `;
      const pillMarker = new mapboxgl.Marker({ element: pill, anchor: 'bottom' })
        .setLngLat([midLng, midLat])
        .addTo(map);
      visitMarkersRef.current.push({ marker: pillMarker, el: pill, kind: 'detail' });
    }

    applyZoomVisibility();
  }




  /**
   * Aktiverar mapbox-gl-draw i polygon-läge. När användaren dubbelklickar
   * för att avsluta polygonen anropas `onDone` med Polygon-geometrin och
   * draw-kontrollen plockas bort. Esc avbryter.
   */
  function startPolygonDraw(
    map: mapboxgl.Map,
    geofenceId: string,
    onDone: (polygon: GeoJSON.Polygon) => void,
  ) {
    drawHandlersRef.current?.cleanup();
    if (drawRef.current) {
      try { map.removeControl(drawRef.current); } catch { /* ignore */ }
      drawRef.current = null;
    }
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      defaultMode: 'draw_polygon',
    });
    drawRef.current = draw;
    map.addControl(draw);

    // Hint-toast på kartan.
    const hint = document.createElement('div');
    hint.textContent = 'Klicka för att rita polygon · Dubbelklicka för att avsluta · Esc avbryter';
    hint.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,.92);color:#fff;padding:6px 12px;border-radius:6px;font:600 12px system-ui;pointer-events:none;z-index:5;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    const container = map.getContainer();
    container.appendChild(hint);

    const onCreate = (e: any) => {
      const feat = e?.features?.[0];
      if (!feat || feat.geometry?.type !== 'Polygon') return;
      const poly: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: feat.geometry.coordinates,
      };
      cleanup();
      onDone(poly);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') cleanup();
    };
    const cleanup = () => {
      try { map.off('draw.create', onCreate as any); } catch { /* */ }
      window.removeEventListener('keydown', onKey);
      try { hint.remove(); } catch { /* */ }
      if (drawRef.current) {
        try { map.removeControl(drawRef.current); } catch { /* */ }
        drawRef.current = null;
      }
      drawHandlersRef.current = null;
    };
    map.on('draw.create', onCreate as any);
    window.addEventListener('keydown', onKey);
    drawHandlersRef.current = { cleanup };
    // Notera: geofenceId loggas för felsökning men onDone hanterar persistens.
    void geofenceId;
  }

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
          const id = String(p.id ?? '');
          const editable = id.startsWith('loc:') || id.startsWith('project:') || id.startsWith('large:');
          const isPolygon = String(p.shape) === 'polygon';
          const currentRadius = Math.round(Number(p.radius) || 0);
          popupRef.current?.remove();

          const root = document.createElement('div');
          root.style.cssText = 'font:12px/1.4 system-ui;min-width:240px';
          root.innerHTML = `
            <div style="font-weight:600;margin-bottom:2px">${p.name}</div>
            <div style="color:#475569;margin-bottom:6px">${p.kindLabel}</div>
            <div><b>Lat:</b> ${Number(p.lat).toFixed(6)}</div>
            <div style="margin-bottom:8px"><b>Lng:</b> ${Number(p.lng).toFixed(6)}</div>
          `;

          if (editable && !isPolygon && onSaveRadiusRef.current) {
            const editor = document.createElement('div');
            editor.style.cssText = 'display:flex;flex-direction:column;gap:6px;border-top:1px solid #e2e8f0;padding-top:8px';
            editor.innerHTML = `
              <label style="font-weight:600">Radie (m)</label>
              <div style="display:flex;gap:6px;align-items:center">
                <input type="number" min="10" max="5000" step="10" value="${currentRadius}"
                  style="flex:1;padding:4px 6px;border:1px solid #cbd5e1;border-radius:4px;font:12px system-ui" />
                <button type="button" data-save
                  style="padding:4px 10px;background:#0f172a;color:#fff;border:0;border-radius:4px;cursor:pointer;font:600 12px system-ui">
                  Spara
                </button>
              </div>
              <div data-status style="min-height:14px;color:#475569;font-size:11px"></div>
            `;
            const input = editor.querySelector('input') as HTMLInputElement;
            const btn = editor.querySelector('button[data-save]') as HTMLButtonElement;
            const status = editor.querySelector('[data-status]') as HTMLDivElement;
            btn.addEventListener('click', async () => {
              const next = Math.round(Number(input.value));
              if (!Number.isFinite(next) || next < 10 || next > 5000) {
                status.textContent = 'Ange 10–5000 m';
                status.style.color = '#dc2626';
                return;
              }
              btn.disabled = true;
              input.disabled = true;
              status.style.color = '#475569';
              status.textContent = 'Sparar…';
              try {
                await onSaveRadiusRef.current!(id, next);
                status.style.color = '#16a34a';
                status.textContent = `Sparat: ${next} m`;
              } catch (err: any) {
                status.style.color = '#dc2626';
                status.textContent = `Fel: ${err?.message ?? 'kunde inte spara'}`;
                btn.disabled = false;
                input.disabled = false;
              }
            });
            root.appendChild(editor);
          } else if (isPolygon) {
            const info = document.createElement('div');
            info.innerHTML = `<div><b>Form:</b> polygon</div>`;
            root.appendChild(info);
          } else {
            const radiusInfo = document.createElement('div');
            radiusInfo.innerHTML = `<div><b>Radie:</b> ${currentRadius} m</div>`;
            root.appendChild(radiusInfo);
          }

          // ── Polygon-redigering ─────────────────────────────────────
          if (editable && onSavePolygonRef.current) {
            const polyBox = document.createElement('div');
            polyBox.style.cssText = 'display:flex;flex-direction:column;gap:6px;border-top:1px solid #e2e8f0;padding-top:8px;margin-top:8px';
            polyBox.innerHTML = isPolygon
              ? `
                <div style="font-weight:600">Polygon</div>
                <div style="display:flex;gap:6px">
                  <button type="button" data-draw
                    style="flex:1;padding:4px 10px;background:#0f172a;color:#fff;border:0;border-radius:4px;cursor:pointer;font:600 12px system-ui">
                    Rita om
                  </button>
                  <button type="button" data-clear
                    style="padding:4px 10px;background:#fff;color:#0f172a;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font:600 12px system-ui">
                    Ta bort
                  </button>
                </div>
                <div data-poly-status style="min-height:14px;color:#475569;font-size:11px"></div>
              `
              : `
                <div style="font-weight:600">Polygon (avancerat)</div>
                <button type="button" data-draw
                  style="padding:4px 10px;background:#0f172a;color:#fff;border:0;border-radius:4px;cursor:pointer;font:600 12px system-ui">
                  Rita polygon
                </button>
                <div data-poly-status style="min-height:14px;color:#475569;font-size:11px">Klicka för att rita. Dubbelklicka för att avsluta.</div>
              `;
            const drawBtn = polyBox.querySelector('button[data-draw]') as HTMLButtonElement;
            const clearBtn = polyBox.querySelector('button[data-clear]') as HTMLButtonElement | null;
            const polyStatus = polyBox.querySelector('[data-poly-status]') as HTMLDivElement;

            drawBtn.addEventListener('click', () => {
              popupRef.current?.remove();
              startPolygonDraw(map, id, (poly) => {
                onSavePolygonRef.current?.(id, poly).catch(() => undefined);
              });
            });
            clearBtn?.addEventListener('click', async () => {
              clearBtn.disabled = true;
              drawBtn.disabled = true;
              polyStatus.style.color = '#475569';
              polyStatus.textContent = 'Tar bort…';
              try {
                await onSavePolygonRef.current!(id, null);
                polyStatus.style.color = '#16a34a';
                polyStatus.textContent = 'Polygon borttagen.';
              } catch (err: any) {
                polyStatus.style.color = '#dc2626';
                polyStatus.textContent = `Fel: ${err?.message ?? 'kunde inte ta bort'}`;
                clearBtn.disabled = false;
                drawBtn.disabled = false;
              }
            });
            root.appendChild(polyBox);
          }


          popupRef.current = new mapboxgl.Popup({ closeButton: true, maxWidth: '320px' })
            .setLngLat([Number(p.lng), Number(p.lat)])
            .setDOMContent(root)
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
        .flatMap((s) => clipLineOutsideGeofences(s.pings, fences).map((coordinates) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates,
          },
          properties: { color: colorForSegment(s.colorIndex, 'move') },
        })));



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
          'line-width': 3.5,
          'line-opacity': 0.9,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      // Riktningspilar längs varje resa (▶ följer linjeriktningen).
      map.addLayer({
        id: 'gps-line-arrows',
        type: 'symbol',
        source: 'gps-line-src',
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 80,
          'text-field': '▶',
          'text-size': 14,
          'text-keep-upright': false,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': ['get', 'color'],
          'text-halo-color': '#0f172a',
          'text-halo-width': 1.5,
        },
      });

      // ── Move-label points (endast en tidslabel per globalt 5-minutersintervall) ─
      const moveLabelFeatures: any[] = [];
      const globallyAllowedLabelIds = new Set(
        pickPingsByGlobalInterval(data, 5 * 60_000)
          .filter((p) => !pingInsideAnyFence(p, fences))
          .map((p) => p.id),
      );
      for (const s of segments) {
        if (s.kind !== 'move') continue;
        const color = colorForSegment(s.colorIndex, 'move');
        const labelIds = new Set(s.labelPings.map((p) => p.id));


        for (const p of s.pings) {
          if (!labelIds.has(p.id)) continue;
          if (!globallyAllowedLabelIds.has(p.id)) continue;
          if (pingInsideAnyFence(p, fences)) continue;
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
        if (pingInsideAnyFence({ lat: s.lat, lng: s.lng }, fences)) continue;
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
      const endpointFeatures = [];
      if (!pingInsideAnyFence(first, fences)) {
        endpointFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [first.lng, first.lat] },
          properties: { kind: 'first' },
        });
      }
      if (!pingInsideAnyFence(last, fences)) {
        endpointFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [last.lng, last.lat] },
          properties: { kind: 'last' },
        });
      }
      map.addSource('gps-endpoints-src', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: endpointFeatures,
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
      applyZoomVisibility();

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
        clearVisitMarkers();
        mapRef.current = null;
      }}
    />
  );
}
