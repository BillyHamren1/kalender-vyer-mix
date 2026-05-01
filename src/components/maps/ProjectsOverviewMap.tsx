import { useCallback, useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import MapboxMap from "./MapboxMap";

export interface ProjectMapMarker {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  /** Optional secondary line shown in the popup. */
  subtitle?: string;
  /** Optional click handler — if set, popup also gets an "Öppna" link. */
  onClick?: () => void;
  /** Marker colour. Defaults to project purple. */
  color?: string;
}

interface ProjectsOverviewMapProps {
  markers: ProjectMapMarker[];
  className?: string;
  /** Auto-fit map to markers on first load. Defaults to true. */
  fitBounds?: boolean;
}

export default function ProjectsOverviewMap({
  markers,
  className,
  fitBounds = true,
}: ProjectsOverviewMapProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerObjsRef = useRef<mapboxgl.Marker[]>([]);

  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing
    markerObjsRef.current.forEach((m) => m.remove());
    markerObjsRef.current = [];

    if (markers.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    markers.forEach((mk) => {
      if (
        typeof mk.latitude !== "number" ||
        typeof mk.longitude !== "number" ||
        Number.isNaN(mk.latitude) ||
        Number.isNaN(mk.longitude)
      )
        return;

      const popupHtml = `
        <div style="font-family: inherit; min-width: 160px">
          <div style="font-weight:600;font-size:13px;margin-bottom:2px">${escapeHtml(mk.label)}</div>
          ${mk.subtitle ? `<div style="font-size:11px;color:#6b7280">${escapeHtml(mk.subtitle)}</div>` : ""}
          ${mk.onClick ? `<button data-marker-action="open" style="margin-top:6px;font-size:11px;color:#7c3aed;cursor:pointer;background:none;border:none;padding:0">Öppna projekt →</button>` : ""}
        </div>
      `;
      const popup = new mapboxgl.Popup({ offset: 24, closeButton: false }).setHTML(popupHtml);
      if (mk.onClick) {
        popup.on("open", () => {
          const el = popup.getElement().querySelector('[data-marker-action="open"]');
          if (el) el.addEventListener("click", () => mk.onClick!());
        });
      }
      const marker = new mapboxgl.Marker({ color: mk.color ?? "#7c3aed" })
        .setLngLat([mk.longitude, mk.latitude])
        .setPopup(popup)
        .addTo(map);
      markerObjsRef.current.push(marker);
      bounds.extend([mk.longitude, mk.latitude]);
    });

    if (fitBounds && !bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 });
    }
  }, [markers, fitBounds]);

  useEffect(() => {
    renderMarkers();
  }, [renderMarkers]);

  return (
    <MapboxMap
      className={className}
      onReady={(map) => {
        mapRef.current = map;
        map.once("load", () => renderMarkers());
      }}
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
