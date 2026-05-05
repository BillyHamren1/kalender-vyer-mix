import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { format, parseISO } from 'date-fns';
import { Activity, Clock, MapPin, ExternalLink, Wifi, WifiOff, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import MapboxMap from '@/components/maps/MapboxMap';
import type { OpsStaffStatus } from '@/services/mobileApiService';

interface Props {
  staff: OpsStaffStatus;
  onClose: () => void;
  onOpenTarget?: (type: string, id: string) => void;
}

const fmt = (iso?: string | null) => {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'HH:mm'); } catch { return '—'; }
};

const minsToHm = (m?: number | null) => {
  if (!m && m !== 0) return '';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
};

export default function StaffDetailMapDialog({ staff: s, onClose, onOpenTarget }: Props) {
  const loc = s.latest_known_location;
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const handleMapReady = (map: mapboxgl.Map) => {
    mapRef.current = map;
    if (loc) {
      const lngLat: [number, number] = [loc.longitude, loc.latitude];
      markerRef.current = new mapboxgl.Marker({ color: '#10b981' })
        .setLngLat(lngLat)
        .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(s.name))
        .addTo(map);
      map.flyTo({ center: lngLat, zoom: 14, duration: 600 });
    }
  };

  useEffect(() => () => { markerRef.current?.remove(); }, []);

  const gpsIcon = s.gps_status === 'live' || s.gps_status === 'recent'
    ? <Wifi className="w-4 h-4 text-emerald-600" />
    : <WifiOff className="w-4 h-4 text-amber-600" />;

  const mapsHref = loc
    ? `https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`
    : null;

  const firstTarget = s.planned_targets[0];

  return (
    <>
      <DialogHeader>
        <DialogTitle>{s.name || '—'}</DialogTitle>
        <DialogDescription>Personöversikt · plats just nu</DialogDescription>
      </DialogHeader>

      {loc ? (
        <div className="rounded-md overflow-hidden border h-56 -mx-1">
          <MapboxMap
            initialCenter={[loc.longitude, loc.latitude]}
            initialZoom={14}
            onReady={handleMapReady}
            className="w-full h-full"
          />
        </div>
      ) : (
        <div className="rounded-md border bg-muted/40 h-32 flex items-center justify-center text-sm text-muted-foreground">
          Ingen GPS-position tillgänglig
        </div>
      )}

      <div className="space-y-2 text-sm">
        {s.current_target_label && (
          <div className="flex items-start gap-2">
            <Navigation className="w-4 h-4 mt-0.5 text-primary" />
            <div className="min-w-0">
              <div className="font-medium truncate">{s.current_target_label}</div>
              <div className="text-xs text-muted-foreground">
                {s.current_status?.replace(/_/g, ' ') ?? '—'}
                {s.current_since && ` · sedan ${fmt(s.current_since)}`}
                {typeof s.elapsed_minutes === 'number' && ` · ${minsToHm(s.elapsed_minutes)}`}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4" />
          <span>
            {s.has_open_workday
              ? `Arbetsdag pågår${s.workday_started_at ? ` · start ${fmt(s.workday_started_at)}` : ''}`
              : 'Ingen aktiv arbetsdag'}
          </span>
        </div>

        {s.active_timer && (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>
              Aktiv timer ({s.active_timer.target_type}) sedan {fmt(s.active_timer.started_at)}
              {s.active_timer_label && ` · ${s.active_timer_label}`}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {gpsIcon}
          <span>
            GPS: {s.gps_status}
            {loc && ` · ${fmt(loc.updated_at)}`}
            {loc?.accuracy != null && ` · ±${Math.round(loc.accuracy)}m`}
          </span>
        </div>

        {s.planned_targets.length > 0 && (
          <div>
            <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Planerat</div>
            <ul className="space-y-1">
              {s.planned_targets.slice(0, 5).map((p, i) => (
                <li key={i} className="text-xs flex items-start gap-1">
                  <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {p.date} · {p.target_name ?? '—'}{p.phase ? ` (${p.phase})` : ''}
                    {p.planned_start && ` · ${p.planned_start.slice(0, 5)}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {s.anomaly_count > 0 && (
          <div className="text-destructive text-xs">⚠ {s.anomaly_count} avvikelser</div>
        )}
      </div>

      <DialogFooter className="gap-2 flex-wrap">
        {mapsHref && (
          <Button variant="secondary" asChild>
            <a href={mapsHref} target="_blank" rel="noreferrer">
              <ExternalLink className="w-4 h-4 mr-1" /> Öppna i karta
            </a>
          </Button>
        )}
        {firstTarget?.target_id && firstTarget.target_type === 'booking' && (
          <Button onClick={() => { onOpenTarget?.('booking', firstTarget.target_id!); onClose(); }}>
            Öppna jobb
          </Button>
        )}
        {firstTarget?.target_id && firstTarget.target_type === 'large_project' && (
          <Button onClick={() => { onOpenTarget?.('large_project', firstTarget.target_id!); onClose(); }}>
            Öppna projekt
          </Button>
        )}
        <Button variant="outline" onClick={onClose}>Stäng</Button>
      </DialogFooter>
    </>
  );
}
