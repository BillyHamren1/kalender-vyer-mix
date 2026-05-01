import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { Loader2, Search, Pencil, Circle as CircleIcon, Layers } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import MapboxMap, { MapStyle } from "./MapboxMap";
import { useMapboxToken } from "@/hooks/useMapboxToken";
import circleToPolygon from "@/lib/maps/circleToPolygon";

export type GeofenceMode = "circle" | "polygon";

export interface ProjectAddressMapValue {
  address: string;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  geofence_mode: GeofenceMode;
  geofence_polygon: GeoJSON.Polygon | null;
}

interface ProjectAddressMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Partial<ProjectAddressMapValue> | null;
  onSave: (value: ProjectAddressMapValue) => Promise<void> | void;
}

const DEFAULT_RADIUS = 100;
const DEFAULT_CENTER: [number, number] = [18.0686, 59.3293]; // Stockholm

export default function ProjectAddressMapDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: ProjectAddressMapDialogProps) {
  const { token } = useMapboxToken();
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [mode, setMode] = useState<GeofenceMode>("circle");
  const [polygon, setPolygon] = useState<GeoJSON.Polygon | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>("streets");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);

  // ── reset state when opening ───────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setAddress(initial?.address ?? "");
    setRadius(initial?.radius_meters ?? DEFAULT_RADIUS);
    setMode((initial?.geofence_mode as GeofenceMode) ?? "circle");
    setPolygon((initial?.geofence_polygon as GeoJSON.Polygon | null) ?? null);
    if (
      typeof initial?.latitude === "number" &&
      typeof initial?.longitude === "number"
    ) {
      setCoords({ lat: initial.latitude, lng: initial.longitude });
    } else {
      setCoords(null);
    }
  }, [open, initial]);

  // ── geocoding (explicit search button only — no autocomplete noise) ────────
  const searchAddress = useCallback(async () => {
    const q = address.trim();
    if (!q || !token) return;
    setSearching(true);
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        q
      )}.json?access_token=${token}&country=se&limit=1&autocomplete=false&language=sv`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Geokodning misslyckades (${res.status})`);
      const json = await res.json();
      const f = json?.features?.[0];
      if (!f) {
        toast.error("Hittade ingen träff på adressen");
        return;
      }
      const [lng, lat] = f.center;
      setCoords({ lat, lng });
      const map = mapRef.current;
      if (map) map.flyTo({ center: [lng, lat], zoom: 16, essential: true });
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte söka adress");
    } finally {
      setSearching(false);
    }
  }, [address, token]);

  // ── render marker + circle when coords/mode/radius change ──────────────────
  const renderOverlays = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    // Marker
    if (coords) {
      if (!markerRef.current) {
        markerRef.current = new mapboxgl.Marker({ color: "#7c3aed", draggable: true })
          .setLngLat([coords.lng, coords.lat])
          .addTo(map);
        markerRef.current.on("dragend", () => {
          const ll = markerRef.current!.getLngLat();
          setCoords({ lat: ll.lat, lng: ll.lng });
        });
      } else {
        markerRef.current.setLngLat([coords.lng, coords.lat]);
      }
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    // Circle layer
    const circleSourceId = "geofence-circle";
    const circleLayerId = "geofence-circle-fill";
    const circleLineId = "geofence-circle-line";
    const existing = map.getSource(circleSourceId) as mapboxgl.GeoJSONSource | undefined;
    if (mode === "circle" && coords) {
      const poly = circleToPolygon([coords.lng, coords.lat], radius, 64);
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: poly }],
      };
      if (existing) {
        existing.setData(fc);
      } else {
        map.addSource(circleSourceId, { type: "geojson", data: fc });
        map.addLayer({
          id: circleLayerId,
          type: "fill",
          source: circleSourceId,
          paint: { "fill-color": "#7c3aed", "fill-opacity": 0.15 },
        });
        map.addLayer({
          id: circleLineId,
          type: "line",
          source: circleSourceId,
          paint: { "line-color": "#7c3aed", "line-width": 2 },
        });
      }
    } else if (existing) {
      if (map.getLayer(circleLineId)) map.removeLayer(circleLineId);
      if (map.getLayer(circleLayerId)) map.removeLayer(circleLayerId);
      map.removeSource(circleSourceId);
    }
  }, [coords, mode, radius]);

  useEffect(() => {
    renderOverlays();
  }, [renderOverlays]);

  // ── map setup ──────────────────────────────────────────────────────────────
  const handleMapReady = useCallback(
    (map: mapboxgl.Map) => {
      mapRef.current = map;

      // Click-to-place pin (circle mode)
      map.on("click", (e) => {
        if (modeRef.current !== "circle") return;
        setCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });

      // Polygon draw
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: true, trash: true },
        defaultMode: "simple_select",
      });
      drawRef.current = draw;
      map.addControl(draw, "top-left");

      const syncPolygon = () => {
        const fc = draw.getAll();
        const poly = fc.features.find((f) => f.geometry.type === "Polygon");
        if (poly) setPolygon(poly.geometry as GeoJSON.Polygon);
        else setPolygon(null);
      };
      map.on("draw.create", syncPolygon);
      map.on("draw.update", syncPolygon);
      map.on("draw.delete", syncPolygon);

      // Restore existing polygon if any
      if (polygon) {
        try {
          draw.add({ type: "Feature", properties: {}, geometry: polygon } as any);
        } catch {/* ignore */}
      }

      // Initial centring + overlays
      if (coords) {
        map.flyTo({ center: [coords.lng, coords.lat], zoom: 15, essential: true });
      }
      map.once("idle", () => renderOverlays());
    },
    // we deliberately bind `mode` lazily via ref below; keep deps light
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Latest mode in a ref so the click handler always sees current value
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const handleSave = async () => {
    if (!coords && mode === "circle") {
      toast.error("Välj en punkt på kartan eller sök en adress först");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        address: address.trim(),
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        radius_meters: radius,
        geofence_mode: mode,
        geofence_polygon: mode === "polygon" ? polygon : null,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Projektets adress & geofence</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Address search */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="proj-addr" className="sr-only">Adress</Label>
              <Input
                id="proj-addr"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ange adress (t.ex. Drottninggatan 1, Stockholm)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    searchAddress();
                  }
                }}
                disabled={saving}
              />
            </div>
            <Button onClick={searchAddress} disabled={searching || !address.trim() || saving}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-1">Sök</span>
            </Button>
          </div>

          {/* Mode + style toggles */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
              <Button
                size="sm"
                variant={mode === "circle" ? "default" : "ghost"}
                className="h-8 gap-1"
                onClick={() => setMode("circle")}
              >
                <CircleIcon className="h-3.5 w-3.5" /> Cirkel
              </Button>
              <Button
                size="sm"
                variant={mode === "polygon" ? "default" : "ghost"}
                className="h-8 gap-1"
                onClick={() => setMode("polygon")}
              >
                <Pencil className="h-3.5 w-3.5" /> Polygon
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              onClick={() => setMapStyle((s) => (s === "streets" ? "satellite" : "streets"))}
            >
              <Layers className="h-3.5 w-3.5" />
              {mapStyle === "streets" ? "Satellit" : "Karta"}
            </Button>
          </div>

          {/* Map */}
          <div className="relative h-[420px] rounded-md overflow-hidden border border-border/50 bg-muted/20">
            <MapboxMap
              key={mapStyle /* recreate on style change */}
              style={mapStyle}
              initialCenter={
                coords ? [coords.lng, coords.lat] : DEFAULT_CENTER
              }
              initialZoom={coords ? 15 : 11}
              onReady={handleMapReady}
              className="absolute inset-0"
            />
          </div>

          {/* Radius slider (only for circle mode) */}
          {mode === "circle" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <Label>Radie</Label>
                <span className="tabular-nums">{radius} m</span>
              </div>
              <Slider
                value={[radius]}
                min={25}
                max={500}
                step={5}
                onValueChange={(v) => setRadius(v[0])}
                disabled={saving}
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Tips: sök adress, klicka på kartan eller dra pinen. För polygon — använd ritverktyget uppe till vänster.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
