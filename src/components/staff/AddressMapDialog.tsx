import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStaffPingsForDay } from '@/hooks/useStaffPingsForDay';

interface AddressMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: string;
  coords: { lat: number; lng: number } | null;
  /** Om satta visas hela personens GPS-spår fram till nu på kartan */
  staffId?: string;
  date?: string;
  /** Om satta visas endast pings inom detta tidsintervall (för t.ex. en resa) */
  segmentStartIso?: string;
  segmentEndIso?: string;
}

/**
 * Satellitkarta med pin på vald punkt + valfritt GPS-spår fram till nu för personen/dagen.
 * Faller tillbaka till "Öppna i Google Maps" om token saknas.
 */
export const AddressMapDialog: React.FC<AddressMapDialogProps> = ({
  open,
  onOpenChange,
  address,
  coords,
  staffId,
  date,
}) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState(false);

  const { data: pings = [] } = useStaffPingsForDay(
    staffId ?? '',
    date ?? '',
    !!(open && staffId && date),
  );

  // Sortera pings stigande och bygg track fram till nu
  const trackCoords = useMemo<[number, number][]>(() => {
    if (!pings.length) return [];
    return [...pings]
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
      .map((p) => [p.lng, p.lat] as [number, number]);
  }, [pings]);

  useEffect(() => {
    if (!open) return;
    if (token || tokenError) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('mapbox-token');
        if (error) throw error;
        if (!cancelled && data?.token) {
          mapboxgl.accessToken = data.token;
          setToken(data.token);
        } else if (!cancelled) {
          setTokenError(true);
        }
      } catch {
        if (!cancelled) setTokenError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, token, tokenError]);

  // Init karta
  useEffect(() => {
    if (!open || !token || !coords || !mapContainer.current) return;
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [coords.lng, coords.lat],
      zoom: 15,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Pin för vald adress
    new mapboxgl.Marker({ color: '#ef4444' })
      .setLngLat([coords.lng, coords.lat])
      .setPopup(new mapboxgl.Popup({ offset: 16 }).setText(address))
      .addTo(map);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [open, token, coords, address]);

  // Lägg på / uppdatera GPS-spår
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !token) return;
    if (trackCoords.length < 2) return;

    const apply = () => {
      const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: trackCoords },
      };
      const src = map.getSource('staff-track') as mapboxgl.GeoJSONSource | undefined;
      if (src) {
        src.setData(geojson);
      } else {
        map.addSource('staff-track', { type: 'geojson', data: geojson });
        map.addLayer({
          id: 'staff-track-line',
          type: 'line',
          source: 'staff-track',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#22d3ee',
            'line-width': 4,
            'line-opacity': 0.9,
          },
        });
        // Start- och slutmarkör för spåret
        const first = trackCoords[0];
        const last = trackCoords[trackCoords.length - 1];
        new mapboxgl.Marker({ color: '#10b981' })
          .setLngLat(first)
          .setPopup(new mapboxgl.Popup({ offset: 16 }).setText('Första GPS-pingen idag'))
          .addTo(map);
        new mapboxgl.Marker({ color: '#3b82f6' })
          .setLngLat(last)
          .setPopup(new mapboxgl.Popup({ offset: 16 }).setText('Senaste GPS-pingen'))
          .addTo(map);
      }

      // Anpassa view till spår + vald punkt
      const bounds = new mapboxgl.LngLatBounds();
      trackCoords.forEach((c) => bounds.extend(c));
      if (coords) bounds.extend([coords.lng, coords.lat]);
      map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 600 });
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [trackCoords, token, coords]);

  // Reset map när stängs
  useEffect(() => {
    if (!open && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  }, [open]);

  const gmapsUrl = coords
    ? `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            {address}
          </DialogTitle>
        </DialogHeader>

        {coords && !tokenError ? (
          <>
            <div ref={mapContainer} className="h-[500px] w-full rounded-lg overflow-hidden border" />
            {staffId && date && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Första ping
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-4 rounded-sm bg-cyan-400" /> GPS-spår fram till nu
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> Senaste ping
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Vald adress
                </span>
                <span className="ml-auto">{trackCoords.length} pings</span>
              </div>
            )}
          </>
        ) : (
          <div className="h-[200px] w-full rounded-lg border border-dashed flex items-center justify-center text-sm text-muted-foreground">
            {coords ? 'Karta kunde inte laddas' : 'Inga koordinater för denna punkt'}
          </div>
        )}

        <div className="flex justify-end">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href={gmapsUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Öppna i Google Maps
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
