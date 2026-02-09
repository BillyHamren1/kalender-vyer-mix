import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Maximize2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchConfirmedBookings } from '@/services/bookingService';
import { Booking } from '@/types/booking';
import { startOfWeek, endOfWeek, isWithinInterval, parseISO } from 'date-fns';

interface Props {
  onClick: () => void;
}

const LogisticsMapWidget: React.FC<Props> = ({ onClick }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

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
          interactive: false,
          attributionControl: false,
        });

        const bookings = await fetchConfirmedBookings();
        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

        const filtered = bookings.filter(b => {
          if (!b.deliveryLatitude || !b.deliveryLongitude) return false;
          const dates = [b.rigDayDate, b.eventDate, b.rigDownDate].filter(Boolean);
          return dates.some(d => {
            try { return isWithinInterval(parseISO(d), { start: weekStart, end: weekEnd }); }
            catch { return false; }
          });
        });

        if (!cancelled) {
          setCount(filtered.length);
          setIsLoading(false);
        }

        map.current.on('load', () => {
          if (cancelled || !map.current) return;
          const bounds = new mapboxgl.LngLatBounds();
          filtered.forEach(b => {
            if (!b.deliveryLatitude || !b.deliveryLongitude) return;
            const el = document.createElement('div');
            el.style.cssText = 'width:10px;height:10px;border-radius:50%;background:hsl(184 60% 38%);border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)';
            new mapboxgl.Marker(el).setLngLat([b.deliveryLongitude, b.deliveryLatitude]).addTo(map.current!);
            bounds.extend([b.deliveryLongitude, b.deliveryLatitude]);
          });
          if (!bounds.isEmpty()) {
            map.current.fitBounds(bounds, { padding: 30, maxZoom: 10, duration: 0 });
          }
        });
      } catch { setIsLoading(false); }
    };

    init();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  return (
    <Card 
      className="group cursor-pointer border-border/40 shadow-2xl rounded-2xl overflow-hidden hover:shadow-3xl transition-all duration-300 hover:scale-[1.02]"
      onClick={onClick}
    >
      <CardContent className="p-0 relative">
        {/* Mini map */}
        <div className="relative h-[180px]">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/50">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          )}
          <div ref={mapContainer} className="w-full h-full" />
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent pointer-events-none" />
        </div>

        {/* Label */}
        <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 flex items-end justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
              <MapPin className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Jobbkarta</p>
              <p className="text-[10px] text-muted-foreground">{count} jobb denna vecka</p>
            </div>
          </div>
          <Maximize2 className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </CardContent>
    </Card>
  );
};

export default LogisticsMapWidget;
