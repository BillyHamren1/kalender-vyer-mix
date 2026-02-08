import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Booking } from '@/types/booking';
import { fetchConfirmedBookings } from '@/services/bookingService';
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfYear, endOfYear,
  isWithinInterval, parseISO
} from 'date-fns';

type TimeFilter = 'today' | 'week' | 'month' | 'year';

const TIME_FILTER_LABELS: Record<TimeFilter, string> = {
  today: 'Idag',
  week: 'Vecka',
  month: 'Månad',
  year: 'År',
};

const getDateRange = (filter: TimeFilter): { start: Date; end: Date } => {
  const now = new Date();
  switch (filter) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'year':
      return { start: startOfYear(now), end: endOfYear(now) };
  }
};

const isBookingInRange = (booking: Booking, range: { start: Date; end: Date }): boolean => {
  const dates = [booking.rigDayDate, booking.eventDate, booking.rigDownDate].filter(Boolean);
  return dates.some(d => {
    try {
      const parsed = parseISO(d);
      return isWithinInterval(parsed, { start: range.start, end: range.end });
    } catch {
      return false;
    }
  });
};

const DashboardJobMap: React.FC = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('month');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  // Fetch mapbox token and init map
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
          style: 'mapbox://styles/mapbox/light-v11',
          center: [15.5, 58.5], // Sweden center
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

  // Fetch bookings
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchConfirmedBookings();
        const withCoords = data.filter(
          b => b.deliveryLatitude != null && b.deliveryLongitude != null
        );
        setBookings(withCoords);
      } catch {
        // silent
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // Filter bookings by time
  useEffect(() => {
    const range = getDateRange(timeFilter);
    setFilteredBookings(bookings.filter(b => isBookingInRange(b, range)));
  }, [bookings, timeFilter]);

  // Update markers
  useEffect(() => {
    if (!map.current || !mapReady) return;

    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (!filteredBookings.length) return;

    const bounds = new mapboxgl.LngLatBounds();

    filteredBookings.forEach(booking => {
      if (!booking.deliveryLatitude || !booking.deliveryLongitude) return;

      const el = document.createElement('div');
      el.style.width = '14px';
      el.style.height = '14px';
      el.style.borderRadius = '50%';
      el.style.background = 'hsl(184 60% 38%)';
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)';
      el.style.cursor = 'pointer';

      const popup = new mapboxgl.Popup({ offset: 12, closeButton: false, maxWidth: '200px' })
        .setHTML(`
          <div style="font-size:12px;line-height:1.4">
            <strong>${booking.client}</strong><br/>
            ${booking.deliveryAddress || ''}<br/>
            <span style="color:#666">${booking.eventDate || ''}</span>
          </div>
        `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([booking.deliveryLongitude, booking.deliveryLatitude])
        .setPopup(popup)
        .addTo(map.current!);

      markersRef.current.push(marker);
      bounds.extend([booking.deliveryLongitude, booking.deliveryLatitude]);
    });

    if (!bounds.isEmpty()) {
      map.current.fitBounds(bounds, { padding: 40, maxZoom: 12, duration: 600 });
    }
  }, [filteredBookings, mapReady]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-primary" />
            Jobbkarta
            <span className="text-muted-foreground font-normal ml-1">
              ({filteredBookings.length})
            </span>
          </CardTitle>
          <div className="flex gap-1">
            {(Object.keys(TIME_FILTER_LABELS) as TimeFilter[]).map(f => (
              <Button
                key={f}
                variant={timeFilter === f ? 'default' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-xs rounded-md"
                onClick={() => setTimeFilter(f)}
              >
                {TIME_FILTER_LABELS[f]}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative w-full h-[300px]">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/50">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          )}
          <div ref={mapContainer} className="w-full h-full" />
        </div>
      </CardContent>
    </Card>
  );
};

export default DashboardJobMap;
