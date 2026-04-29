import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Coffee, Clock, MapPin } from 'lucide-react';
import { useStaffPingsForDay } from '@/hooks/useStaffPingsForDay';
import { buildDayDiscrepancies, buildDayFacts, type DayDiscrepancy } from '@/lib/staff/dayFacts';
import { useReverseGeocode } from '@/hooks/useReverseGeocode';

interface Props {
  staffId: string;
  date: string;
  reportedStart: string;
  reportedEnd: string | null;
  baseLabel?: string | null;
  /** Number of leading table cells to leave empty before the avvikelse content. Default 2 (Namn + first chevron col). */
  leadingCells?: number;
  /** Total number of columns in the parent table — for the colSpan of the content cell. Default 6. */
  totalCols?: number;
}

const fmt = (iso: string) => {
  try { return format(new Date(iso), 'HH:mm'); } catch { return '—'; }
};
const fmtDur = (min?: number) => {
  if (!min || min < 1) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

const iconFor = (f: DayDiscrepancy) => {
  if (f.label.toLowerCase().includes('lunch') || f.label.toLowerCase().includes('rast')) return Coffee;
  if (f.label.toLowerCase().includes('borta')) return Clock;
  return AlertTriangle;
};

/**
 * Renders one or more `<tr>` rows — one per discrepancy. Drop straight into a
 * <tbody>. Always visible (not behind expand). Reverse-geocodes "borta"
 * coordinates so the admin sees "vid Knivsta" instead of raw lat/lng.
 */
export const SessionDiscrepancyRows: React.FC<Props> = ({
  staffId, date, reportedStart, reportedEnd, baseLabel,
  leadingCells = 1, totalCols = 6,
}) => {
  const { data: pings = [], isLoading } = useStaffPingsForDay(staffId, date, true);

  const visible = useMemo(() => {
    if (!pings.length) return [];
    const facts = buildDayFacts({
      pings,
      reportedStart,
      reportedEnd,
      base: null,
      baseLabel: baseLabel ?? null,
    });
    return buildDayDiscrepancies({
      facts,
      reportedStart,
      reportedEnd,
      baseLabel: baseLabel ?? null,
    });
  }, [pings, reportedStart, reportedEnd, baseLabel]);

  // Reverse-geocode all "away" coordinates in parallel. Order matters — we
  // index back into `visible` with the same offsets.
  const coordsToGeocode = visible.map(f => f.awayCoords ?? null);
  const places = useReverseGeocode(coordsToGeocode);

  if (isLoading || visible.length === 0) return null;

  const contentCols = totalCols - leadingCells;

  return (
    <>
      {visible.map((f, i) => {
        const Icon = iconFor(f);
        const isPeriod = !!f.until;
        const timeLabel = isPeriod ? `${fmt(f.at)} – ${fmt(f.until!)}` : fmt(f.at);
        const where = places[i];
        const distance = f.awayDistanceMeters
          ? `${f.awayDistanceMeters >= 1000 ? `${(f.awayDistanceMeters / 1000).toFixed(1)} km` : `${f.awayDistanceMeters} m`} från arbetsplatsen`
          : null;
        const text = [f.detail, where ? `Var: ${where}` : null, distance].filter(Boolean).join(' · ');
        return (
          <tr
            key={`${reportedStart}-disc-${i}`}
            className="bg-destructive/5 border-b border-destructive/20"
          >
            {Array.from({ length: leadingCells }).map((_, idx) => (
              <td key={`pad-${idx}`} className="py-1.5 px-2"></td>
            ))}
            <td colSpan={contentCols} className="py-1.5 px-2">
              <div className="flex items-start gap-2 text-xs">
                <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-destructive" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="tabular-nums font-semibold text-destructive">
                      {timeLabel}
                    </span>
                    <span className="font-medium text-destructive">
                      {f.label}
                    </span>
                    {f.durationMin != null && (
                      <span className="tabular-nums text-destructive/80">
                        · {fmtDur(f.durationMin)}
                      </span>
                    )}
                    {where && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {where}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] mt-0.5 text-foreground/80">
                    {text}
                  </div>
                </div>
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
};
