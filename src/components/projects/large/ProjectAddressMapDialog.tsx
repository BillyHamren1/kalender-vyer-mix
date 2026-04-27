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
 *
 * ROBUSTHET (2026-04):
 *  • Karta init har explicit error/timeout state — ingen evig spinner.
 *  • map.on('error', ...) fångar token-/style-/tile-fel och visar UI.
 *  • Saftytimeout (8s): om `load` aldrig fyrar markeras kartan som
 *    misslyckad istället för att spinnern hänger för alltid.
 *  • Retry-knapp river ner mapRef och försöker igen.
 *  • Adressfältet/typeahead är användbart även om kartan failar.
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
  // Callback ref — Radix Dialog mounts the content asynchronously, so a plain
  // useRef will be `null` the first time the init effect runs after `open`
  // flips true. Storing the node in state forces the effect to re-run the
  // moment the <div> actually mounts. Without this, the second open of the
  // dialog hangs on "Laddar karta…" because mapStatus stays at 'idle'.
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
    setMapError(null);
  }, [open, initialAddress, initialLatitude, initialLongitude, initialRadiusMeters, initialGeofenceMode, initialGeofencePolygon]);

  // Fetch token (re-fetched on retry too)
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
          console.error('[ProjectAddressMapDialog] mapbox-token failed:', error);
          setMapError('Kunde inte hämta Mapbox-token. Kontrollera att MAPBOX_PUBLIC_TOKEN är satt.');
          setMapStatus('error');
          return;
        }
        setToken(data.token);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[ProjectAddressMapDialog] mapbox-token threw:', err);
        setMapError(err?.message || 'Kunde inte hämta Mapbox-token');
        setMapStatus('error');
      });
    return () => { cancelled = true; };
  }, [open, token, retryCounter]);

  // Init map when dialog open + token ready.
  // KRITISKT: Vi måste rensa kartan helt när dialogen stängs. Radix Dialog
  // kan behålla content-noden mellan open/close, så cleanup-returen från
  // föregående open-cykel kanske inte hinner köra innan vi öppnar igen.
  // Då blir vi sittande med en gammal mapRef + mapStatus='idle' → evig spinner.
  useEffect(() => {
    if (!open) {
      // Säkerställ att inget hänger kvar mellan öppningar.
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

    setMapStatus('loading-map');
    setMapError(null);

    try {
      mapboxgl.accessToken = token;
    } catch (e) {
      console.error('[ProjectAddressMapDialog] failed to set accessToken:', e);
      setMapError('Mapbox-token kunde inte sättas');
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
        zoom: coords.lat != null ? 14 : 4.5,
        attributionControl: false,
      });
    } catch (e: any) {
      console.error('[ProjectAddressMapDialog] mapboxgl.Map ctor failed:', e);
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

    // Safety timeout — if `load` never fires, surface an error instead of
    // an eternal spinner. Common causes: network blocked, invalid token,
    // tile CDN unreachable.
    loadTimeoutRef.current = window.setTimeout(() => {
      if (mapRef.current === map && mapStatus !== 'ready') {
        console.warn('[ProjectAddressMapDialog] map load timeout');
        setMapError('Kartan tog för lång tid att ladda. Kontrollera nätverk och Mapbox-token.');
        setMapStatus('error');
      }
    }, MAP_LOAD_TIMEOUT_MS);

    const onError = (e: any) => {
      const msg = e?.error?.message || e?.message || 'Okänt kartfel';
      console.error('[ProjectAddressMapDialog] map error:', msg, e);
      // Only flip to error if we are not yet ready (post-ready errors are
      // tile-specific and shouldn't kill the UI).
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
      setMapStatus('ready');
      setMapError(null);

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

      // Initial radius circle (only safe after style.load)
      ensureRadiusCircle(map, coords.lat, coords.lng, radius, mode);
    });

    // Click-to-place pin (only in circle mode)
    map.on('click', (e) => {
      if (mode !== 'circle') return;
      const { lng, lat } = e.lngLat;
      setCoords({ lat, lng });
    });

    // Polygon draw events — auto-switch mode to 'polygon' when user draws,
    // otherwise the polygon is silently dropped on save (geofence_mode stays 'circle').
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

    return () => {
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

  // Byt kartstil utan att återskapa kartan. setStyle() rensar custom sources/layers,
  // så vi måste återställa radiecirkeln och ev. ritad polygon när style.load fyrar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapStatus !== 'ready') return;
    const target = MAP_STYLES[mapStyle];
    // @ts-ignore — getStyle().sprite/.glyphs varierar; jämför hellre via name.
    const currentName = (map.getStyle()?.name || '').toLowerCase();
    const wantSatellite = mapStyle === 'satellite';
    const isSatellite = currentName.includes('satellite');
    if (wantSatellite === isSatellite) return;

    map.setStyle(target);
    map.once('style.load', () => {
      // Återställ radiecirkeln (markören och NavigationControl bevaras automatiskt).
      ensureRadiusCircle(map, coords.lat, coords.lng, radius, mode);
      // Återinför ritad polygon om någon finns (Draw-kontrollen kan tappa state vid setStyle).
      try {
        if (polygon && drawRef.current) {
          drawRef.current.deleteAll();
          drawRef.current.add({ type: 'Feature', geometry: polygon, properties: {} } as any);
        }
      } catch (e) {
        console.warn('[ProjectAddressMapDialog] re-add polygon after style change failed:', e);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle, mapStatus]);

  // Update marker + radius circle when coords/radius/mode change
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

  // Address typeahead (debounced) — works even if the map failed
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
    if (mapRef.current && mapStatus === 'ready') {
      mapRef.current.flyTo({ center: [lng, lat], zoom: 15, duration: 800 });
    }
  }, [mapStatus]);

  const handleRetry = useCallback(() => {
    // Tear down current map and re-init.
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
    // Force token re-fetch as well in case it expired.
    setToken(null);
    setRetryCounter((n) => n + 1);
  }, []);

  const handleSave = async () => {
    // If a polygon was drawn, save it as polygon mode regardless of UI toggle —
    // it's almost certainly what the user wanted (and prevents silent loss).
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
          {/* Map */}
          <div className="relative h-[480px] bg-muted">
            <div ref={containerRef} className="absolute inset-0" />

            {/* Stilväxlare: Karta / Satellit */}
            {mapStatus === 'ready' && (
              <div className="absolute top-3 left-3 z-10 flex rounded-md overflow-hidden border border-border bg-card/95 backdrop-blur shadow-md text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setMapStyle('streets')}
                  className={`px-2.5 py-1.5 transition-colors ${
                    mapStyle === 'streets'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-accent'
                  }`}
                >
                  Karta
                </button>
                <button
                  type="button"
                  onClick={() => setMapStyle('satellite')}
                  className={`px-2.5 py-1.5 transition-colors border-l border-border ${
                    mapStyle === 'satellite'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-accent'
                  }`}
                >
                  Satellit
                </button>
              </div>
            )}

            {showLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/70 text-xs text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span>
                  {mapStatus === 'loading-token' ? 'Hämtar Mapbox-token…' : 'Laddar karta…'}
                </span>
              </div>
            )}

            {showError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/90 px-6 text-center">
                <AlertTriangle className="h-7 w-7 text-destructive" />
                <div className="text-sm font-medium text-foreground">
                  Kartan kunde inte laddas
                </div>
                <div className="text-xs text-muted-foreground max-w-xs">
                  {mapError || 'Okänt fel vid kartinit.'}
                </div>
                <Button size="sm" variant="outline" onClick={handleRetry} className="mt-1">
                  <RotateCw className="h-3.5 w-3.5 mr-1.5" />
                  Försök igen
                </Button>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Du kan fortfarande söka adress och spara koordinater i panelen till höger.
                </p>
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
  // Defensive: never touch sources/layers before the style is ready.
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
  } catch (e) {
    console.warn('[ensureRadiusCircle] failed:', e);
  }
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
