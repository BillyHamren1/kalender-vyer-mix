import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { mobileApi } from '@/services/mobileApiService';
import { Loader2, MapPin } from 'lucide-react';

interface MovementPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  recorded_at: string;
}

interface StaffMovementMapProps {
  staffId: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  /** Optional time-window filter (ISO timestamps). */
  fromIso?: string | null;
  toIso?: string | null;
  className?: string;
}

/**
 * Admin map showing a single staff member's GPS trail for a specific day.
 * Reads from staff_location_history via the mobile-app-api.
 *
 * Retention: history is removed ~7 days after the related time report is
 * approved, so very old reports may show "no data".
 */
export const StaffMovementMap = ({ staffId, date, fromIso, toIso, className }: StaffMovementMapProps) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [allPoints, setAllPoints] = useState<MovementPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load points
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    mobileApi
      .getMovementForDay(staffId, date)
      .then((res) => {
        if (cancelled) return;
        setPoints(res.points || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Kunde inte ladda rörelsehistorik');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [staffId, date]);

  // Init map + draw polyline
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!mapContainer.current || points.length === 0) return;

      try {
        const { data } = await supabase.functions.invoke('mapbox-token');
        if (cancelled || !data?.token) return;
        mapboxgl.accessToken = data.token;

        if (map.current) {
          map.current.remove();
          map.current = null;
        }

        const coords: [number, number][] = points.map((p) => [p.lng, p.lat]);
        const center = coords[Math.floor(coords.length / 2)];

        map.current = new mapboxgl.Map({
          container: mapContainer.current!,
          style: 'mapbox://styles/mapbox/streets-v12',
          center,
          zoom: 13,
          attributionControl: false,
        });
        map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

        map.current.on('load', () => {
          if (!map.current || cancelled) return;

          map.current.addSource('trail', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: coords },
            },
          });
          map.current.addLayer({
            id: 'trail-line',
            type: 'line',
            source: 'trail',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': 'hsl(217, 91%, 60%)',
              'line-width': 4,
              'line-opacity': 0.8,
            },
          });

          // Start marker (green)
          new mapboxgl.Marker({ color: 'hsl(142, 71%, 45%)' })
            .setLngLat(coords[0])
            .setPopup(
              new mapboxgl.Popup({ offset: 12 }).setHTML(
                `<strong>Start</strong><br/>${new Date(points[0].recorded_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`
              )
            )
            .addTo(map.current);

          // End marker (red)
          const last = points[points.length - 1];
          new mapboxgl.Marker({ color: 'hsl(0, 84%, 60%)' })
            .setLngLat(coords[coords.length - 1])
            .setPopup(
              new mapboxgl.Popup({ offset: 12 }).setHTML(
                `<strong>Senaste position</strong><br/>${new Date(last.recorded_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`
              )
            )
            .addTo(map.current);

          // Fit bounds
          const bounds = coords.reduce(
            (b, c) => b.extend(c as [number, number]),
            new mapboxgl.LngLatBounds(coords[0], coords[0])
          );
          map.current.fitBounds(bounds, { padding: 60, maxZoom: 16 });
        });
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Karta kunde inte initieras');
      }
    };

    init();

    return () => {
      cancelled = true;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [points]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-muted rounded-lg ${className || 'h-[400px]'}`}>
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center bg-muted rounded-lg p-6 ${className || 'h-[400px]'}`}>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center bg-muted rounded-lg p-6 gap-2 ${className || 'h-[400px]'}`}>
        <MapPin className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          Ingen rörelsehistorik för denna dag.
          <br />
          <span className="text-xs">(Kan ha rensats efter att tidrapporten godkänts)</span>
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={mapContainer} className={`rounded-lg overflow-hidden ${className || 'h-[400px]'}`} />
      <div className="absolute top-2 left-2 bg-background/95 backdrop-blur px-3 py-1.5 rounded-md text-xs font-medium shadow-md">
        {points.length} positioner • {new Date(points[0].recorded_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
        {' – '}
        {new Date(points[points.length - 1].recorded_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
};
