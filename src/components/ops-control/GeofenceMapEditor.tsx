import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
// @ts-ignore - no types shipped
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Pentagon, Circle, Trash2, Crosshair, Satellite, Map as MapIcon, Loader2 } from 'lucide-react';
import { polygonAreaM2, polygonCentroid, type GeoJSONPolygon } from '@/lib/geofenceEval';

export interface GeofenceValue {
  mode: 'circle' | 'polygon';
  latitude: number;
  longitude: number;
  radius_meters: number;
  polygon: GeoJSONPolygon | null;
}

interface Props {
  value: GeofenceValue;
  onChange: (v: GeofenceValue) => void;
  /** Optional address-derived coordinate to recenter on. */
  centerOn?: { lat: number; lng: number } | null;
  height?: number;
}

const FILL_COLOR = '#7c3aed';

const GeofenceMapEditor = ({ value, onChange, centerOn, height = 360 }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<any>(null);
  const circleSourceId = 'gf-circle-src';
  const circleLayerId = 'gf-circle-layer';
  const valueRef = useRef(value);
  const [ready, setReady] = useState(false);
  const [styleMode, setStyleMode] = useState<'streets' | 'satellite'>('satellite');
  const [area, setArea] = useState<number>(0);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => { valueRef.current = value; }, [value]);

  // Init map
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('mapbox-token');
        if (cancelled) return;
        if (error) {
          console.warn('[GeofenceMapEditor] mapbox-token error', error);
          setLoadError(`Kunde inte hämta Mapbox-token (${error.message ?? 'okänt fel'})`);
          setTokenLoading(false);
          return;
        }
        if (!data?.token) {
          console.warn('[GeofenceMapEditor] mapbox-token missing in response', data);
          setLoadError('Mapbox-token saknas — be admin lägga till MAPBOX_PUBLIC_TOKEN');
          setTokenLoading(false);
          return;
        }
        mapboxgl.accessToken = data.token;
        if (!containerRef.current) {
          setLoadError('Kartcontainer saknas');
          setTokenLoading(false);
          return;
        }
        if (mapRef.current) return;

        const initialCenter: [number, number] =
          value.longitude && value.latitude
            ? [value.longitude, value.latitude]
            : centerOn
            ? [centerOn.lng, centerOn.lat]
            : [15.5, 58.5];
        const initialZoom = value.longitude && value.latitude ? 18 : 5;

        const m = new mapboxgl.Map({
          container: containerRef.current,
          style: 'mapbox://styles/mapbox/satellite-streets-v12',
          center: initialCenter,
          zoom: initialZoom,
          projection: 'mercator',
          attributionControl: false,
        });
        mapRef.current = m;

        m.on('error', (e: any) => {
          console.warn('[GeofenceMapEditor] mapbox runtime error', e?.error ?? e);
          // Fall back to plain streets style if satellite cannot load (e.g. token scope)
          if (
            e?.error?.status === 401 ||
            e?.error?.status === 403 ||
            /style/i.test(e?.error?.message ?? '')
          ) {
            try {
              m.setStyle('mapbox://styles/mapbox/streets-v12');
              setStyleMode('streets');
            } catch {/* ignore */}
          }
        });

        const draw = new MapboxDraw({
          displayControlsDefault: false,
          controls: {},
          defaultMode: 'simple_select',
          styles: [
            // Polygon fill
            { id: 'gl-draw-polygon-fill', type: 'fill', filter: ['all', ['==', '$type', 'Polygon']], paint: { 'fill-color': FILL_COLOR, 'fill-opacity': 0.2 } },
            { id: 'gl-draw-polygon-stroke', type: 'line', filter: ['all', ['==', '$type', 'Polygon']], paint: { 'line-color': FILL_COLOR, 'line-width': 2 } },
            { id: 'gl-draw-polygon-midpoint', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']], paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': FILL_COLOR, 'circle-stroke-width': 1.5 } },
            { id: 'gl-draw-polygon-vertex', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']], paint: { 'circle-radius': 5, 'circle-color': FILL_COLOR, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
            // Active line while drawing
            { id: 'gl-draw-line-active', type: 'line', filter: ['all', ['==', '$type', 'LineString'], ['==', 'active', 'true']], paint: { 'line-color': FILL_COLOR, 'line-width': 2, 'line-dasharray': [2, 2] } },
          ],
        });
        drawRef.current = draw;
        m.addControl(draw as any);
        m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

        m.on('load', () => {
          if (cancelled) return;
          setReady(true);
          setTokenLoading(false);
          // Multiple resize attempts: dialogs animate in, container size grows over a few frames.
          requestAnimationFrame(() => m.resize());
          setTimeout(() => m.resize(), 100);
          setTimeout(() => m.resize(), 400);
        });

        // Auto-resize when container dimensions change (e.g. dialog opens)
        if (containerRef.current && typeof ResizeObserver !== 'undefined') {
          const ro = new ResizeObserver(() => {
            if (mapRef.current) mapRef.current.resize();
          });
          ro.observe(containerRef.current);
          (m as any).__ro = ro;
        }

        // Listen for draw events
        const syncFromDraw = () => {
          const fc = draw.getAll();
          const feature = fc.features[0];
          if (!feature || feature.geometry.type !== 'Polygon') return;
          const polygon = feature.geometry as GeoJSONPolygon;
          const c = polygonCentroid(polygon);
          const a = polygonAreaM2(polygon);
          setArea(a);
          onChange({
            mode: 'polygon',
            polygon,
            latitude: c.lat,
            longitude: c.lng,
            radius_meters: valueRef.current.radius_meters,
          });
        };
        m.on('draw.create', syncFromDraw);
        m.on('draw.update', syncFromDraw);
        m.on('draw.delete', () => {
          setArea(0);
          onChange({
            ...valueRef.current,
            mode: 'circle',
            polygon: null,
          });
        });
      } catch (e) {
        console.warn('[GeofenceMapEditor] init error', e);
        setTokenLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      const ro = (mapRef.current as any)?.__ro as ResizeObserver | undefined;
      ro?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Style toggle
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    const url = styleMode === 'satellite'
      ? 'mapbox://styles/mapbox/satellite-streets-v12'
      : 'mapbox://styles/mapbox/streets-v12';
    mapRef.current.setStyle(url);
    // After style reload, re-add circle layer + draw layers (draw handles itself)
    mapRef.current.once('style.load', () => {
      renderCircle();
    });
  }, [styleMode, ready]);

  // Push current value into draw + circle
  const renderCircle = useCallback(() => {
    const m = mapRef.current;
    if (!m || !m.isStyleLoaded()) return;
    const v = valueRef.current;
    // Remove old
    if (m.getLayer(circleLayerId)) m.removeLayer(circleLayerId);
    if (m.getSource(circleSourceId)) m.removeSource(circleSourceId);
    if (v.mode !== 'circle' || !v.latitude || !v.longitude || !v.radius_meters) return;
    const points = 64;
    const radiusKm = v.radius_meters / 1000;
    const coords: [number, number][] = [];
    for (let j = 0; j < points; j++) {
      const angle = (j / points) * 2 * Math.PI;
      const dx = radiusKm * Math.cos(angle);
      const dy = radiusKm * Math.sin(angle);
      const lat = v.latitude + (dy / 111.32);
      const lng = v.longitude + (dx / (111.32 * Math.cos(v.latitude * Math.PI / 180)));
      coords.push([lng, lat]);
    }
    coords.push(coords[0]);
    m.addSource(circleSourceId, {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } },
    });
    m.addLayer({
      id: circleLayerId,
      type: 'fill',
      source: circleSourceId,
      paint: { 'fill-color': FILL_COLOR, 'fill-opacity': 0.18, 'fill-outline-color': FILL_COLOR },
    });
  }, []);

  // Initial load: hydrate draw + circle from value
  useEffect(() => {
    if (!ready || !mapRef.current || !drawRef.current) return;
    const m = mapRef.current;
    const draw = drawRef.current;
    draw.deleteAll();
    if (value.mode === 'polygon' && value.polygon) {
      draw.add({ type: 'Feature', properties: {}, geometry: value.polygon });
      setArea(polygonAreaM2(value.polygon));
      // Fit bounds
      const ring = value.polygon.coordinates[0];
      const bounds = ring.reduce(
        (b, c) => b.extend(c as [number, number]),
        new mapboxgl.LngLatBounds(ring[0] as [number, number], ring[0] as [number, number]),
      );
      m.fitBounds(bounds, { padding: 40, duration: 0, maxZoom: 19 });
    } else {
      setArea(0);
      renderCircle();
      if (value.latitude && value.longitude) {
        m.flyTo({ center: [value.longitude, value.latitude], zoom: 18, duration: 0 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Re-render circle whenever it changes (radius via parent input)
  useEffect(() => {
    if (!ready) return;
    if (value.mode === 'circle') renderCircle();
  }, [value.radius_meters, value.latitude, value.longitude, value.mode, ready, renderCircle]);

  // Recenter when address changes
  useEffect(() => {
    if (!ready || !mapRef.current || !centerOn) return;
    mapRef.current.flyTo({ center: [centerOn.lng, centerOn.lat], zoom: 18, duration: 600 });
    if (valueRef.current.mode === 'circle') {
      onChange({ ...valueRef.current, latitude: centerOn.lat, longitude: centerOn.lng });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerOn?.lat, centerOn?.lng, ready]);

  const startDrawPolygon = () => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.deleteAll();
    setArea(0);
    draw.changeMode('draw_polygon');
  };

  const switchToCircle = () => {
    drawRef.current?.deleteAll();
    setArea(0);
    onChange({ ...valueRef.current, mode: 'circle', polygon: null });
  };

  const clearAll = () => {
    drawRef.current?.deleteAll();
    setArea(0);
    onChange({ ...valueRef.current, mode: 'circle', polygon: null });
  };

  const goToMyPosition = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current!.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 19, duration: 600 });
      },
      (err) => console.warn('GPS error', err),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const tooBig = value.mode === 'polygon' && area > 10000;
  const tooSmall = value.mode === 'polygon' && area > 0 && area < 25;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant={value.mode === 'polygon' ? 'default' : 'outline'} className="h-7 text-xs gap-1" onClick={startDrawPolygon}>
          <Pentagon className="w-3 h-3" /> Rita polygon
        </Button>
        <Button type="button" size="sm" variant={value.mode === 'circle' ? 'default' : 'outline'} className="h-7 text-xs gap-1" onClick={switchToCircle}>
          <Circle className="w-3 h-3" /> Cirkel
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={clearAll}>
          <Trash2 className="w-3 h-3" /> Rensa
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={goToMyPosition}>
          <Crosshair className="w-3 h-3" /> Min pos
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1 ml-auto" onClick={() => setStyleMode(s => s === 'satellite' ? 'streets' : 'satellite')}>
          {styleMode === 'satellite' ? <><MapIcon className="w-3 h-3" /> Karta</> : <><Satellite className="w-3 h-3" /> Satellit</>}
        </Button>
      </div>

      <div className="relative rounded-md border border-border overflow-hidden bg-muted" style={{ height }}>
        <div ref={containerRef} className="absolute inset-0" />
        {tokenLoading && !loadError && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Laddar karta…
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-destructive p-3 text-center">
            {loadError}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        {value.mode === 'polygon' ? (
          <span>
            Yta: <strong className="text-foreground">{Math.round(area)} m²</strong>
            {tooBig && <span className="text-destructive ml-2">⚠ stor yta — risk för falska larm</span>}
            {tooSmall && <span className="text-muted-foreground ml-2">⚠ mycket liten — kan missa GPS-drift</span>}
          </span>
        ) : (
          <span>Cirkel-läge: använd radie-fältet nedan ({value.radius_meters} m)</span>
        )}
        <span>{value.mode === 'polygon' ? 'Klicka för hörn, dubbelklick stänger' : 'Centrera på adress med sökknappen'}</span>
      </div>
    </div>
  );
};

export default GeofenceMapEditor;
