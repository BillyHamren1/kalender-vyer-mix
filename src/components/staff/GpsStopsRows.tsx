import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { MapPin, ChevronDown, ChevronRight } from 'lucide-react';
import { useStaffPingsForDay } from '@/hooks/useStaffPingsForDay';
import { useReverseGeocode } from '@/hooks/useReverseGeocode';
import { clusterStayPoints } from '@/lib/staff/stayPoints';
import { AddressMapDialog } from './AddressMapDialog';

interface Props {
  staffId: string;
  date: string;
  /** Antal "tomma" leading celler innan adresskolumnen. Default 2. */
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

/**
 * Visar varje GPS-stopp för dagen som en egen rad. Låter handläggaren
 * själv bedöma när dagen "egentligen" tog slut, även om timern lever vidare.
 */
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
      {/* Toggle-rad */}
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

      {/* Detalj-rader (en per stopp) */}
      {expanded && stops.map((s, i) => {
        const addr = addrs[i] ?? `${s.centre.lat.toFixed(4)}, ${s.centre.lng.toFixed(4)}`;
        return (
          <tr
            key={`stop-${i}`}
            className="border-b border-border/20 bg-muted/5 text-xs hover:bg-muted/15"
          >
            {Array.from({ length: leadingCells }).map((_, idx) => (
              <td key={`pad-${idx}`} className="px-2 py-1" />
            ))}
            <td className="px-2 py-1 tabular-nums text-muted-foreground whitespace-nowrap">
              {fmt(s.start)}–{fmt(s.end)}
            </td>
            <td className="px-2 py-1 whitespace-nowrap" colSpan={contentCols - 3}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMapTarget({ address: addr, coords: s.centre });
                }}
                className="text-left text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors truncate"
                title={`Visa ${addr} på karta`}
              >
                <MapPin className="inline h-3 w-3 mr-1 text-muted-foreground" />
                {addr}
              </button>
            </td>
            <td className="px-2 py-1 tabular-nums text-foreground whitespace-nowrap text-right">
              {fmtDur(s.durationMin)}
            </td>
            <td className="px-2 py-1 tabular-nums text-muted-foreground whitespace-nowrap text-right">
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
