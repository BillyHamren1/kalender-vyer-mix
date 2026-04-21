import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Clock, Car, Navigation, Briefcase, Activity } from 'lucide-react';
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
  ongoing?: boolean;
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

/**
 * Accepts both `HH:MM:SS` (Postgres `time`) and ISO timestamps
 * (`2026-04-21T06:58:00Z`) and returns `HH:MM` in local time.
 * Returns '-' for null/undefined/empty.
 */
function toHHMM(value: string | null | undefined): string {
  if (!value) return '-';
  if (value.includes('T')) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  }
  return value.length >= 5 ? value.slice(0, 5) : value;
}

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
      ongoing?: boolean;
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
        ongoing: w.ongoing,
      });
    }

    return items.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  }, [travelSegments, workEntries]);

  // Find GPS point closest in time. Accepts HH:MM(:SS) or ISO.
  const findGpsAt = useMemo(() => {
    return (value: string | null): GpsPoint | null => {
      if (!value || !date || gpsPoints.length === 0) return null;
      let target: number;
      if (value.includes('T')) {
        target = new Date(value).getTime();
      } else {
        const hhmm = value.length >= 5 ? value : `${value}:00`;
        target = new Date(`${date}T${hhmm.length === 5 ? hhmm + ':00' : hhmm}`).getTime();
      }
      if (Number.isNaN(target)) return null;
      let best: GpsPoint | null = null;
      let bestDelta = Infinity;
      for (const p of gpsPoints) {
        const t = new Date(p.recorded_at).getTime();
        const delta = Math.abs(t - target);
        if (delta < bestDelta) {
          bestDelta = delta;
          best = p;
        }
      }
      return bestDelta <= 15 * 60 * 1000 ? best : null;
    };
  }, [gpsPoints, date]);

  const passPins = useMemo(() => {
    const pins: Array<{
      label: string;
      kind: 'in' | 'out';
      lat: number;
      lng: number;
      time: string;
      passLabel: string;
    }> = [];

    for (const w of workEntries) {
      const inP = findGpsAt(w.start_time);
      const outP = w.end_time ? findGpsAt(w.end_time) : null;
      const passLabel = w.booking_client + (w.booking_number ? ` (#${w.booking_number})` : '');
      if (inP && w.start_time) {
        pins.push({ label: 'Inloggning', kind: 'in', lat: inP.lat, lng: inP.lng, time: toHHMM(w.start_time), passLabel });
      }
      if (outP && w.end_time) {
        pins.push({ label: 'Utloggning', kind: 'out', lat: outP.lat, lng: outP.lng, time: toHHMM(w.end_time), passLabel });
      }
    }

    for (const t of travelSegments) {
      const inP = t.from_latitude && t.from_longitude
        ? { lat: t.from_latitude, lng: t.from_longitude }
        : findGpsAt(t.start_time);
      const outP = t.to_latitude && t.to_longitude
        ? { lat: t.to_latitude, lng: t.to_longitude }
        : findGpsAt(t.end_time);
      const passLabel = `Resa ${[t.from_address, t.to_address].filter(Boolean).join(' → ') || ''}`.trim();
      if (inP && t.start_time) {
        pins.push({ label: 'Avresa', kind: 'in', lat: inP.lat, lng: inP.lng, time: toHHMM(t.start_time), passLabel });
      }
      if (outP && t.end_time) {
        pins.push({ label: 'Ankomst', kind: 'out', lat: outP.lat, lng: outP.lng, time: toHHMM(t.end_time), passLabel });
      }
    }

    return pins;
  }, [workEntries, travelSegments, findGpsAt]);

  useEffect(() => {
    if (!open || !mapContainer.current || !mapboxToken) return;
    if (passPins.length === 0) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (map.current) {
      map.current.remove();
      map.current = null;
    }

    const center: [number, number] = [passPins[0].lng, passPins[0].lat];

    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center,
      zoom: 11,
    });

    m.addControl(new mapboxgl.NavigationControl(), 'top-right');

    m.on('load', () => {
      const bounds = new mapboxgl.LngLatBounds();
      passPins.forEach(p => bounds.extend([p.lng, p.lat]));
      if (!bounds.isEmpty()) {
        m.fitBounds(bounds, { padding: 60, maxZoom: 15 });
      }

      passPins.forEach((p, i) => {
        const el = document.createElement('div');
        el.style.width = '24px';
        el.style.height = '24px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = p.kind === 'in' ? '#10b981' : '#ef4444';
        el.style.border = '3px solid white';
        el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.color = 'white';
        el.style.fontSize = '10px';
        el.style.fontWeight = 'bold';
        el.textContent = String(i + 1);

        const marker = new mapboxgl.Marker(el)
          .setLngLat([p.lng, p.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 22 }).setHTML(
              `<strong>${p.label} ${p.time}</strong><br/><span style="font-size:11px">${p.passLabel}</span><br/><span style="font-size:10px;color:#666">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span>`
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
  }, [open, mapboxToken, passPins]);

  if (!date) return null;

  const totalTravel = travelSegments.reduce((s, t) => s + t.hours_worked, 0);
  const totalWork = workEntries.reduce((s, w) => s + w.hours_worked, 0);
  const ongoingCount = workEntries.filter(w => w.ongoing).length;
  const firstStart = timeline[0]?.start_time;
  const lastEnd = [...timeline].reverse().find(t => t.end_time)?.end_time;

  const firstTravel = travelSegments.find(t => t.from_latitude && t.from_longitude);
  const firstGps = gpsPoints[0];
  const startAddress =
    firstTravel?.from_address ||
    (firstGps ? `📍 ${firstGps.lat.toFixed(5)}, ${firstGps.lng.toFixed(5)} (GPS ${firstGps.recorded_at.slice(11, 16)})` : 'Okänd startplats');
  const startLat = firstTravel?.from_latitude ?? firstGps?.lat ?? null;
  const startLng = firstTravel?.from_longitude ?? firstGps?.lng ?? null;

  const hasMapData = passPins.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Navigation className="h-5 w-5 text-primary" />
            <span>Dagöversikt — {format(new Date(date), 'EEEE d MMMM yyyy', { locale: sv })}</span>
            <span className="text-sm font-normal text-muted-foreground">· {staffName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={<Clock className="h-4 w-4" />} label="Första start" value={toHHMM(firstStart)} />
          <SummaryCard
            icon={<Clock className="h-4 w-4" />}
            label="Sista slut"
            value={ongoingCount > 0 ? 'Pågår' : toHHMM(lastEnd)}
          />
          <SummaryCard icon={<Briefcase className="h-4 w-4" />} label="Arbetstid" value={formatHoursMinutes(totalWork)} />
          <SummaryCard icon={<Car className="h-4 w-4" />} label="Restid" value={formatHoursMinutes(totalTravel)} />
        </div>

        {ongoingCount > 0 && (
          <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-md bg-orange-50 dark:bg-orange-950/20 border border-orange-200/60 text-orange-700 dark:text-orange-400">
            <Activity className="h-3.5 w-3.5 shrink-0" />
            <span>
              {ongoingCount} pågående {ongoingCount === 1 ? 'aktivitet' : 'aktiviteter'} — totaltid uppdateras live tills passet stängs.
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm bg-muted/50 p-3 rounded-lg">
          <MapPin className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium shrink-0">Startplats:</span>
          <span className="text-muted-foreground break-words flex-1 min-w-0">{startAddress}</span>
          {startLat !== null && startLng !== null && firstTravel?.from_latitude && (
            <span className="text-xs text-muted-foreground shrink-0">
              {startLat.toFixed(5)}, {startLng.toFixed(5)}
            </span>
          )}
        </div>

        {hasMapData ? (
          <div ref={mapContainer} className="w-full h-[420px] rounded-lg border" />
        ) : (
          <div className="w-full h-[200px] rounded-lg border flex items-center justify-center text-muted-foreground text-sm">
            Inga geopositioner rapporterade
          </div>
        )}

        {passPins.length > 0 && (
          <div className="text-xs text-muted-foreground -mt-1">
            🟢 In · 🔴 Ut · {passPins.length} positioner från {gpsPoints.length} GPS-pings
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Tidslinje</h4>
          <div className="space-y-1">
            {timeline.map((item, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-2.5 rounded-lg text-sm ${
                  item.type === 'travel'
                    ? 'bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/50'
                    : item.ongoing
                      ? 'bg-orange-50/70 dark:bg-orange-950/20 border border-orange-200/60'
                      : 'bg-background border'
                }`}
              >
                <div className="flex flex-col items-center shrink-0 w-14 text-xs text-muted-foreground">
                  <span>{toHHMM(item.start_time)}</span>
                  <span className="text-[10px]">–</span>
                  <span>
                    {item.ongoing
                      ? <span className="text-orange-600 font-medium">pågår</span>
                      : toHHMM(item.end_time)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {item.type === 'travel' ? (
                      <Car className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    ) : (
                      <Briefcase className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                    <span className="font-medium break-words">{item.label}</span>
                    {item.ongoing && (
                      <Badge variant="outline" className="text-[10px] gap-1 border-orange-300 text-orange-600">
                        <Activity className="h-2.5 w-2.5" /> Pågår
                      </Badge>
                    )}
                  </div>
                  {item.sublabel && (
                    <span className="text-xs text-muted-foreground break-words">{item.sublabel}</span>
                  )}
                  {item.type === 'work' && item.lat && item.lng && (
                    <span className="text-[10px] text-muted-foreground block">
                      📍 {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
                    </span>
                  )}
                  {item.type === 'travel' && item.fromLat && item.fromLng && (
                    <span className="text-[10px] text-muted-foreground block break-words">
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

        {passPins.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">In- och utloggningar</h4>
            <div className="grid grid-cols-1 gap-1 text-xs">
              {passPins.map((p, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded bg-muted/30">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5"
                    style={{ backgroundColor: p.kind === 'in' ? '#10b981' : '#ef4444' }}
                  >
                    {i + 1}
                  </div>
                  <span className="font-medium shrink-0">{p.label} {p.time}</span>
                  <span className="flex-1 text-muted-foreground break-words min-w-0">{p.passLabel}</span>
                  <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
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

