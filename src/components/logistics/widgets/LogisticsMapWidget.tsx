import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Maximize2, Loader2, Truck, Briefcase } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchConfirmedBookings } from '@/services/bookingService';
import { Booking } from '@/types/booking';
import { useTransportAssignments } from '@/hooks/useTransportAssignments';
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  isWithinInterval, parseISO
} from 'date-fns';
import { cn } from '@/lib/utils';

type MapFilter = 'all' | 'projects' | 'transports';
type TimeFilter = 'week' | 'month';

interface Props {
  onClick: () => void;
}

const LogisticsMapWidget: React.FC<Props> = ({ onClick }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const [mapFilter, setMapFilter] = useState<MapFilter>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('week');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const { assignments } = useTransportAssignments(weekStart, weekEnd);

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
        map.current.on('load', () => { if (!cancelled) setMapReady(true); });
      } catch { /* silent */ }
    };
    init();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  // Fetch bookings
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchConfirmedBookings();
        console.log('Map bookings loaded:', data.length, 'with coords:', data.filter(b => b.deliveryLatitude != null).length);
        setBookings(data.filter(b => b.deliveryLatitude != null && b.deliveryLongitude != null));
      } catch (err) { console.error('Map booking fetch error:', err); }
      finally { setIsLoading(false); }
    };
    load();
  }, []);

  // Update markers
  useEffect(() => {
    if (!map.current || !mapReady) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const range = timeFilter === 'week'
      ? { start: weekStart, end: weekEnd }
      : { start: startOfMonth(now), end: endOfMonth(now) };

    const bounds = new mapboxgl.LngLatBounds();
    let projectMarkerCount = 0;

    // Project bookings
    if (mapFilter === 'all' || mapFilter === 'projects') {
      bookings.forEach(b => {
        if (!b.deliveryLatitude || !b.deliveryLongitude) return;
        const dates = [b.rigDayDate, b.eventDate, b.rigDownDate].filter(Boolean);
        const inRange = dates.some(d => {
          try { return isWithinInterval(parseISO(d), range); } catch { return false; }
        });
        if (!inRange) return;
        projectMarkerCount++;

        const el = document.createElement('div');
        el.style.cssText = 'position:relative;width:22px;height:22px;border-radius:50%;background:hsl(184 60% 38%);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);cursor:pointer';

        // Pulse ring
        const ring = document.createElement('div');
        ring.style.cssText = 'position:absolute;inset:-6px;border-radius:50%;border:2px solid hsl(184 60% 38%);opacity:0.5;animation:ping 2s cubic-bezier(0,0,0.2,1) infinite';
        el.appendChild(ring);

        // Label
        const label = document.createElement('div');
        label.textContent = b.client;
        label.style.cssText = 'position:absolute;left:28px;top:50%;transform:translateY(-50%);white-space:nowrap;font-size:11px;font-weight:600;color:white;text-shadow:0 1px 4px rgba(0,0,0,0.8),0 0 2px rgba(0,0,0,0.6);pointer-events:none';
        el.appendChild(label);

        const popup = new mapboxgl.Popup({ offset: 14, closeButton: false, maxWidth: '220px' })
          .setHTML(`<div style="font-size:12px"><strong>${b.client}</strong><br/>${b.deliveryAddress || ''}</div>`);

        const marker = new mapboxgl.Marker(el)
          .setLngLat([b.deliveryLongitude, b.deliveryLatitude])
          .setPopup(popup)
          .addTo(map.current!);
        markersRef.current.push(marker);
        bounds.extend([b.deliveryLongitude, b.deliveryLatitude]);
      });
    }

    // Transport assignments
    if (mapFilter === 'all' || mapFilter === 'transports') {
      assignments.forEach(a => {
        const b = a.booking;
        if (!b) return;
        const lat = (b as any).delivery_latitude;
        const lng = (b as any).delivery_longitude;
        if (!lat || !lng) return;

        const el = document.createElement('div');
        el.style.cssText = 'position:relative;width:22px;height:22px;border-radius:4px;background:hsl(38 92% 50%);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);cursor:pointer';

        // Label
        const lbl = document.createElement('div');
        lbl.textContent = b.client || 'Transport';
        lbl.style.cssText = 'position:absolute;left:28px;top:50%;transform:translateY(-50%);white-space:nowrap;font-size:11px;font-weight:600;color:white;text-shadow:0 1px 4px rgba(0,0,0,0.8),0 0 2px rgba(0,0,0,0.6);pointer-events:none';
        el.appendChild(lbl);

        const popup = new mapboxgl.Popup({ offset: 14, closeButton: false, maxWidth: '220px' })
          .setHTML(`<div style="font-size:12px"><strong>🚚 ${b.client || 'Transport'}</strong><br/>${b.deliveryaddress || ''}</div>`);

        const marker = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map.current!);
        markersRef.current.push(marker);
        bounds.extend([lng, lat]);
      });
    }

    console.log('Map markers created:', { projectMarkerCount, transportMarkers: markersRef.current.length - projectMarkerCount, timeFilter, mapFilter, totalBookings: bookings.length });

    if (!bounds.isEmpty()) {
      map.current.fitBounds(bounds, { padding: 40, maxZoom: 12, duration: 600 });
    }
  }, [bookings, assignments, mapFilter, timeFilter, mapReady]);

  const projectCount = bookings.filter(b => {
    const range = timeFilter === 'week'
      ? { start: weekStart, end: weekEnd }
      : { start: startOfMonth(now), end: endOfMonth(now) };
    const dates = [b.rigDayDate, b.eventDate, b.rigDownDate].filter(Boolean);
    return dates.some(d => { try { return isWithinInterval(parseISO(d), range); } catch { return false; } });
  }).length;

  return (
    <Card
      className="border-border/40 shadow-2xl rounded-2xl overflow-hidden h-full"
    >
      <CardContent className="p-0 relative h-full flex flex-col">
        {/* Filter bar */}
        <div className="absolute top-3 left-3 z-20 flex gap-1.5">
          {([
            { key: 'all' as MapFilter, label: 'Alla', icon: MapPin },
            { key: 'projects' as MapFilter, label: 'Projekt', icon: Briefcase },
            { key: 'transports' as MapFilter, label: 'Transport', icon: Truck },
          ]).map(f => (
            <Button
              key={f.key}
              variant={mapFilter === f.key ? 'default' : 'secondary'}
              size="sm"
              className={cn("h-7 text-xs gap-1 rounded-lg shadow-md", mapFilter !== f.key && "bg-background text-foreground border border-border")}
              onClick={(e) => { e.stopPropagation(); setMapFilter(f.key); }}
            >
              <f.icon className="w-3 h-3" />
              {f.label}
            </Button>
          ))}
        </div>

        {/* Time filter */}
        <div className="absolute top-3 right-12 z-20 flex gap-1">
          {([
            { key: 'week' as TimeFilter, label: 'Vecka' },
            { key: 'month' as TimeFilter, label: 'Månad' },
          ]).map(f => (
            <Button
              key={f.key}
              variant={timeFilter === f.key ? 'default' : 'secondary'}
              size="sm"
              className={cn("h-7 text-xs rounded-lg shadow-md", timeFilter !== f.key && "bg-background text-foreground border border-border")}
              onClick={(e) => { e.stopPropagation(); setTimeFilter(f.key); }}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {/* Expand button */}
        <button
          onClick={onClick}
          className="absolute top-3 right-3 z-20 w-7 h-7 rounded-lg bg-card/90 backdrop-blur-sm shadow-md flex items-center justify-center hover:bg-card transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
        </button>

        {/* Map */}
        <div className="relative flex-1 min-h-[400px]">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/50">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          )}
          <div ref={mapContainer} className="w-full h-full" />
        </div>

        {/* Bottom label */}
        <div className="px-4 py-3 border-t border-border/40 flex items-center justify-between bg-card">
          <div className="flex items-center gap-2.5">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Jobbkarta</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />
              {projectCount} projekt
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'hsl(38 92% 50%)' }} />
              {assignments.length} transporter
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LogisticsMapWidget;
