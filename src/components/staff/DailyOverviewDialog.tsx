import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Clock, Car, Navigation, Briefcase } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { formatHoursMinutes } from '@/utils/formatHours';
import { supabase } from '@/integrations/supabase/client';
import { mobileApi } from '@/services/mobileApiService';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface GpsPoint {
  lat: number;
  lng: number;
  recorded_at: string;
}

interface TravelSegment {
  id: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  from_address: string | null;
  to_address: string | null;
  from_latitude: number | null;
  from_longitude: number | null;
  to_latitude: number | null;
  to_longitude: number | null;
  destination_booking_id: string | null;
}

interface WorkEntry {
  id: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  booking_client: string;
  booking_number: string | null;
  description: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
}

interface DailyOverviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string | null;
  staffId: string;
  staffName: string;
  travelSegments: TravelSegment[];
  workEntries: WorkEntry[];
}

const ROUTE_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export const DailyOverviewDialog: React.FC<DailyOverviewDialogProps> = ({
  open,
  onOpenChange,
  date,
  staffId,
  staffName,
  travelSegments,
  workEntries,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const [gpsPoints, setGpsPoints] = useState<GpsPoint[]>([]);

  // Fetch mapbox token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('mapbox-token');
        if (error) throw error;
        if (data?.token) {
          setMapboxToken(data.token);
          mapboxgl.accessToken = data.token;
        }
      } catch (e) {
        console.error('Failed to fetch mapbox token:', e);
      }
    };
    if (open && !mapboxToken) fetchToken();
  }, [open, mapboxToken]);

  // Fetch GPS trail (staff_location_history) for the day
  useEffect(() => {
    if (!open || !date || !staffId) return;
    let cancelled = false;
    mobileApi
      .getMovementForDay(staffId, date)
      .then((res) => {
        if (cancelled) return;
        setGpsPoints(
          (res.points || []).map((p) => ({ lat: p.lat, lng: p.lng, recorded_at: p.recorded_at }))
        );
      })
      .catch((e) => {
        console.error('Failed to fetch GPS trail:', e);
        if (!cancelled) setGpsPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, date, staffId]);

  // Sorted timeline
  const timeline = useMemo(() => {
    const items: Array<{
      type: 'travel' | 'work';
      start_time: string | null;
      end_time: string | null;
      hours: number;
      label: string;
      sublabel?: string;
      lat?: number | null;
      lng?: number | null;
      fromLat?: number | null;
      fromLng?: number | null;
      toLat?: number | null;
      toLng?: number | null;
    }> = [];

    for (const t of travelSegments) {
      items.push({
        type: 'travel',
        start_time: t.start_time,
        end_time: t.end_time,
        hours: t.hours_worked,
        label: [t.from_address, t.to_address].filter(Boolean).join(' → ') || 'Resa',
        fromLat: t.from_latitude,
        fromLng: t.from_longitude,
        toLat: t.to_latitude,
        toLng: t.to_longitude,
      });
    }

    for (const w of workEntries) {
      items.push({
        type: 'work',
        start_time: w.start_time,
        end_time: w.end_time,
        hours: w.hours_worked,
        label: w.booking_client,
        sublabel: w.booking_number ? `#${w.booking_number}` : w.description || undefined,
        lat: w.delivery_lat,
        lng: w.delivery_lng,
      });
    }

    return items.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  }, [travelSegments, workEntries]);

  // All geocoded points for the map
  const mapPoints = useMemo(() => {
    const points: Array<{ lat: number; lng: number; label: string; type: 'start' | 'end' | 'work'; color: string }> = [];
    let colorIdx = 0;

    for (const t of travelSegments) {
      const color = ROUTE_COLORS[colorIdx % ROUTE_COLORS.length];
      if (t.from_latitude && t.from_longitude) {
        points.push({ lat: t.from_latitude, lng: t.from_longitude, label: t.from_address || 'Start', type: 'start', color });
      }
      if (t.to_latitude && t.to_longitude) {
        points.push({ lat: t.to_latitude, lng: t.to_longitude, label: t.to_address || 'Mål', type: 'end', color });
      }
      colorIdx++;
    }

    for (const w of workEntries) {
      if (w.delivery_lat && w.delivery_lng) {
        points.push({ lat: w.delivery_lat, lng: w.delivery_lng, label: w.booking_client, type: 'work', color: '#6366f1' });
      }
    }

    return points;
  }, [travelSegments, workEntries]);

  // Initialize / update map
  useEffect(() => {
    if (!open || !mapContainer.current || !mapboxToken || mapPoints.length === 0) return;

    // Clean up previous
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (map.current) {
      map.current.remove();
      map.current = null;
    }

    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [mapPoints[0].lng, mapPoints[0].lat],
      zoom: 11,
    });

    m.addControl(new mapboxgl.NavigationControl(), 'top-right');

    m.on('load', () => {
      // Fit bounds
      const bounds = new mapboxgl.LngLatBounds();
      mapPoints.forEach(p => bounds.extend([p.lng, p.lat]));
      m.fitBounds(bounds, { padding: 60, maxZoom: 14 });

      // Add route lines for travel segments
      let segIdx = 0;
      for (const t of travelSegments) {
        if (t.from_latitude && t.from_longitude && t.to_latitude && t.to_longitude) {
          const color = ROUTE_COLORS[segIdx % ROUTE_COLORS.length];
          const sourceId = `route-${segIdx}`;
          m.addSource(sourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: [
                  [t.from_longitude, t.from_latitude],
                  [t.to_longitude, t.to_latitude],
                ],
              },
            },
          });
          m.addLayer({
            id: `route-line-${segIdx}`,
            type: 'line',
            source: sourceId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': color,
              'line-width': 3,
              'line-dasharray': [2, 2],
            },
          });
          segIdx++;
        }
      }

      // Add markers
      mapPoints.forEach((p, i) => {
        const el = document.createElement('div');
        el.style.width = '28px';
        el.style.height = '28px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = p.color;
        el.style.border = '3px solid white';
        el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.color = 'white';
        el.style.fontSize = '11px';
        el.style.fontWeight = 'bold';
        el.textContent = String(i + 1);

        const marker = new mapboxgl.Marker(el)
          .setLngLat([p.lng, p.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 25 }).setHTML(
              `<strong>${p.label}</strong><br/><span style="font-size:11px;color:#666">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span>`
            )
          )
          .addTo(m);
        markersRef.current.push(marker);
      });
    });

    map.current = m;

    return () => {
      markersRef.current.forEach(mk => mk.remove());
      markersRef.current = [];
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [open, mapboxToken, mapPoints, travelSegments]);

  if (!date) return null;

  const totalTravel = travelSegments.reduce((s, t) => s + t.hours_worked, 0);
  const totalWork = workEntries.reduce((s, w) => s + w.hours_worked, 0);
  const firstStart = timeline[0]?.start_time;
  const lastEnd = [...timeline].reverse().find(t => t.end_time)?.end_time;

  // First location
  const firstTravel = travelSegments.find(t => t.from_latitude && t.from_longitude);
  const startAddress = firstTravel?.from_address || 'Okänd startplats';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            Dagöversikt — {format(new Date(date), 'EEEE d MMMM yyyy', { locale: sv })}
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard icon={<Clock className="h-4 w-4" />} label="Första start" value={firstStart?.slice(0, 5) || '-'} />
          <SummaryCard icon={<Clock className="h-4 w-4" />} label="Sista slut" value={lastEnd?.slice(0, 5) || '-'} />
          <SummaryCard icon={<Briefcase className="h-4 w-4" />} label="Arbetstid" value={formatHoursMinutes(totalWork)} />
          <SummaryCard icon={<Car className="h-4 w-4" />} label="Restid" value={formatHoursMinutes(totalTravel)} />
        </div>

        {/* Start location */}
        <div className="flex items-center gap-2 text-sm bg-muted/50 p-3 rounded-lg">
          <MapPin className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium">Startplats:</span>
          <span className="text-muted-foreground">{startAddress}</span>
          {firstTravel?.from_latitude && (
            <span className="text-xs text-muted-foreground ml-auto">
              {firstTravel.from_latitude.toFixed(5)}, {firstTravel.from_longitude?.toFixed(5)}
            </span>
          )}
        </div>

        {/* Map */}
        {mapPoints.length > 0 ? (
          <div ref={mapContainer} className="w-full h-[300px] rounded-lg border" />
        ) : (
          <div className="w-full h-[200px] rounded-lg border flex items-center justify-center text-muted-foreground text-sm">
            Inga geopositioner rapporterade
          </div>
        )}

        {/* Timeline */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Tidslinje</h4>
          <div className="space-y-1">
            {timeline.map((item, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-2.5 rounded-lg text-sm ${
                  item.type === 'travel'
                    ? 'bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/50'
                    : 'bg-background border'
                }`}
              >
                <div className="flex flex-col items-center shrink-0 w-12 text-xs text-muted-foreground">
                  <span>{item.start_time?.slice(0, 5) || '-'}</span>
                  <span className="text-[10px]">–</span>
                  <span>{item.end_time?.slice(0, 5) || '-'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {item.type === 'travel' ? (
                      <Car className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    ) : (
                      <Briefcase className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                    <span className="font-medium truncate">{item.label}</span>
                  </div>
                  {item.sublabel && (
                    <span className="text-xs text-muted-foreground">{item.sublabel}</span>
                  )}
                  {/* Show coordinates for geocoded entries */}
                  {item.type === 'work' && item.lat && item.lng && (
                    <span className="text-[10px] text-muted-foreground block">
                      📍 {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
                    </span>
                  )}
                  {item.type === 'travel' && item.fromLat && item.fromLng && (
                    <span className="text-[10px] text-muted-foreground block">
                      📍 {item.fromLat.toFixed(5)}, {item.fromLng.toFixed(5)} → {item.toLat?.toFixed(5)}, {item.toLng?.toFixed(5)}
                    </span>
                  )}
                </div>
                <Badge variant="outline" className="shrink-0 text-xs">
                  {formatHoursMinutes(item.hours)}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* All geocodes summary */}
        {mapPoints.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Alla geopositioner</h4>
            <div className="grid grid-cols-1 gap-1 text-xs">
              {mapPoints.map((p, i) => (
                <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-muted/30">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: p.color }}
                  >
                    {i + 1}
                  </div>
                  <span className="truncate flex-1">{p.label}</span>
                  <span className="text-muted-foreground shrink-0">
                    {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const SummaryCard: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <Card>
    <CardContent className="p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
        {icon}
        {label}
      </div>
      <div className="font-semibold text-sm">{value}</div>
    </CardContent>
  </Card>
);
