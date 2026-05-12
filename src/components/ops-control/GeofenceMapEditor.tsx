import { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { Button } from '@/components/ui/button';
import { Pentagon, Circle, Trash2, Crosshair, Satellite, Map as MapIcon } from 'lucide-react';
import MapboxMap, { type MapStyle } from '@/components/maps/MapboxMap';
import circleToPolygon from '@/lib/maps/circleToPolygon';
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
  centerOn?: { lat: number; lng: number } | null;
  height?: number;
}

const DEFAULT_CENTER: [number, number] = [18.0686, 59.3293];
const FILL_COLOR = '#7c3aed';
const CIRCLE_SOURCE_ID = 'org-location-circle';
const CIRCLE_FILL_ID = 'org-location-circle-fill';
const CIRCLE_LINE_ID = 'org-location-circle-line';

const hasCoordinates = (value: GeofenceValue) =>
  Number.isFinite(value.latitude) &&
  Number.isFinite(value.longitude) &&
  (Math.abs(value.latitude) > 0.000001 || Math.abs(value.longitude) > 0.000001);

const GeofenceMapEditor = ({ value, onChange, centerOn, height = 360 }: Props) => {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const valueRef = useRef(value);
  const modeRef = useRef(value.mode);
  const [mapStyle, setMapStyle] = useState<MapStyle>('satellite');
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  const [area, setArea] = useState(0);

  useEffect(() => {
    valueRef.current = value;
    modeRef.current = value.mode;
  }, [value]);

  const updateCircleCenter = useCallback((lat: number, lng: number) => {
    onChange({
      ...valueRef.current,
      latitude: lat,
      longitude: lng,
    });
  }, [onChange]);

  const clearCircleOverlay = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer(CIRCLE_LINE_ID)) map.removeLayer(CIRCLE_LINE_ID);
    if (map.getLayer(CIRCLE_FILL_ID)) map.removeLayer(CIRCLE_FILL_ID);
    if (map.getSource(CIRCLE_SOURCE_ID)) map.removeSource(CIRCLE_SOURCE_ID);
  }, []);

  const renderCircleOverlay = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const current = valueRef.current;
    const shouldShowCircle = current.mode === 'circle' && hasCoordinates(current) && current.radius_meters > 0;

    if (shouldShowCircle) {
      const center: [number, number] = [current.longitude, current.latitude];
      const geometry = circleToPolygon(center, current.radius_meters, 64);
      const data: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry }],
      };

      const source = map.getSource(CIRCLE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData(data);
      } else {
        map.addSource(CIRCLE_SOURCE_ID, { type: 'geojson', data });
        map.addLayer({
          id: CIRCLE_FILL_ID,
          type: 'fill',
          source: CIRCLE_SOURCE_ID,
          paint: { 'fill-color': FILL_COLOR, 'fill-opacity': 0.16 },
        });
        map.addLayer({
          id: CIRCLE_LINE_ID,
          type: 'line',
          source: CIRCLE_SOURCE_ID,
          paint: { 'line-color': FILL_COLOR, 'line-width': 2 },
        });
      }

      if (!markerRef.current) {
        markerRef.current = new mapboxgl.Marker({ color: FILL_COLOR, draggable: true })
          .setLngLat(center)
          .addTo(map);
        markerRef.current.on('dragend', () => {
          const lngLat = markerRef.current?.getLngLat();
          if (!lngLat) return;
          updateCircleCenter(lngLat.lat, lngLat.lng);
        });
      } else {
        markerRef.current.setLngLat(center);
        if (!markerRef.current.getElement().isConnected) {
          markerRef.current.addTo(map);
        }
      }
      return;
    }

    clearCircleOverlay();
    markerRef.current?.remove();
    markerRef.current = null;
  }, [clearCircleOverlay, updateCircleCenter]);

  const syncPolygonFromDraw = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;
    const polygonFeature = draw.getAll().features.find((feature) => feature.geometry.type === 'Polygon');

    if (!polygonFeature) {
      setArea(0);
      onChange({
        ...valueRef.current,
        mode: modeRef.current === 'polygon' ? 'polygon' : 'circle',
        polygon: null,
      });
      return;
    }

    const polygon = polygonFeature.geometry as GeoJSONPolygon;
    const centroid = polygonCentroid(polygon);
    setArea(polygonAreaM2(polygon));
    onChange({
      ...valueRef.current,
      mode: 'polygon',
      polygon,
      latitude: centroid.lat,
      longitude: centroid.lng,
    });
  }, [onChange]);

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    mapRef.current = map;
    setMapReadyVersion((version) => version + 1);

    map.on('click', (event) => {
      if (modeRef.current !== 'circle') return;
      updateCircleCenter(event.lngLat.lat, event.lngLat.lng);
    });

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      defaultMode: 'simple_select',
      styles: [
        { id: 'gl-draw-polygon-fill', type: 'fill', filter: ['all', ['==', '$type', 'Polygon']], paint: { 'fill-color': FILL_COLOR, 'fill-opacity': 0.2 } },
        { id: 'gl-draw-polygon-stroke', type: 'line', filter: ['all', ['==', '$type', 'Polygon']], paint: { 'line-color': FILL_COLOR, 'line-width': 2 } },
        { id: 'gl-draw-polygon-midpoint', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']], paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': FILL_COLOR, 'circle-stroke-width': 1.5 } },
        { id: 'gl-draw-polygon-vertex', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']], paint: { 'circle-radius': 5, 'circle-color': FILL_COLOR, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
        { id: 'gl-draw-line-active', type: 'line', filter: ['all', ['==', '$type', 'LineString'], ['==', 'active', 'true']], paint: { 'line-color': FILL_COLOR, 'line-width': 2, 'line-dasharray': [2, 2] } },
      ],
    });
    drawRef.current = draw;
    map.addControl(draw, 'top-left');
    map.on('draw.create', syncPolygonFromDraw);
    map.on('draw.update', syncPolygonFromDraw);
    map.on('draw.delete', syncPolygonFromDraw);

    const current = valueRef.current;
    if (current.mode === 'polygon' && current.polygon) {
      try {
        draw.add({ type: 'Feature', properties: {}, geometry: current.polygon } as GeoJSON.Feature<GeoJSONPolygon>);
        setArea(polygonAreaM2(current.polygon));
      } catch {
        setArea(0);
      }
    } else {
      setArea(0);
    }

    const initialCenter = hasCoordinates(current)
      ? [current.longitude, current.latitude] as [number, number]
      : centerOn
      ? [centerOn.lng, centerOn.lat] as [number, number]
      : DEFAULT_CENTER;
    const initialZoom = hasCoordinates(current) || centerOn ? 18 : 11;
    map.jumpTo({ center: initialCenter, zoom: initialZoom });
    map.once('idle', renderCircleOverlay);
  }, [centerOn, renderCircleOverlay, syncPolygonFromDraw, updateCircleCenter]);

  const handleMapDestroy = useCallback(() => {
    drawRef.current = null;
    markerRef.current = null;
    mapRef.current = null;
    setArea(0);
  }, []);

  useEffect(() => {
    if (!mapReadyVersion || !mapRef.current || !drawRef.current) return;
    const map = mapRef.current;
    const draw = drawRef.current;
    const current = valueRef.current;

    if (current.mode === 'polygon') {
      clearCircleOverlay();
      markerRef.current?.remove();
      markerRef.current = null;

      const existingPolygon = draw.getAll().features.find((feature) => feature.geometry.type === 'Polygon');
      if (!current.polygon) {
        if (!existingPolygon) {
          setArea(0);
          draw.changeMode('draw_polygon');
        }
        return;
      }

      const samePolygon = JSON.stringify(existingPolygon?.geometry ?? null) === JSON.stringify(current.polygon);
      if (!samePolygon) {
        draw.deleteAll();
        try {
          draw.add({ type: 'Feature', properties: {}, geometry: current.polygon } as GeoJSON.Feature<GeoJSONPolygon>);
        } catch {
          setArea(0);
        }
      }
      setArea(polygonAreaM2(current.polygon));
      return;
    }

    if (draw.getAll().features.length > 0) {
      draw.deleteAll();
    }
    setArea(0);
    renderCircleOverlay();
    if (hasCoordinates(current)) {
      map.easeTo({ center: [current.longitude, current.latitude], zoom: Math.max(map.getZoom(), 18), duration: 0 });
    }
  }, [mapReadyVersion, value.mode, value.polygon, value.latitude, value.longitude, value.radius_meters, clearCircleOverlay, renderCircleOverlay]);

  useEffect(() => {
    if (!mapRef.current || value.mode !== 'circle') return;
    renderCircleOverlay();
  }, [value.mode, value.latitude, value.longitude, value.radius_meters, renderCircleOverlay]);

  useEffect(() => {
    if (!mapRef.current || !centerOn) return;
    mapRef.current.flyTo({ center: [centerOn.lng, centerOn.lat], zoom: 18, duration: 600 });
    if (valueRef.current.mode === 'circle') {
      onChange({
        ...valueRef.current,
        latitude: centerOn.lat,
        longitude: centerOn.lng,
      });
    }
  }, [centerOn?.lat, centerOn?.lng, onChange]);

  const startDrawPolygon = () => {
    const draw = drawRef.current;
    if (!draw) return;
    clearCircleOverlay();
    markerRef.current?.remove();
    markerRef.current = null;
    setArea(0);
    onChange({ ...valueRef.current, mode: 'polygon', polygon: null });
    draw.deleteAll();
    draw.changeMode('draw_polygon');
  };

  const switchToCircle = () => {
    drawRef.current?.deleteAll();
    setArea(0);
    onChange({ ...valueRef.current, mode: 'circle', polygon: null });
    renderCircleOverlay();
  };

  const clearAll = () => {
    drawRef.current?.deleteAll();
    setArea(0);
    onChange({ ...valueRef.current, mode: 'circle', polygon: null });
    renderCircleOverlay();
  };

  const goToMyPosition = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: 19,
          duration: 600,
        });
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const tooBig = value.mode === 'polygon' && area > 10000;
  const tooSmall = value.mode === 'polygon' && area > 0 && area < 25;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant={value.mode === 'polygon' ? 'default' : 'outline'} className="h-7 gap-1 text-xs" onClick={startDrawPolygon}>
          <Pentagon className="h-3 w-3" /> Rita polygon
        </Button>
        <Button type="button" size="sm" variant={value.mode === 'circle' ? 'default' : 'outline'} className="h-7 gap-1 text-xs" onClick={switchToCircle}>
          <Circle className="h-3 w-3" /> Cirkel
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={clearAll}>
          <Trash2 className="h-3 w-3" /> Rensa
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={goToMyPosition}>
          <Crosshair className="h-3 w-3" /> Min pos
        </Button>
        <Button type="button" size="sm" variant="outline" className="ml-auto h-7 gap-1 text-xs" onClick={() => setMapStyle((current) => current === 'satellite' ? 'streets' : 'satellite')}>
          {mapStyle === 'satellite' ? <><MapIcon className="h-3 w-3" /> Karta</> : <><Satellite className="h-3 w-3" /> Satellit</>}
        </Button>
      </div>

      <div className="relative overflow-hidden rounded-md border border-border bg-muted" style={{ height }}>
        <MapboxMap
          key={mapStyle}
          style={mapStyle}
          initialCenter={hasCoordinates(value) ? [value.longitude, value.latitude] : centerOn ? [centerOn.lng, centerOn.lat] : DEFAULT_CENTER}
          initialZoom={hasCoordinates(value) || centerOn ? 18 : 11}
          onReady={handleMapReady}
          onDestroy={handleMapDestroy}
          className="absolute inset-0"
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        {value.mode === 'polygon' ? (
          <span>
            Yta: <strong className="text-foreground">{Math.round(area)} m²</strong>
            {tooBig && <span className="ml-2 text-destructive">⚠ stor yta — risk för falska larm</span>}
            {tooSmall && <span className="ml-2">⚠ mycket liten — kan missa GPS-drift</span>}
          </span>
        ) : (
          <span>Cirkel-läge: använd radie-fältet nedan ({value.radius_meters} m)</span>
        )}
        <span>{value.mode === 'polygon' ? 'Klicka för hörn, dubbelklick stänger' : 'Klicka i kartan eller centrera på adress'}</span>
      </div>
    </div>
  );
};

export default GeofenceMapEditor;