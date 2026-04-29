import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ChevronDown, ChevronUp, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { DayTimelineEvent } from "@/hooks/admin/useDayTimeline";
import type { DayPing } from "@/hooks/admin/useDayPings";

export interface KnownPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m?: number;
}

interface Props {
  events: DayTimelineEvent[];
  pings: DayPing[];
  knownPlaces: KnownPlace[];
  selectedEventId: string | null;
  onEventSelect?: (eventId: string) => void;
  defaultExpanded?: boolean;
}

export function DayTimelineMap({
  events, pings, knownPlaces, selectedEventId, onEventSelect, defaultExpanded = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Array<{ id: string; marker: mapboxgl.Marker }>>([]);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [token, setToken] = useState<string>("");

  const pinnedEvents = useMemo(
    () => events.filter((e) => e.lat != null && e.lng != null),
    [events],
  );

  useEffect(() => {
    let cancelled = false;
    if (token) return;
    supabase.functions.invoke("mapbox-token").then(({ data }) => {
      if (!cancelled && data?.token) {
        mapboxgl.accessToken = data.token;
        setToken(data.token);
      }
    }).catch(() => { /* token fetch failed — silently keep map hidden */ });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!expanded || !token || !containerRef.current) return;
    if (mapRef.current) return;

    const center: [number, number] =
      pinnedEvents[0] ? [pinnedEvents[0].lng!, pinnedEvents[0].lat!] :
      pings[0] ? [pings[0].lng, pings[0].lat] :
      knownPlaces[0] ? [knownPlaces[0].lng, knownPlaces[0].lat] :
      [18.0686, 59.3293];

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center,
      zoom: 11,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [expanded, token, pinnedEvents, pings, knownPlaces]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !expanded) return;

    const draw = () => {
      markersRef.current.forEach((m) => m.marker.remove());
      markersRef.current = [];

      const bounds = new mapboxgl.LngLatBounds();

      const knownSourceId = "known-places";
      const knownLayerId = "known-places-circles";
      if (map.getLayer(knownLayerId)) map.removeLayer(knownLayerId);
      if (map.getSource(knownSourceId)) map.removeSource(knownSourceId);
      if (knownPlaces.length > 0) {
        map.addSource(knownSourceId, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: knownPlaces.map((p) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [p.lng, p.lat] },
              properties: { name: p.name, radius: p.radius_m ?? 100 },
            })),
          },
        });
        map.addLayer({
          id: knownLayerId,
          type: "circle",
          source: knownSourceId,
          paint: {
            "circle-radius": 20,
            "circle-color": "hsl(var(--primary))",
            "circle-opacity": 0.12,
            "circle-stroke-color": "hsl(var(--primary))",
            "circle-stroke-width": 1.5,
            "circle-stroke-opacity": 0.5,
          },
        });
        knownPlaces.forEach((p) => bounds.extend([p.lng, p.lat]));
      }

      const lineSourceId = "ping-line";
      const lineLayerId = "ping-line-layer";
      if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
      if (map.getSource(lineSourceId)) map.removeSource(lineSourceId);
      if (pings.length > 1) {
        map.addSource(lineSourceId, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: pings.map((p) => [p.lng, p.lat]),
            },
          },
        });
        map.addLayer({
          id: lineLayerId,
          type: "line",
          source: lineSourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "hsl(var(--muted-foreground))",
            "line-width": 2.5,
            "line-opacity": 0.55,
          },
        });
        pings.forEach((p) => bounds.extend([p.lng, p.lat]));
      }

      pinnedEvents.forEach((e, idx) => {
        const el = document.createElement("button");
        el.type = "button";
        el.dataset.eventId = e.id;
        el.style.width = "26px";
        el.style.height = "26px";
        el.style.borderRadius = "9999px";
        el.style.cursor = "pointer";
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.color = "hsl(var(--primary-foreground))";
        el.style.fontSize = "11px";
        el.style.fontWeight = "700";
        el.style.background = "hsl(var(--primary))";
        el.style.border = "2px solid hsl(var(--background))";
        el.style.boxShadow = "0 2px 6px hsl(var(--foreground) / 0.25)";
        el.textContent = String(idx + 1);
        el.addEventListener("click", () => onEventSelect?.(e.id));

        const marker = new mapboxgl.Marker(el)
          .setLngLat([e.lng!, e.lat!])
          .setPopup(
            new mapboxgl.Popup({ offset: 22 }).setHTML(
              `<strong>${idx + 1}. ${e.event_type}</strong><br/><span style="font-size:11px">${e.human_readable_text ?? ""}</span><br/><span style="font-size:10px;color:#666">${new Date(e.ts).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}</span>`,
            ),
          )
          .addTo(map);
        markersRef.current.push({ id: e.id, marker });
        bounds.extend([e.lng!, e.lat!]);
      });

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 });
      }
    };

    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
  }, [pinnedEvents, pings, knownPlaces, expanded, onEventSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedEventId) return;
    const target = pinnedEvents.find((e) => e.id === selectedEventId);
    if (!target) return;
    map.flyTo({ center: [target.lng!, target.lat!], zoom: 15, duration: 600 });
    markersRef.current.forEach((m) => {
      const el = m.marker.getElement();
      const isSelected = m.id === selectedEventId;
      el.style.transform = (el.style.transform.replace(/ scale\([^)]*\)/, "")) + (isSelected ? " scale(1.35)" : "");
      el.style.background = isSelected ? "hsl(var(--destructive))" : "hsl(var(--primary))";
      el.style.zIndex = isSelected ? "10" : "";
    });
  }, [selectedEventId, pinnedEvents]);

  return (
    <section className="space-y-2 rounded-lg border border-border/60 bg-card p-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Karta över händelser</h3>
          <span className="text-[10px] text-muted-foreground">
            {pinnedEvents.length} pinnade · {pings.length} pings · {knownPlaces.length} kända platser
          </span>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1"
          onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Dölj" : "Visa"}
        </Button>
      </header>

      {expanded && (
        <div ref={containerRef} className="w-full h-[400px] rounded-md border border-border/40 bg-muted/30" />
      )}
    </section>
  );
}

export default DayTimelineMap;
