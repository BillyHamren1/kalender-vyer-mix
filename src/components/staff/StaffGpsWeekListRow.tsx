import { useState } from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { MapPin, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import type { StaffGpsWeekDaySummary } from '@/hooks/staff/useStaffGpsWeekSummaryBatch';
import type { StaffMember } from '@/services/staffService';

interface Props {
  staff: StaffMember;
  weekDays: Date[];
  isAssigned: boolean;
  isPinged: boolean;
  /** Per-dag summary (dateKey 'yyyy-MM-dd' → summary). Saknad nyckel = ingen data. */
  summariesByDate: Record<string, StaffGpsWeekDaySummary>;
  isLoading: boolean;
  /** Öppnar karta inline på samma sida — anropas endast från "Visa karta"-knappen. */
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

export function StaffGpsWeekListRow({
  staff, weekDays, summariesByDate, isLoading, onShowMap,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-[hsl(270_20%_90%)] bg-white overflow-hidden shadow-sm">
      {/* Person-header — togglar hela personens vecka */}
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

      {/* Vertikala dagsrader: Mån–Sön */}
      {!collapsed && (
        <div className="divide-y divide-[hsl(270_18%_94%)]">
          {weekDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const summary = summariesByDate[key];
            const hasData = !!summary && summary.pingsCount > 0;
            const hasRange = hasData && !!summary!.firstIso && !!summary!.lastIso;
            const weekday = format(day, 'EEE', { locale: sv });
            const dayMonth = format(day, 'd/M', { locale: sv });
            const places = summary?.placeNames ?? [];
            const isOpen = expandedDay === key;

            return (
              <div key={key}>
                <button
                  type="button"
                  onClick={() => setExpandedDay((cur) => (cur === key ? null : key))}
                  className={cn(
                    'w-full grid grid-cols-[88px_minmax(96px,140px)_1fr] items-center gap-3 px-3 py-2 text-left transition',
                    'hover:bg-[hsl(270_35%_97%)]',
                    !hasData && 'opacity-80',
                    isOpen && 'bg-[hsl(270_45%_97%)]',
                  )}
                  aria-expanded={isOpen}
                >
                  {/* Dag-kolumn */}
                  <div className="flex flex-col leading-tight min-w-0">
                    <span
                      className={cn(
                        'text-[12.5px] font-semibold capitalize tracking-tight',
                        !hasData && 'text-muted-foreground/70',
                      )}
                    >
                      {weekday}
                    </span>
                    <span
                      className={cn(
                        'text-[10.5px] tabular-nums',
                        hasData ? 'text-muted-foreground' : 'text-muted-foreground/50',
                      )}
                    >
                      {dayMonth}
                    </span>
                  </div>

                  {/* Tid-kolumn */}
                  <div className="flex flex-col leading-tight min-w-0">
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

                  {/* Platser-kolumn (höger) */}
                  <div className="flex items-center gap-1 justify-end min-w-0">
                    <div className="flex flex-wrap gap-1 justify-end min-w-0">
                      {places.length > 0 ? (
                        places.slice(0, isOpen ? places.length : 4).map((name) => (
                          <span
                            key={name}
                            className="inline-flex items-center max-w-[220px] truncate rounded-full bg-[hsl(270_35%_96%)] border border-[hsl(270_20%_88%)] px-2 py-0.5 text-[10.5px] text-[hsl(280_45%_28%)]"
                            title={name}
                          >
                            {name}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10.5px] text-muted-foreground/50">
                          {hasData ? 'Okänd plats' : ''}
                        </span>
                      )}
                      {!isOpen && places.length > 4 && (
                        <span className="text-[10.5px] text-muted-foreground/60">
                          +{places.length - 4}
                        </span>
                      )}
                    </div>
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 ml-1 text-muted-foreground/60 transition-transform shrink-0',
                        isOpen && 'rotate-180',
                      )}
                    />
                  </div>
                </button>

                {/* Inline-detalj — visas bara när dagen är expanderad */}
                {isOpen && (
                  <div className="bg-[hsl(270_45%_98%)] border-t border-[hsl(270_20%_92%)] px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                          Platser
                        </div>
                        {places.length > 0 ? (
                          <ul className="flex flex-col gap-1">
                            {places.map((name) => (
                              <li
                                key={name}
                                className="text-[12px] text-[hsl(280_45%_22%)] flex items-center gap-1.5"
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-[hsl(280_45%_55%)] shrink-0" />
                                <span className="truncate">{name}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-[12px] text-muted-foreground">
                            {hasData ? 'Ingen känd plats matchad för dagen.' : 'Ingen GPS-data registrerad.'}
                          </div>
                        )}
                        {hasRange && (
                          <div className="text-[11px] text-muted-foreground mt-2 tabular-nums">
                            Total tid: <span className="font-semibold text-foreground">{fmtDur(summary!.durationMin)}</span>
                            <span className="mx-1.5 text-muted-foreground/40">·</span>
                            {formatStockholmHm(summary!.firstIso!)} – {formatStockholmHm(summary!.lastIso!)}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowMap(staff.id, day);
                        }}
                        className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-[hsl(280_45%_55%)] bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-[hsl(280_45%_30%)] hover:bg-[hsl(270_45%_94%)] transition"
                      >
                        <MapPin className="h-3.5 w-3.5" /> Visa karta
                      </button>
                    </div>
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
