/**
 * ProjectAddressMapDialog
 * ───────────────────────
 * Dialog för att redigera ett stort projekts adress + geofence.
 *
 *  • Adressfält med Mapbox-typeahead som visar FLERA kandidater
 *    (löser problemet att "sportvägen 1, tranås" annars hamnar i
 *    Örnsköldsvik om vi blint tar `features[0]`).
 *  • Mapbox-karta visar pin för aktuell position. Klick på kartan
 *    flyttar pin → koordinater uppdateras (manuell justering).
 *  • Geofence-läge: cirkel (radie i meter) eller polygon (rita med
 *    Mapbox Draw).
 *  • Sparar address, address_latitude, address_longitude,
 *    address_radius_meters, address_geofence_mode, address_geofence_polygon.
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
import { Loader2, MapPin, Search, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

interface MapboxFeature {
  id: string;
  place_name: string;
  text: string;
  center: [number, number]; // [lng, lat]
  context?: Array<{ id: string; text: string }>;
}

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

const DEFAULT_CENTER: [number, number] = [15.5, 62.0]; // Sweden centroid

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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [address, setAddress] = useState(initialAddress ?? '');
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({
    lat: initialLatitude ?? null,
    lng: initialLongitude ?? null,
  });
  const [radius, setRadius] = useState<number>(initialRadiusMeters ?? 100);
  const [mode, setMode] = useState<'circle' | 'polygon'>(initialGeofenceMode ?? 'circle');
  const [polygon, setPolygon] = useState<GeoJSON.Polygon | null>(initialGeofencePolygon ?? null);

  const [searchInput, setSearchInput] = useState(initialAddress ?? '');
  const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchDebounceRef = useRef<number | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (!open) return;
    setAddress(initialAddress ?? '');
    setSearchInput(initialAddress ?? '');
    setCoords({ lat: initialLatitude ?? null, lng: initialLongitude ?? null });
    setRadius(initialRadiusMeters ?? 100);
    setMode(initialGeofenceMode ?? 'circle');
    setPolygon(initialGeofencePolygon ?? null);
    setSuggestions([]);
  }, [open, initialAddress, initialLatitude, initialLongitude, initialRadiusMeters, initialGeofenceMode, initialGeofencePolygon]);

  // Fetch token once
  useEffect(() => {
    if (token) return;
    supabase.functions.invoke('mapbox-token')
      .then(({ data, error }) => {
        if (error || !data?.token) {
          console.error('[ProjectAddressMapDialog] mapbox-token failed:', error);
          toast.error('Kunde inte ladda Mapbox-token');
          return;
        }
        setToken(data.token);
      });
  }, [token]);

  // Init map when dialog open + token ready
  useEffect(() => {
    if (!open || !token || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;
    const initialCenter: [number, number] =
      coords.lng != null && coords.lat != null ? [coords.lng, coords.lat] : DEFAULT_CENTER;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: initialCenter,
      zoom: coords.lat != null ? 14 : 4.5,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
      defaultMode: 'simple_select',
    });
    drawRef.current = draw;
    map.addControl(draw as any, 'top-left');

    map.on('load', () => {
      setMapReady(true);

      // Initial marker
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

      // Initial polygon
      if (initialGeofencePolygon) {
        try {
          draw.add({ type: 'Feature', geometry: initialGeofencePolygon, properties: {} } as any);
        } catch (e) {
          console.warn('Failed to load initial polygon:', e);
        }
      }

      // Initial radius circle
      ensureRadiusCircle(map, coords.lat, coords.lng, radius, mode);
    });

    // Click-to-place pin (only in circle mode)
    map.on('click', (e) => {
      if (mode !== 'circle') return;
      const { lng, lat } = e.lngLat;
      setCoords({ lat, lng });
    });

    // Polygon draw events
    const onDraw = () => {
      const fc = draw.getAll();
      const poly = fc.features.find((f) => f.geometry.type === 'Polygon');
      setPolygon(poly ? (poly.geometry as GeoJSON.Polygon) : null);
    };
    map.on('draw.create', onDraw);
    map.on('draw.update', onDraw);
    map.on('draw.delete', onDraw);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      drawRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token]);

  // Update marker + radius circle when coords/radius/mode change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

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
  }, [coords, radius, mode, mapReady]);

  // Address typeahead (debounced)
  useEffect(() => {
    if (!token) return;
    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    const q = searchInput.trim();
    if (q.length < 3) { setSuggestions([]); return; }
    searchDebounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
          `?access_token=${token}&country=se&language=sv&limit=6&autocomplete=true`;
        const res = await fetch(url);
        const json = await res.json();
        setSuggestions(Array.isArray(json.features) ? json.features : []);
      } catch (err) {
        console.warn('Typeahead failed:', err);
      } finally {
        setSearching(false);
      }
    }, 250);
  }, [searchInput, token]);

  const pickSuggestion = useCallback((f: MapboxFeature) => {
    const [lng, lat] = f.center;
    setAddress(f.place_name);
    setSearchInput(f.place_name);
    setCoords({ lat, lng });
    setSuggestions([]);
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [lng, lat], zoom: 15, duration: 800 });
    }
  }, []);

  const handleSave = async () => {
    if (mode === 'polygon' && !polygon) {
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
        geofence_mode: mode,
        geofence_polygon: mode === 'polygon' ? polygon : null,
      });
      onOpenChange(false);
    } catch (e: any) {
      console.error('Save failed:', e);
      toast.error(e?.message || 'Kunde inte spara');
    } finally {
      setSaving(false);
    }
  };

  const clearPolygon = () => {
    drawRef.current?.deleteAll();
    setPolygon(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Adress & geofence
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-0">
          {/* Map */}
          <div className="relative h-[480px] bg-muted">
            <div ref={containerRef} className="absolute inset-0" />
            {(!token || !mapReady) && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
            {coords.lat != null && coords.lng != null && (
              <div className="absolute bottom-3 left-3 bg-card/95 backdrop-blur rounded-md px-2.5 py-1.5 shadow-md border border-border text-xs font-medium">
                📍 {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="p-5 space-y-4 border-l border-border max-h-[480px] overflow-y-auto">
            {/* Address typeahead */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sök adress
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="t.ex. Sportvägen 1, Tranås"
                  className="pl-8"
                />
                {searching && (
                  <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {suggestions.length > 0 && (
                <div className="border border-border rounded-md bg-popover shadow-sm max-h-56 overflow-y-auto">
                  {suggestions.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => pickSuggestion(f)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b border-border last:border-b-0"
                    >
                      <div className="font-medium text-foreground">{f.text}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{f.place_name}</div>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Välj rätt träff i listan, eller klicka på kartan för att flytta pin.
              </p>
            </div>

            {/* Selected address */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Adress (sparas)
              </Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Adress..."
              />
            </div>

            {/* Geofence mode */}
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
                  Använd polygon-verktyget uppe till vänster på kartan. Klicka för att lägga punkter, dubbelklicka för att avsluta.
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

// ── Helper: render a circle source/layer for the radius preview ─────
function ensureRadiusCircle(
  map: mapboxgl.Map,
  lat: number | null,
  lng: number | null,
  radiusM: number,
  mode: 'circle' | 'polygon',
) {
  const SRC = 'project-radius-src';
  const LAYER_FILL = 'project-radius-fill';
  const LAYER_LINE = 'project-radius-line';

  const remove = () => {
    if (map.getLayer(LAYER_FILL)) map.removeLayer(LAYER_FILL);
    if (map.getLayer(LAYER_LINE)) map.removeLayer(LAYER_LINE);
    if (map.getSource(SRC)) map.removeSource(SRC);
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

  map.addSource(SRC, { type: 'geojson', data: data as any });
  map.addLayer({
    id: LAYER_FILL, type: 'fill', source: SRC,
    paint: { 'fill-color': '#2dd4bf', 'fill-opacity': 0.15 },
  });
  map.addLayer({
    id: LAYER_LINE, type: 'line', source: SRC,
    paint: { 'line-color': '#0d9488', 'line-width': 2 },
  });
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
