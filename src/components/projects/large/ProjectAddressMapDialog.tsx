/**
 * ProjectAddressMapDialog (rewritten 2026-05-01)
 * ──────────────────────────────────────────────
 * Enkel adress + geofence-editor för ett stort projekt.
 *
 * Designprinciper:
 *  • Visar ENDAST projektets adress/pin. Inga förinställda förslag,
 *    ingen typeahead som visar slumpmässiga H-orter.
 *  • Adress är ett fritt textfält. En explicit "Sök på karta"-knapp
 *    geokodar exakt det användaren skrivit (en gång).
 *  • Klick på kartan eller drag av markören flyttar pin.
 *  • Cirkel-radie eller polygon-staket. Polygon ritas via Mapbox Draw.
 *  • Robust init: timeout, error state, retry. Ingen evig spinner.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Loader2, MapPin, Search, Trash2, Pencil, AlertTriangle, RotateCw } from 'lucide-react';
import { toast } from 'sonner';

export interface ProjectAddressMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAddress: string | null;
  initialLatitude: number | null;
  initialLongitude: number | null;
  initialRadiusMeters?: number | null;
  initialGeofenceMode?: 'circle' | 'polygon' | null;
  initialGeofencePolygon?: GeoJSON.Polygon | null;
  onSave: (data: {
    address: string;
    latitude: number | null;
    longitude: number | null;
    radius_meters: number;
    geofence_mode: 'circle' | 'polygon';
    geofence_polygon: GeoJSON.Polygon | null;
  }) => Promise<void> | void;
}

const DEFAULT_CENTER: [number, number] = [15.5, 62.0]; // Sverige centroid
const MAP_LOAD_TIMEOUT_MS = 8000;

type MapStatus = 'idle' | 'loading-token' | 'loading-map' | 'ready' | 'error';
type MapStyleKey = 'streets' | 'satellite';
const MAP_STYLES: Record<MapStyleKey, string> = {
  streets: 'mapbox://styles/mapbox/streets-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
};

export default function ProjectAddressMapDialog({
  open,
  onOpenChange,
  initialAddress,
  initialLatitude,
  initialLongitude,
  initialRadiusMeters,
  initialGeofenceMode,
  initialGeofencePolygon,
  onSave,
}: ProjectAddressMapDialogProps) {
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setContainerNode(node);
  }, []);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const loadTimeoutRef = useRef<number | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>('idle');
  const [mapError, setMapError] = useState<string | null>(null);
  const [retryCounter, setRetryCounter] = useState(0);
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('streets');

  const [address, setAddress] = useState(initialAddress ?? '');
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({
    lat: initialLatitude ?? null,
    lng: initialLongitude ?? null,
  });
  const [radius, setRadius] = useState<number>(initialRadiusMeters ?? 100);
  const [mode, setMode] = useState<'circle' | 'polygon'>(initialGeofenceMode ?? 'circle');
  const [polygon, setPolygon] = useState<GeoJSON.Polygon | null>(initialGeofencePolygon ?? null);

  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset state vid öppning
  useEffect(() => {
    if (!open) return;
    setAddress(initialAddress ?? '');
    setCoords({ lat: initialLatitude ?? null, lng: initialLongitude ?? null });
    setRadius(initialRadiusMeters ?? 100);
    setMode(initialGeofenceMode ?? 'circle');
    setPolygon(initialGeofencePolygon ?? null);
    setMapError(null);
  }, [open, initialAddress, initialLatitude, initialLongitude, initialRadiusMeters, initialGeofenceMode, initialGeofencePolygon]);

  // Hämta token
  useEffect(() => {
    if (!open) return;
    if (token) return;
    let cancelled = false;
    setMapStatus('loading-token');
    setMapError(null);
    supabase.functions.invoke('mapbox-token')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.token) {
          setMapError('Kunde inte hämta Mapbox-token.');
          setMapStatus('error');
          return;
        }
        setToken(data.token);
      })
      .catch((err) => {
        if (cancelled) return;
        setMapError(err?.message || 'Kunde inte hämta Mapbox-token');
        setMapStatus('error');
      });
    return () => { cancelled = true; };
  }, [open, token, retryCounter]);

  // Init karta
  useEffect(() => {
    if (!open) {
      if (loadTimeoutRef.current) {
        window.clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch { /* noop */ }
        mapRef.current = null;
        markerRef.current = null;
        drawRef.current = null;
      }
      setMapStatus('idle');
      return;
    }
    if (!token) return;
    if (!containerNode) return;
    if (mapRef.current) return;

    if (containerNode.clientWidth === 0 || containerNode.clientHeight === 0) {
      const ro = new ResizeObserver(() => {
        if (containerNode.clientWidth > 0 && containerNode.clientHeight > 0) {
          ro.disconnect();
          setRetryCounter((n) => n + 1);
        }
      });
      ro.observe(containerNode);
      return () => { try { ro.disconnect(); } catch { /* noop */ } };
    }

    setMapStatus('loading-map');
    setMapError(null);

    try { mapboxgl.accessToken = token; } catch (e: any) {
      setMapError(e?.message || 'Mapbox-token kunde inte sättas');
      setMapStatus('error');
      return;
    }

    const initialCenter: [number, number] =
      coords.lng != null && coords.lat != null ? [coords.lng, coords.lat] : DEFAULT_CENTER;

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: containerNode,
        style: MAP_STYLES[mapStyle],
        center: initialCenter,
        zoom: coords.lat != null ? 15 : 4.5,
        attributionControl: false,
      });
    } catch (e: any) {
      setMapError(e?.message || 'Kunde inte skapa kartan');
      setMapStatus('error');
      return;
    }
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
      defaultMode: 'simple_select',
    });
    drawRef.current = draw;
    map.addControl(draw as any, 'top-left');

    loadTimeoutRef.current = window.setTimeout(() => {
      if (mapRef.current === map && mapStatus !== 'ready') {
        setMapError('Kartan tog för lång tid att ladda. Kontrollera nätverk och token.');
        setMapStatus('error');
      }
    }, MAP_LOAD_TIMEOUT_MS);

    const onError = (e: any) => {
      const msg = e?.error?.message || e?.message || 'Okänt kartfel';
      setMapStatus((prev) => {
        if (prev === 'ready') return prev;
        setMapError(msg);
        return 'error';
      });
    };
    map.on('error', onError);

    map.on('load', () => {
      if (loadTimeoutRef.current) {
        window.clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
      try { map.resize(); } catch { /* noop */ }
      window.setTimeout(() => { try { map.resize(); } catch { /* noop */ } }, 250);
      setMapStatus('ready');
      setMapError(null);

      if (coords.lat != null && coords.lng != null) {
        const m = new mapboxgl.Marker({ color: '#2dd4bf', draggable: true })
          .setLngLat([coords.lng, coords.lat])
          .addTo(map);
        markerRef.current = m;
        m.on('dragend', () => {
          const ll = m.getLngLat();
          setCoords({ lat: ll.lat, lng: ll.lng });
        });
      }

      if (initialGeofencePolygon) {
        try {
          draw.add({ type: 'Feature', geometry: initialGeofencePolygon, properties: {} } as any);
        } catch { /* noop */ }
      }

      ensureRadiusCircle(map, coords.lat, coords.lng, radius, mode);
    });

    map.on('click', (e) => {
      if (mode !== 'circle') return;
      const { lng, lat } = e.lngLat;
      setCoords({ lat, lng });
    });

    const onDrawCreate = () => {
      const fc = draw.getAll();
      const poly = fc.features.find((f) => f.geometry.type === 'Polygon');
      if (poly) {
        setPolygon(poly.geometry as GeoJSON.Polygon);
        setMode('polygon');
      }
    };
    const onDrawUpdate = () => {
      const fc = draw.getAll();
      const poly = fc.features.find((f) => f.geometry.type === 'Polygon');
      setPolygon(poly ? (poly.geometry as GeoJSON.Polygon) : null);
    };
    const onDrawDelete = () => {
      const fc = draw.getAll();
      const poly = fc.features.find((f) => f.geometry.type === 'Polygon');
      setPolygon(poly ? (poly.geometry as GeoJSON.Polygon) : null);
    };
    map.on('draw.create', onDrawCreate);
    map.on('draw.update', onDrawUpdate);
    map.on('draw.delete', onDrawDelete);

    const ro = new ResizeObserver(() => {
      try { map.resize(); } catch { /* noop */ }
    });
    ro.observe(containerNode);

    return () => {
      try { ro.disconnect(); } catch { /* noop */ }
      if (loadTimeoutRef.current) {
        window.clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
      try { map.off('error', onError); } catch { /* noop */ }
      try { map.remove(); } catch { /* noop */ }
      mapRef.current = null;
      markerRef.current = null;
      drawRef.current = null;
      setMapStatus('idle');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token, retryCounter, containerNode]);

  // Stilbyte
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapStatus !== 'ready') return;
    const target = MAP_STYLES[mapStyle];
    const currentName = (map.getStyle()?.name || '').toLowerCase();
    const wantSatellite = mapStyle === 'satellite';
    const isSatellite = currentName.includes('satellite');
    if (wantSatellite === isSatellite) return;

    map.setStyle(target);
    map.once('style.load', () => {
      ensureRadiusCircle(map, coords.lat, coords.lng, radius, mode);
      try {
        if (polygon && drawRef.current) {
          drawRef.current.deleteAll();
          drawRef.current.add({ type: 'Feature', geometry: polygon, properties: {} } as any);
        }
      } catch { /* noop */ }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle, mapStatus]);

  // Sync marker + radie när coords ändras
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapStatus !== 'ready') return;

    if (coords.lat != null && coords.lng != null) {
      if (markerRef.current) {
        markerRef.current.setLngLat([coords.lng, coords.lat]);
      } else {
        const m = new mapboxgl.Marker({ color: '#2dd4bf', draggable: true })
          .setLngLat([coords.lng, coords.lat])
          .addTo(map);
        markerRef.current = m;
        m.on('dragend', () => {
          const ll = m.getLngLat();
          setCoords({ lat: ll.lat, lng: ll.lng });
        });
      }
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    ensureRadiusCircle(map, coords.lat, coords.lng, radius, mode);
  }, [coords, radius, mode, mapStatus]);

  // Manuell adressökning — geokoda EXAKT det användaren skrivit, en gång.
  const searchAddress = useCallback(async () => {
    if (!token) {
      toast.error('Kartan är inte redo ännu');
      return;
    }
    const q = address.trim();
    if (q.length < 3) {
      toast.error('Skriv in en adress (minst 3 tecken)');
      return;
    }
    setSearching(true);
    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
        `?access_token=${token}&country=se&language=sv&limit=1&autocomplete=false&types=address,place,locality,neighborhood,postcode`;
      const res = await fetch(url);
      const json = await res.json();
      const f = Array.isArray(json.features) && json.features[0];
      if (!f) {
        toast.error('Hittade ingen träff. Justera adressen eller klicka på kartan.');
        return;
      }
      const [lng, lat] = f.center;
      setCoords({ lat, lng });
      if (mapRef.current && mapStatus === 'ready') {
        mapRef.current.flyTo({ center: [lng, lat], zoom: 16, duration: 800 });
      }
      toast.success(`Hittad: ${f.place_name}`);
    } catch (err: any) {
      toast.error(err?.message || 'Sökningen misslyckades');
    } finally {
      setSearching(false);
    }
  }, [address, token, mapStatus]);

  const handleRetry = useCallback(() => {
    if (loadTimeoutRef.current) {
      window.clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    if (mapRef.current) {
      try { mapRef.current.remove(); } catch { /* noop */ }
      mapRef.current = null;
      markerRef.current = null;
      drawRef.current = null;
    }
    setMapError(null);
    setMapStatus('idle');
    setToken(null);
    setRetryCounter((n) => n + 1);
  }, []);

  const handleSave = async () => {
    const effectiveMode: 'circle' | 'polygon' = polygon ? 'polygon' : mode;
    if (effectiveMode === 'polygon' && !polygon) {
      toast.error('Rita ett polygon-staket först, eller välj cirkelläge');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        address: address.trim(),
        latitude: coords.lat,
        longitude: coords.lng,
        radius_meters: Math.round(radius),
        geofence_mode: effectiveMode,
        geofence_polygon: effectiveMode === 'polygon' ? polygon : null,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte spara');
    } finally {
      setSaving(false);
    }
  };

  const clearPolygon = () => {
    drawRef.current?.deleteAll();
    setPolygon(null);
  };

  const showLoading = mapStatus === 'loading-token' || mapStatus === 'loading-map' || mapStatus === 'idle';
  const showError = mapStatus === 'error';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Adress & geofence
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-0">
          {/* Karta */}
          <div className="relative h-[480px] bg-muted">
            <div ref={containerRef} className="absolute inset-0" />

            {mapStatus === 'ready' && (
              <div className="absolute top-3 left-3 z-10 flex rounded-md overflow-hidden border border-border bg-card/95 backdrop-blur shadow-md text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setMapStyle('streets')}
                  className={`px-2.5 py-1.5 transition-colors ${
                    mapStyle === 'streets' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent'
                  }`}
                >
                  Karta
                </button>
                <button
                  type="button"
                  onClick={() => setMapStyle('satellite')}
                  className={`px-2.5 py-1.5 transition-colors border-l border-border ${
                    mapStyle === 'satellite' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent'
                  }`}
                >
                  Satellit
                </button>
              </div>
            )}

            {showLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/70 text-xs text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span>{mapStatus === 'loading-token' ? 'Hämtar Mapbox-token…' : 'Laddar karta…'}</span>
              </div>
            )}

            {showError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/90 px-6 text-center">
                <AlertTriangle className="h-7 w-7 text-destructive" />
                <div className="text-sm font-medium text-foreground">Kartan kunde inte laddas</div>
                <div className="text-xs text-muted-foreground max-w-xs">
                  {mapError || 'Okänt fel vid kartinit.'}
                </div>
                <Button size="sm" variant="outline" onClick={handleRetry} className="mt-1">
                  <RotateCw className="h-3.5 w-3.5 mr-1.5" /> Försök igen
                </Button>
              </div>
            )}

            {coords.lat != null && coords.lng != null && (
              <div className="absolute bottom-3 left-3 bg-card/95 backdrop-blur rounded-md px-2.5 py-1.5 shadow-md border border-border text-xs font-medium pointer-events-none">
                📍 {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="p-5 space-y-4 border-l border-border max-h-[480px] overflow-y-auto">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Projektets adress
              </Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchAddress(); } }}
                placeholder="t.ex. Sportvägen 1, Tranås"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={searchAddress}
                disabled={searching || !address.trim()}
                className="w-full h-8 text-xs"
              >
                {searching ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5 mr-1.5" />
                )}
                Sök på karta
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Skriv adressen och klicka "Sök på karta", eller klicka direkt på kartan för att placera pin.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Staket
              </Label>
              <ToggleGroup
                type="single"
                value={mode}
                onValueChange={(v) => v && setMode(v as 'circle' | 'polygon')}
                className="grid grid-cols-2 gap-1"
              >
                <ToggleGroupItem value="circle" className="text-xs">Cirkel (radie)</ToggleGroupItem>
                <ToggleGroupItem value="polygon" className="text-xs">Polygon (rita)</ToggleGroupItem>
              </ToggleGroup>
            </div>

            {mode === 'circle' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Radie</Label>
                  <span className="text-xs font-mono">{Math.round(radius)} m</span>
                </div>
                <Slider
                  min={20}
                  max={1000}
                  step={10}
                  value={[radius]}
                  onValueChange={(v) => setRadius(v[0])}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Pencil className="h-3 w-3 mt-0.5 shrink-0" />
                  Använd polygon-verktyget uppe till vänster på kartan. Klicka för punkter, dubbelklicka för att avsluta.
                </p>
                {polygon && (
                  <Button variant="ghost" size="sm" onClick={clearPolygon} className="h-7 text-xs">
                    <Trash2 className="h-3 w-3 mr-1" /> Rensa polygon
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={saving || !address.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Helper: rendera radiecirkel ────────────────────────────────────
function ensureRadiusCircle(
  map: mapboxgl.Map,
  lat: number | null,
  lng: number | null,
  radiusM: number,
  mode: 'circle' | 'polygon',
) {
  if (!map.isStyleLoaded()) return;
  const SRC = 'project-radius-src';
  const LAYER_FILL = 'project-radius-fill';
  const LAYER_LINE = 'project-radius-line';

  const remove = () => {
    try {
      if (map.getLayer(LAYER_FILL)) map.removeLayer(LAYER_FILL);
      if (map.getLayer(LAYER_LINE)) map.removeLayer(LAYER_LINE);
      if (map.getSource(SRC)) map.removeSource(SRC);
    } catch { /* swallow */ }
  };

  if (mode !== 'circle' || lat == null || lng == null) {
    remove();
    return;
  }

  const polygon = circlePolygon([lng, lat], radiusM, 64);
  const data: GeoJSON.Feature = {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [polygon] },
    properties: {},
  };

  const existing = map.getSource(SRC) as mapboxgl.GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data as any);
    return;
  }

  try {
    map.addSource(SRC, { type: 'geojson', data: data as any });
    map.addLayer({
      id: LAYER_FILL, type: 'fill', source: SRC,
      paint: { 'fill-color': '#2dd4bf', 'fill-opacity': 0.15 },
    });
    map.addLayer({
      id: LAYER_LINE, type: 'line', source: SRC,
      paint: { 'line-color': '#0d9488', 'line-width': 2 },
    });
  } catch { /* noop */ }
}

function circlePolygon(center: [number, number], radiusM: number, points = 64): number[][] {
  const [lng, lat] = center;
  const coords: number[][] = [];
  const earthRadius = 6378137;
  const latRad = (lat * Math.PI) / 180;
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = (radiusM * Math.cos(angle)) / (earthRadius * Math.cos(latRad));
    const dy = (radiusM * Math.sin(angle)) / earthRadius;
    coords.push([lng + (dx * 180) / Math.PI, lat + (dy * 180) / Math.PI]);
  }
  return coords;
}
