import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, MapPin } from 'lucide-react';
import { StaffLocation } from '@/services/planningDashboardService';

interface StaffMapViewProps {
  locations: StaffLocation[];
  isLoading: boolean;
}

const StaffMapView = ({ locations, isLoading }: StaffMapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  // Init map
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('mapbox-token');
        if (error || !data?.token || cancelled) return;

        mapboxgl.accessToken = data.token;
        if (!mapContainer.current || map.current) return;

        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/satellite-streets-v12',
          center: [15.5, 58.5],
          zoom: 5,
          attributionControl: false,
        });

        map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
        map.current.on('load', () => {
          if (!cancelled) setMapReady(true);
        });
      } catch {
        // silent
      }
    };

    init();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update markers
  useEffect(() => {
    if (!mapReady || !map.current) return;

    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const withCoords = locations.filter(l => l.latitude && l.longitude);
    if (withCoords.length === 0) return;

    withCoords.forEach((loc) => {
      const el = document.createElement('div');
      el.className = 'staff-marker';
      el.style.cssText = `
        width: 32px; height: 32px; border-radius: 50%;
        background: hsl(var(--primary));
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
      `;
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

      const popup = new mapboxgl.Popup({ offset: 20, closeButton: false }).setHTML(`
        <div style="padding:4px 0;">
          <div style="font-weight:700;font-size:13px;">${loc.name}</div>
          <div style="font-size:11px;color:#666;margin-top:2px;">${loc.teamName || ''}</div>
          ${loc.bookingClient ? `<div style="font-size:11px;color:#888;margin-top:2px;">${loc.bookingClient}</div>` : ''}
          ${loc.deliveryAddress ? `<div style="font-size:10px;color:#999;margin-top:2px;">${loc.deliveryAddress}</div>` : ''}
          <div style="font-size:10px;margin-top:4px;padding:2px 6px;border-radius:8px;display:inline-block;${
            loc.isWorking ? 'background:#dcfce7;color:#166534;' : 'background:#fef3c7;color:#92400e;'
          }">${loc.isWorking ? 'Arbetar' : 'Schemalagd'}</div>
        </div>
      `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([loc.longitude!, loc.latitude!])
        .setPopup(popup)
        .addTo(map.current!);

      markersRef.current.push(marker);
    });

    // Fit bounds
    if (withCoords.length === 1) {
      map.current.flyTo({ center: [withCoords[0].longitude!, withCoords[0].latitude!], zoom: 12 });
    } else {
      const bounds = new mapboxgl.LngLatBounds();
      withCoords.forEach(l => bounds.extend([l.longitude!, l.latitude!]));
      map.current.fitBounds(bounds, { padding: 60, maxZoom: 13 });
    }
  }, [mapReady, locations]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden border border-border">
      <div ref={mapContainer} className="w-full h-full" />
      {(isLoading || !mapReady) && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}
      {/* Stats overlay */}
      <div className="absolute top-3 left-3 bg-card/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-md border border-border">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            {locations.filter(l => l.latitude && l.longitude).length} på fältet
          </span>
        </div>
      </div>
    </div>
  );
};

export default StaffMapView;
