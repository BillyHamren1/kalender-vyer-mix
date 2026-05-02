import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { MapPin, ChevronDown, ChevronRight, LogIn, LogOut } from 'lucide-react';
import { useStaffPingsForDay } from '@/hooks/useStaffPingsForDay';
import { useReverseGeocode } from '@/hooks/useReverseGeocode';
import { clusterStayPoints, type StayPoint } from '@/lib/staff/stayPoints';
import { AddressMapDialog } from './AddressMapDialog';

interface SessionWindow {
  label: string;
  startIso: string | null;
  endIso: string | null;
  isOpen: boolean;
}

interface Props {
  staffId: string;
  date: string;
  leadingCells?: number;
  totalCols?: number;
  /** Rapporterade timer-fönster — används för att markera IN/UT-stopp. */
  sessions?: SessionWindow[];
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

/** Returns the stop index closest to `iso` (within ±20 min), or -1. */
const findStopForTime = (stops: StayPoint[], iso: string | null): number => {
  if (!iso) return -1;
  const t = new Date(iso).getTime();
  let bestIdx = -1;
  let bestDelta = 20 * 60_000;
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const sStart = new Date(s.start).getTime();
    const sEnd = new Date(s.end).getTime();
    // Inside the stop window → perfect match (delta = 0)
    if (t >= sStart - 5 * 60_000 && t <= sEnd + 5 * 60_000) {
      return i;
    }
    const delta = Math.min(Math.abs(t - sStart), Math.abs(t - sEnd));
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIdx = i;
    }
  }
  return bestIdx;
};

interface StopMarker {
  kind: 'in' | 'out';
  label: string;
  time: string;
}

export const GpsStopsRows: React.FC<Props> = ({
  staffId, date, leadingCells = 1, totalCols = 8, sessions = [],
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

  // Map stop-index → markers (IN / UT) for each rapporterad session
  const markersByStop = useMemo(() => {
    const map = new Map<number, StopMarker[]>();
    for (const s of sessions) {
      if (s.startIso) {
        const idx = findStopForTime(stops, s.startIso);
        if (idx >= 0) {
          const arr = map.get(idx) || [];
          arr.push({ kind: 'in', label: s.label, time: fmt(s.startIso) });
          map.set(idx, arr);
        }
      }
      if (s.endIso && !s.isOpen) {
        const idx = findStopForTime(stops, s.endIso);
        if (idx >= 0) {
          const arr = map.get(idx) || [];
          arr.push({ kind: 'out', label: s.label, time: fmt(s.endIso) });
          map.set(idx, arr);
        }
      }
    }
    return map;
  }, [stops, sessions]);

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
            <span className="font-medium">GPS-stopp under dagen</span>
            <span className="tabular-nums text-muted-foreground/80">
              ({stops.length} st · {fmtDur(stops.reduce((sum, s) => sum + s.durationMin, 0))} totalt)
            </span>
          </button>
        </td>
      </tr>

      {expanded && stops.map((s, i) => {
        const addr = addrs[i] ?? `${s.centre.lat.toFixed(4)}, ${s.centre.lng.toFixed(4)}`;
        const marks = markersByStop.get(i) || [];
        const hasIn = marks.some(m => m.kind === 'in');
        const hasOut = marks.some(m => m.kind === 'out');
        const rowBg = hasIn || hasOut
          ? 'bg-primary/10 hover:bg-primary/15'
          : 'bg-muted/5 hover:bg-muted/15';

        return (
          <tr
            key={`stop-${i}`}
            className={`border-b border-border/20 text-xs ${rowBg}`}
          >
            {Array.from({ length: leadingCells }).map((_, idx) => (
              <td key={`pad-${idx}`} className="px-2 py-1" />
            ))}
            <td className="px-2 py-1 tabular-nums text-muted-foreground whitespace-nowrap align-top">
              {fmt(s.start)}–{fmt(s.end)}
            </td>
            <td className="px-2 py-1 align-top" colSpan={contentCols - 3}>
              <div className="flex flex-col gap-1">
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
                {marks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {marks.map((m, mi) => {
                      const Icon = m.kind === 'in' ? LogIn : LogOut;
                      const cls = m.kind === 'in'
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30';
                      const verb = m.kind === 'in' ? 'Timer startad' : 'Timer stoppad';
                      const tooltip = m.kind === 'in'
                        ? `Tidrapport för "${m.label}" startad kl ${m.time} (inte nödvändigtvis ankomsttid)`
                        : `Tidrapport för "${m.label}" stoppad kl ${m.time} (inte nödvändigtvis avgångstid — se GPS-stoppen för faktisk närvaro)`;
                      return (
                        <span
                          key={mi}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}
                          title={tooltip}
                        >
                          <Icon className="h-3 w-3" />
                          <span className="tabular-nums">{m.time}</span>
                          <span>· {verb} ({m.label})</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </td>
            <td className="px-2 py-1 tabular-nums text-foreground whitespace-nowrap text-right align-top">
              {fmtDur(s.durationMin)}
            </td>
            <td className="px-2 py-1 tabular-nums text-muted-foreground whitespace-nowrap text-right align-top">
              {s.pingCount} pings
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
