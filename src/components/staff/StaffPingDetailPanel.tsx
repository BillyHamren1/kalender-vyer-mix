import { useQuery } from '@tanstack/react-query';
import { mobileApi } from '@/services/mobileApiService';
import { Loader2, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { StaffMovementMap } from './StaffMovementMap';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useState } from 'react';

interface Props {
  staffId: string;
  staffName: string;
  /** ISO date YYYY-MM-DD for the day. */
  date: string;
  /** Optional time-window filter (ISO timestamps). */
  fromIso?: string | null;
  toIso?: string | null;
  /** Lazy: only fetched when the panel is expanded. */
}

const fmtTime = (iso: string) => {
  try { return format(new Date(iso), 'HH:mm'); } catch { return '—'; }
};

export const StaffPingDetailPanel = ({ staffId, staffName, date, fromIso, toIso }: Props) => {
  const [mapOpen, setMapOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['staff-pings-day', staffId, date],
    queryFn: () => mobileApi.getMovementForDay(staffId, date),
    staleTime: 30_000,
  });

  const points = (data?.points || []).filter(p => {
    if (!fromIso && !toIso) return true;
    const t = new Date(p.recorded_at).getTime();
    if (fromIso && t < new Date(fromIso).getTime()) return false;
    if (toIso && t > new Date(toIso).getTime()) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Hämtar pings…
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-2 text-xs text-destructive">
        Kunde inte hämta pings
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        Inga GPS-pings i detta tidsfönster.
      </div>
    );
  }

  return (
    <div className="px-3 py-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground tabular-nums">
          {points.length} pings · {fmtTime(points[0].recorded_at)} – {fmtTime(points[points.length - 1].recorded_at)}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={(e) => { e.stopPropagation(); setMapOpen(true); }}
        >
          <MapPin className="h-3 w-3" />
          Visa på karta
        </Button>
      </div>

      <ul className="border-l border-border pl-3 space-y-0.5 max-h-48 overflow-y-auto">
        {points.map((p, i) => (
          <li key={i} className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>{fmtTime(p.recorded_at)}</span>
            <span className="font-mono">
              {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
              {p.accuracy != null && <> · ±{Math.round(p.accuracy)}m</>}
            </span>
          </li>
        ))}
      </ul>

      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {staffName} · {date}
              {(fromIso || toIso) && (
                <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                  {fromIso ? fmtTime(fromIso) : '–'}
                  {' → '}
                  {toIso ? fmtTime(toIso) : 'pågår'}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <StaffMovementMap
            staffId={staffId}
            date={date}
            fromIso={fromIso ?? undefined}
            toIso={toIso ?? undefined}
            className="h-[480px]"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};
