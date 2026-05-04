import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMapboxToken } from "@/hooks/useMapboxToken";

export type MapStyle = "streets" | "satellite";

const STYLE_URL: Record<MapStyle, string> = {
  streets: "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
};

interface MapboxMapProps {
  /** Initial centre [lng, lat]. Defaults to Stockholm. */
  initialCenter?: [number, number];
  initialZoom?: number;
  style?: MapStyle;
  className?: string;
  /** Called once with the live map instance when ready. */
  onReady?: (map: mapboxgl.Map) => void;
  /** Optional cleanup; runs before the map is removed. */
  onDestroy?: (map: mapboxgl.Map) => void;
  /** Children rendered as overlays inside the map container (e.g. controls). */
  children?: React.ReactNode;
}

/**
 * Robust Mapbox container:
 * - shares a single token via useMapboxToken
 * - re-runs map.resize() when the container or window changes size (fixes the
 *   classic "grey map" issue when mounted inside dialogs / hidden tabs)
 * - exposes a retry button on init failure
 */
export default function MapboxMap({
  initialCenter = [18.0686, 59.3293],
  initialZoom = 11,
  style = "streets",
  className,
  onReady,
  onDestroy,
  children,
}: MapboxMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const { token, loading, error, retry } = useMapboxToken();

  useEffect(() => {
    if (!token || !containerRef.current) return;
    setInitError(null);

    mapboxgl.accessToken = token;

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: STYLE_URL[style],
        center: initialCenter,
        zoom: initialZoom,
        attributionControl: true,
      });
    } catch (e: any) {
      setInitError(e?.message || "Kunde inte initiera kartan");
      return;
    }

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), "top-right");

    const onLoad = () => {
      // Force a resize after first paint — solves the grey-map bug
      requestAnimationFrame(() => map.resize());
      onReady?.(map);
    };
    map.on("load", onLoad);
    map.on("error", (ev) => {
      // Mapbox occasionally fires recoverable errors (tile loads, etc.)
      // Only surface the first hard init failure.
      if (!map.loaded()) {
        setInitError(ev?.error?.message || "Kartfel");
      }
    });

    // Resize observer keeps the canvas in sync with its parent
    const ro = new ResizeObserver(() => {
      try {
        map.resize();
      } catch {/* map removed */}
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      try {
        onDestroy?.(map);
      } catch {/* ignore */}
      try {
        map.remove();
      } catch {/* already removed */}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, style, tick]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-muted/30 ${className ?? ""}`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || initError) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 bg-muted/30 p-6 text-center ${className ?? ""}`}>
        <p className="text-sm text-destructive">{error || initError}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setInitError(null);
            retry();
            setTick((t) => t + 1);
          }}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Försök igen
        </Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative h-full w-full ${className ?? ""}`}>
      {children}
    </div>
  );
}
