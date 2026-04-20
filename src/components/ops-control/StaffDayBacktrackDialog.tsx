/**
 * StaffDayBacktrackDialog
 * ───────────────────────
 * Visar en staff:s hela dag som tidslinje + karta, baserat på
 * location_time_entries, travel_time_logs, workday_flags och eventuell
 * GPS-historik. Knapp "Backfilla GPS-historik (idag)" anropar engångsjobbet
 * `backfill-location-history` för att fylla på råa pings retroaktivt.
 */
import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useStaffDayTimeline } from '@/hooks/useStaffDayTimeline';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { MapPin, Route, Flag, Clock, Loader2, Download, Wifi } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  staffId: string | null;
  staffName: string;
  date: string; // yyyy-MM-dd
}

const fmtTime = (iso: string | null) => iso ? format(new Date(iso), 'HH:mm', { locale: sv }) : '—';

const StaffDayBacktrackDialog = ({ open, onOpenChange, staffId, staffName, date }: Props) => {
  const { data, isLoading, refetch } = useStaffDayTimeline(staffId, date);
  const [backfilling, setBackfilling] = useState(false);
  const queryClient = useQueryClient();

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Init map
  useEffect(() => {
    if (!open || !mapContainer.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const { data: tokenData } = await supabase.functions.invoke('mapbox-token');
      if (cancelled || !tokenData?.token || !mapContainer.current) return;
      mapboxgl.accessToken = tokenData.token;

      const m = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [18.0686, 59.3293],
        zoom: 9,
      });
      m.on('load', () => setMapReady(true));
      mapRef.current = m;
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [open]);

  // Render markers + path
  useEffect(() => {
    if (!mapReady || !mapRef.current || !data) return;
    const map = mapRef.current;

    // Clean previous layers
    ['day-gps-line', 'day-gps-points', 'day-segments'].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    });

    // Custom markers via DOM
    document.querySelectorAll('.day-marker').forEach(el => el.remove());

    const bounds = new mapboxgl.LngLatBounds();
    let added = false;

    // Location segments → green pins
    data.segments.forEach(seg => {
      if (seg.kind === 'location' && seg.lat != null && seg.lng != null) {
        const el = document.createElement('div');
        el.className = 'day-marker';
        el.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);';
        new mapboxgl.Marker(el)
          .setLngLat([seg.lng, seg.lat])
          .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(`<strong>${seg.location_name}</strong><br/>${fmtTime(seg.start)}–${fmtTime(seg.end)}`))
          .addTo(map);
        bounds.extend([seg.lng, seg.lat]);
        added = true;
      } else if (seg.kind === 'last_known') {
        const el = document.createElement('div');
        el.className = 'day-marker';
        el.style.cssText = 'width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 4px rgba(59,130,246,.25);';
        new mapboxgl.Marker(el)
          .setLngLat([seg.lng, seg.lat])
          .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(`<strong>Senast sedd</strong><br/>${fmtTime(seg.start)}`))
          .addTo(map);
        bounds.extend([seg.lng, seg.lat]);
        added = true;
      } else if (seg.kind === 'travel') {
        if (seg.from_lat && seg.from_lng) { bounds.extend([seg.from_lng, seg.from_lat]); added = true; }
        if (seg.to_lat && seg.to_lng) { bounds.extend([seg.to_lng, seg.to_lat]); added = true; }
      }
    });

    // GPS path
    if (data.gps.length > 1) {
      const coords = data.gps.map(p => [p.lng, p.lat]);
      map.addSource('day-gps-line', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
      });
      map.addLayer({
        id: 'day-gps-line',
        type: 'line',
        source: 'day-gps-line',
        paint: { 'line-color': '#a855f7', 'line-width': 3, 'line-opacity': 0.7 },
      });
      coords.forEach(c => bounds.extend(c as [number, number]));
      added = true;
    }

    if (added) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 400 });
    }
  }, [mapReady, data]);

  const handleBackfill = async () => {
    if (!staffId) return;
    setBackfilling(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('backfill-location-history', {
        body: { staff_id: staffId, date },
      });
      if (error) throw error;
      const inserted = res?.inserted ?? 0;
      const scanned = res?.scanned ?? 0;
      if (inserted > 0) {
        toast.success(`Backfillade ${inserted} GPS-punkter (skannade ${scanned} loggar).`);
      } else {
        toast.message('Inga nya GPS-punkter hittades i loggarna för denna dag.', {
          description: `Skannade ${scanned} loggrader. Kan bero på loggretention eller saknad payload.`,
        });
      }
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['ops-control'] });
    } catch (e: any) {
      toast.error(e.message || 'Backfill misslyckades');
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Backtracka dag — {staffName}</DialogTitle>
          <DialogDescription>
            {format(new Date(date + 'T12:00:00'), 'EEEE d MMMM yyyy', { locale: sv })} · Allt vi vet om dagen
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
          {/* Timeline */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Tidslinje</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBackfill}
                disabled={backfilling || !staffId}
              >
                {backfilling ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                Backfilla GPS
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {isLoading && (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Laddar dag...
                </div>
              )}

              {!isLoading && data && data.segments.length === 0 && (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  Inga händelser hittades för denna dag.
                </div>
              )}

              {data?.segments.map((seg, i) => {
                if (seg.kind === 'location') {
                  return (
                    <div key={`loc-${seg.id}`} className="flex gap-3 p-2.5 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                      <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{seg.location_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {fmtTime(seg.start)} – {fmtTime(seg.end)}
                          {!seg.end && <span className="ml-1 text-emerald-600 font-medium">(pågår)</span>}
                          <span className="ml-2 opacity-60">· {seg.source}</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                if (seg.kind === 'travel') {
                  return (
                    <div key={`tr-${seg.id}`} className="flex gap-3 p-2.5 rounded-md bg-blue-500/5 border border-blue-500/20">
                      <Route className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {seg.from_address || 'Start'} → {seg.to_address || 'Mål'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {fmtTime(seg.start)} – {fmtTime(seg.end)} · {seg.hours.toFixed(2)}h
                          {seg.classification && <span className="ml-2 opacity-60">· {seg.classification}</span>}
                        </div>
                      </div>
                    </div>
                  );
                }
                if (seg.kind === 'flag') {
                  return (
                    <div key={`fl-${seg.id}`} className={`flex gap-3 p-2.5 rounded-md border ${seg.resolved ? 'bg-muted/30 border-border' : 'bg-amber-500/5 border-amber-500/30'}`}>
                      <Flag className={`w-4 h-4 shrink-0 mt-0.5 ${seg.resolved ? 'text-muted-foreground' : 'text-amber-600'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{seg.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {fmtTime(seg.start)} · {seg.flag_type}
                          {seg.resolved && <span className="ml-2 opacity-60">· löst</span>}
                        </div>
                      </div>
                    </div>
                  );
                }
                if (seg.kind === 'last_known') {
                  return (
                    <div key={`lk-${i}`} className="flex gap-3 p-2.5 rounded-md bg-blue-500/10 border border-blue-500/30">
                      <Wifi className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">Senast sedd</div>
                        <div className="text-xs text-muted-foreground">
                          {fmtTime(seg.start)}
                          {seg.accuracy != null && <span className="ml-2 opacity-60">· ±{Math.round(seg.accuracy)}m</span>}
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })}

              {data && (
                <div className="text-[11px] text-muted-foreground pt-2 border-t mt-2 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  GPS-historik: {data.hasGpsHistory ? `${data.gps.length} pings` : 'Tom (kör backfill)'}
                </div>
              )}
            </div>
          </div>

          {/* Map */}
          <div className="relative rounded-md overflow-hidden border border-border min-h-[400px]">
            <div ref={mapContainer} className="absolute inset-0" />
            {!mapReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StaffDayBacktrackDialog;
