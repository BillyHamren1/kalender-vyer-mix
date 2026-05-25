import { useState } from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { MapPin, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import type { StaffGpsWeekDaySummary, StaffGpsWeekDayVisit } from '@/hooks/staff/useStaffGpsWeekSummaryBatch';
import type { StaffMember } from '@/services/staffService';
import StaffGpsDayInlineMap from './StaffGpsDayInlineMap';

interface Props {
  staff: StaffMember;
  weekDays: Date[];
  isAssigned: boolean;
  isPinged: boolean;
  /** Per-dag summary (dateKey 'yyyy-MM-dd' → summary). Saknad nyckel = ingen data. */
  summariesByDate: Record<string, StaffGpsWeekDaySummary>;
  isLoading: boolean;
  /** Legacy: tar oss till detalj-sidan. Inline-kartan föredras. */
  onShowMap: (staffId: string, date: Date) => void;
}

function fmtDur(min: number): string {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function typeLabel(t: string): { text: string; tone: string } {
  switch (t) {
    case 'location':       return { text: 'Plats',         tone: 'bg-[hsl(270_45%_94%)] text-[hsl(280_45%_30%)] border-[hsl(270_30%_80%)]' };
    case 'project':        return { text: 'Projekt',       tone: 'bg-[hsl(210_60%_94%)] text-[hsl(220_55%_30%)] border-[hsl(210_40%_78%)]' };
    case 'large_project':  return { text: 'Stort projekt', tone: 'bg-[hsl(40_85%_92%)]  text-[hsl(30_70%_30%)]  border-[hsl(40_55%_78%)]'  };
    default:               return { text: 'Okänt',         tone: 'bg-muted text-muted-foreground border-border' };
  }
}

const VisitsTable: React.FC<{ visits: StaffGpsWeekDayVisit[] }> = ({ visits }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-[11.5px]">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
          <th className="font-semibold px-2 py-1">Plats</th>
          <th className="font-semibold px-2 py-1">Typ</th>
          <th className="font-semibold px-2 py-1 tabular-nums">In</th>
          <th className="font-semibold px-2 py-1 tabular-nums">Ut</th>
          <th className="font-semibold px-2 py-1 tabular-nums text-right">Tid</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[hsl(270_18%_94%)]">
        {visits.map((v, i) => {
          const tl = typeLabel(v.type);
          return (
            <tr key={`${v.knownSiteId ?? 'unknown'}-${v.inIso}-${i}`} className="hover:bg-[hsl(270_45%_98%)]">
              <td className="px-2 py-1.5 text-foreground truncate max-w-[260px]" title={v.name}>{v.name}</td>
              <td className="px-2 py-1.5">
                <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold', tl.tone)}>
                  {tl.text}
                </span>
              </td>
              <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{formatStockholmHm(v.inIso)}</td>
              <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{formatStockholmHm(v.outIso)}</td>
              <td className="px-2 py-1.5 tabular-nums text-right font-semibold text-foreground">{fmtDur(v.durationMin)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export function StaffGpsWeekListRow({
  staff, weekDays, summariesByDate, isLoading,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mapKey, setMapKey] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-[hsl(270_20%_90%)] bg-white overflow-hidden shadow-sm">
      {/* Person-header */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-[hsl(270_35%_98%)] border-b border-[hsl(270_20%_92%)] hover:bg-[hsl(270_45%_96%)] transition text-left"
        aria-expanded={!collapsed}
      >
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-[hsl(280_45%_38%)] transition-transform',
            collapsed && '-rotate-90',
          )}
        />
        <span className="text-[13px] font-semibold text-[hsl(280_45%_22%)] truncate">{staff.name}</span>
      </button>

      {!collapsed && (
        <div className="divide-y divide-[hsl(270_18%_94%)]">
          {weekDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const summary = summariesByDate[key];
            const hasData = !!summary && summary.pingsCount > 0;
            const hasRange = hasData && !!summary!.firstIso && !!summary!.lastIso;
            const weekday = format(day, 'EEE', { locale: sv });
            const dayMonth = format(day, 'd/M', { locale: sv });
            const visits = summary?.visits ?? [];
            const isMapOpen = mapKey === key;

            return (
              <div key={key} className={cn(isMapOpen && 'bg-[hsl(270_45%_98%)]')}>
                {/* Dagshuvud */}
                <div className="grid grid-cols-[88px_minmax(120px,160px)_1fr_auto] items-start gap-3 px-3 py-2">
                  {/* Dag */}
                  <div className="flex flex-col leading-tight min-w-0 pt-0.5">
                    <span className={cn(
                      'text-[12.5px] font-semibold capitalize tracking-tight',
                      !hasData && 'text-muted-foreground/70',
                    )}>{weekday}</span>
                    <span className={cn(
                      'text-[10.5px] tabular-nums',
                      hasData ? 'text-muted-foreground' : 'text-muted-foreground/50',
                    )}>{dayMonth}</span>
                  </div>

                  {/* Tid-summa */}
                  <div className="flex flex-col leading-tight min-w-0 pt-0.5">
                    {hasRange ? (
                      <>
                        <span className="text-[12.5px] font-semibold tabular-nums text-foreground tracking-tight">
                          {fmtDur(summary!.durationMin)}
                        </span>
                        <span className="text-[10px] tabular-nums text-muted-foreground/70">
                          {formatStockholmHm(summary!.firstIso!)}
                          <span className="mx-0.5 text-muted-foreground/40">–</span>
                          {formatStockholmHm(summary!.lastIso!)}
                        </span>
                      </>
                    ) : (
                      <span className="text-[10.5px] text-muted-foreground/60">
                        {isLoading && !summary ? 'Laddar…' : hasData ? 'Endast hemma' : '—'}
                      </span>
                    )}
                  </div>

                  {/* Besöks-tabell direkt */}
                  <div className="min-w-0">
                    {visits.length > 0 ? (
                      <VisitsTable visits={visits} />
                    ) : (
                      <div className="text-[11px] text-muted-foreground/60 px-2 py-1.5">
                        {hasData ? 'Ingen känd plats matchad.' : isLoading ? 'Laddar…' : 'Ingen GPS-data.'}
                      </div>
                    )}
                  </div>

                  {/* Karta-knapp */}
                  <div className="pt-0.5">
                    <button
                      type="button"
                      onClick={() => setMapKey((cur) => (cur === key ? null : key))}
                      className={cn(
                        'shrink-0 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] font-semibold transition',
                        isMapOpen
                          ? 'border-[hsl(280_45%_38%)] bg-[hsl(280_45%_38%)] text-white hover:bg-[hsl(280_45%_32%)]'
                          : 'border-[hsl(280_45%_55%)] bg-white text-[hsl(280_45%_30%)] hover:bg-[hsl(270_45%_94%)]',
                        !hasData && 'opacity-50 pointer-events-none',
                      )}
                      aria-pressed={isMapOpen}
                    >
                      {isMapOpen ? <X className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                      {isMapOpen ? 'Stäng karta' : 'Visa karta'}
                    </button>
                  </div>
                </div>

                {/* Inline-karta */}
                {isMapOpen && (
                  <div className="px-3 pb-3">
                    <StaffGpsDayInlineMap staffId={staff.id} dateStr={key} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
