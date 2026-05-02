import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { MapPin, ChevronDown, ChevronRight, LogIn, LogOut } from 'lucide-react';
import { useStaffPingsForDay } from '@/hooks/useStaffPingsForDay';
import { useReverseGeocode } from '@/hooks/useReverseGeocode';
import { clusterStayPoints, type StayPoint } from '@/lib/staff/stayPoints';
import { AddressMapDialog } from './AddressMapDialog';

interface Props {
  staffId: string;
  date: string;
  leadingCells?: number;
  totalCols?: number;
}

const fmt = (iso: string) => {
  try { return format(new Date(iso), 'HH:mm'); } catch { return '—'; }
};

const fmtDur = (min: number) => {
  if (min < 1) return '<1m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

export const GpsStopsRows: React.FC<Props> = ({
  staffId, date, leadingCells = 1, totalCols = 8,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [mapTarget, setMapTarget] = useState<
    | null
    | { address: string; coords: { lat: number; lng: number } }
  >(null);

  const { data: pings = [], isLoading } = useStaffPingsForDay(staffId, date, true);

  const stops = useMemo(
    () => clusterStayPoints(pings, { radiusMeters: 120, minDurationMin: 5 }),
    [pings],
  );

  const addrs = useReverseGeocode(stops.map(s => s.centre));
  const contentCols = totalCols - leadingCells;

  if (isLoading || stops.length === 0) {
    return (
      <tr className="border-b border-border/40 bg-muted/5 text-xs">
        {Array.from({ length: leadingCells }).map((_, i) => (
          <td key={`pad-${i}`} className="px-2 py-1" />
        ))}
        <td colSpan={contentCols} className="px-2 py-1 text-muted-foreground italic">
          {isLoading ? 'Hämtar GPS-stopp…' : 'Inga GPS-stopp registrerade.'}
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="border-b border-border/30 bg-muted/10 text-xs">
        <td className="px-2 py-1" />
        <td colSpan={contentCols} className="px-2 py-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(s => !s); }}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <MapPin className="h-3 w-3" />
            <span className="font-medium">Faktiska besök (GPS-pingar)</span>
            <span className="tabular-nums text-muted-foreground/80">
              ({stops.length} adress{stops.length === 1 ? '' : 'er'} · {fmtDur(stops.reduce((sum, s) => sum + s.durationMin, 0))} totalt)
            </span>
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border bg-muted/30">
          <th className="px-2 py-1" />
          <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">Ankom</th>
          <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">Lämnade</th>
          <th className="text-left font-semibold px-2 py-1" colSpan={contentCols - 4}>Adress</th>
          <th className="text-right font-semibold px-2 py-1 whitespace-nowrap">På plats</th>
          <th className="text-right font-semibold px-2 py-1 whitespace-nowrap">GPS-pings</th>
        </tr>
      )}

      {expanded && stops.map((s, i) => {
        const addr = addrs[i] ?? `${s.centre.lat.toFixed(4)}, ${s.centre.lng.toFixed(4)}`;

        return (
          <tr
            key={`stop-${i}`}
            className="border-b border-border/20 text-xs bg-muted/5 hover:bg-muted/15"
          >
            {Array.from({ length: leadingCells }).map((_, idx) => (
              <td key={`pad-${idx}`} className="px-2 py-1" />
            ))}
            <td className="px-2 py-1 tabular-nums font-medium text-foreground whitespace-nowrap align-top">
              <span className="inline-flex items-center gap-1">
                <LogIn className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                {fmt(s.start)}
              </span>
            </td>
            <td className="px-2 py-1 tabular-nums font-medium text-foreground whitespace-nowrap align-top">
              <span className="inline-flex items-center gap-1">
                <LogOut className="h-3 w-3 text-rose-600 dark:text-rose-400" />
                {fmt(s.end)}
              </span>
            </td>
            <td className="px-2 py-1 align-top" colSpan={contentCols - 4}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMapTarget({ address: addr, coords: s.centre });
                }}
                className="text-left text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors truncate inline-flex items-center gap-1"
                title={`Visa ${addr} på karta`}
              >
                <MapPin className="h-3 w-3 text-muted-foreground" />
                {addr}
              </button>
            </td>
            <td className="px-2 py-1 tabular-nums font-semibold text-foreground whitespace-nowrap text-right align-top">
              {fmtDur(s.durationMin)}
            </td>
            <td className="px-2 py-1 tabular-nums text-muted-foreground whitespace-nowrap text-right align-top">
              {s.pingCount}
            </td>
          </tr>
        );
      })}

      {mapTarget && (
        <tr style={{ display: 'none' }}>
          <td>
            <AddressMapDialog
              open={!!mapTarget}
              onOpenChange={(o) => { if (!o) setMapTarget(null); }}
              address={mapTarget.address}
              coords={mapTarget.coords}
              staffId={staffId}
              date={date}
            />
          </td>
        </tr>
      )}
    </>
  );
};
