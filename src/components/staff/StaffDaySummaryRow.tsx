import React, { useMemo } from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle, Activity, MapPin, Coffee, Clock,
  CheckCircle2, WifiOff, ArrowRightFromLine,
} from 'lucide-react';
import { useStaffPingsForDay } from '@/hooks/useStaffPingsForDay';
import { useReverseGeocode } from '@/hooks/useReverseGeocode';
import {
  buildDayFacts,
  buildDayDiscrepancies,
  type DayDiscrepancy,
} from '@/lib/staff/dayFacts';
import { computeWorkPresence } from '@/lib/staff/workPresence';
import type { ProjectSession } from '@/lib/staff/dayJournal';

const fmt = (iso: string | null | undefined) => {
  if (!iso) return '—';
  try { return format(new Date(iso), 'HH:mm'); } catch { return '—'; }
};

const fmtDur = (min: number | null | undefined) => {
  if (min == null || min < 1) return '';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

const minutesBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

interface Props {
  staffId: string;
  staffName: string;
  date: string;
  /** All sessions for the day (the same list day-end already gets). */
  sessions: ProjectSession[];
  /** Latest GPS ping timestamp for this staff member. */
  latestPingAt: string | null;
  /** Number of leading <td> cells to leave empty. Default 1 (Namn-col). */
  leadingCells?: number;
  /** Total columns in the parent table. Default 6. */
  totalCols?: number;
}

interface AggregatedDiscrepancy extends DayDiscrepancy {
  sessionLabel?: string;
}

interface OpenTimerInfo {
  session: ProjectSession;
  startedAt: string;
  ranForMin: number;
  lastSeenAtBaseAt: string | null;
  lastSeenAtBaseAddress: string | null;
  leftBaseAt: string | null;
  /** Minutes the timer has been running after last presence at base. */
  overrunMin: number | null;
}

/**
 * One compact summary row per staff member. Surfaces (in order):
 *   1. Status of any OPEN timer (pågår sedan / senast på plats / lämnat ca / överhäng)
 *   2. Stale GPS warning (no pings recently)
 *   3. All deviations from the day (late arrival, lunch utan rast, rapport efter avgång)
 *   4. "Allt ser ok ut" — when nothing else to flag
 *
 * Replaces the noisy per-session red rows with one consolidated, scannable
 * card so the admin sees the day's reality at a glance instead of a wall
 * of red boxes.
 */
export const StaffDaySummaryRow: React.FC<Props> = ({
  staffId, date, sessions, latestPingAt,
  leadingCells = 1, totalCols = 6,
}) => {
  const { data: pings = [], isLoading } = useStaffPingsForDay(staffId, date, true);

  const { openTimers, discrepancies, awayCoords } = useMemo(() => {
    const reportSessions = sessions.filter(s => s.kind !== 'travel');
    const allDisc: AggregatedDiscrepancy[] = [];
    const opens: OpenTimerInfo[] = [];

    for (const s of reportSessions) {
      const facts = buildDayFacts({
        pings,
        reportedStart: s.start,
        reportedEnd: s.end,
        base: null,
        baseLabel: s.address ?? s.label ?? null,
      });
      const disc = buildDayDiscrepancies({
        facts,
        reportedStart: s.start,
        reportedEnd: s.end,
        baseLabel: s.address ?? s.label ?? null,
      });
      for (const d of disc) {
        allDisc.push({ ...d, sessionLabel: s.label });
      }

      if (s.isOpen) {
        const presence = computeWorkPresence(pings, s.start, null);
        const lastBaseAt = presence.leftAt;
        const ranForMin = minutesBetween(s.start, new Date().toISOString());

        // Has the person actually left base after lastBaseAt?
        let leftBaseAt: string | null = null;
        if (lastBaseAt && pings.length) {
          const lastBaseMs = new Date(lastBaseAt).getTime();
          const newer = pings.find(p => new Date(p.recorded_at).getTime() > lastBaseMs);
          if (newer) leftBaseAt = newer.recorded_at;
        }

        const overrunMin = lastBaseAt
          ? Math.max(0, minutesBetween(lastBaseAt, new Date().toISOString()))
          : null;

        opens.push({
          session: s,
          startedAt: s.start,
          ranForMin,
          lastSeenAtBaseAt: lastBaseAt,
          lastSeenAtBaseAddress: s.address ?? null,
          leftBaseAt,
          overrunMin,
        });
      }
    }

    // Dedup overlapping discrepancies (same label + same minute).
    const seen = new Set<string>();
    const uniqueDisc = allDisc.filter(d => {
      const key = `${d.label}|${d.at.slice(0, 16)}|${d.until?.slice(0, 16) ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      openTimers: opens,
      discrepancies: uniqueDisc,
      awayCoords: uniqueDisc.map(d => d.awayCoords ?? null),
    };
  }, [pings, sessions]);

  const places = useReverseGeocode(awayCoords);

  // GPS staleness — only meaningful while a timer is open.
  const STALE_MIN = 10;
  const pingAgeMin = latestPingAt
    ? Math.floor((Date.now() - new Date(latestPingAt).getTime()) / 60000)
    : null;
  const hasOpen = openTimers.length > 0;
  const isStale = hasOpen && (pingAgeMin == null || pingAgeMin > STALE_MIN);

  if (isLoading) return null;

  // Nothing to show? Render a slim "ok" line so the admin knows we DID check.
  const nothingToShow = !hasOpen && discrepancies.length === 0 && !isStale;

  const contentCols = totalCols - leadingCells;

  return (
    <tr className="bg-muted/20 border-b border-border/40">
      {Array.from({ length: leadingCells }).map((_, i) => (
        <td key={`pad-${i}`} className="py-2 px-2"></td>
      ))}
      <td colSpan={contentCols} className="py-2 px-2">
        <div className="flex flex-col gap-2">

          {/* ── 1. Open-timer status ─────────────────────────────── */}
          {openTimers.map((t, i) => {
            const overrunFlagged = t.overrunMin != null && t.overrunMin >= 30;
            const noPresence = !t.lastSeenAtBaseAt;
            return (
              <div
                key={`open-${i}`}
                className={`flex items-start gap-2 rounded-md border px-3 py-2 ${
                  overrunFlagged || noPresence
                    ? 'border-destructive/40 bg-destructive/5'
                    : 'border-amber-500/30 bg-amber-500/5'
                }`}
              >
                <Activity className={`h-4 w-4 mt-0.5 shrink-0 ${overrunFlagged || noPresence ? 'text-destructive' : 'text-amber-600'}`} />
                <div className="min-w-0 flex-1 text-xs">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={`font-semibold ${overrunFlagged || noPresence ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'}`}>
                      Pågående timer · {t.session.label}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      pågår sedan {fmt(t.startedAt)} ({fmtDur(t.ranForMin)})
                    </span>
                  </div>
                  <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-foreground/80">
                    <div>
                      <span className="text-muted-foreground">Senaste ping:</span>{' '}
                      <strong className="tabular-nums">{fmt(latestPingAt)}</strong>
                      {pingAgeMin != null && (
                        <span className="text-muted-foreground"> · {pingAgeMin}m sedan</span>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Senast på plats:</span>{' '}
                      <strong className="tabular-nums">
                        {t.lastSeenAtBaseAt ? fmt(t.lastSeenAtBaseAt) : '— ingen GPS-närvaro —'}
                      </strong>
                    </div>
                  </div>
                  {(overrunFlagged || (t.leftBaseAt && t.overrunMin && t.overrunMin >= 10)) && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-destructive">
                      <ArrowRightFromLine className="h-3 w-3" />
                      <span>
                        Lämnade platsen ca <strong className="tabular-nums">{fmt(t.leftBaseAt ?? t.lastSeenAtBaseAt)}</strong>
                        {t.overrunMin != null && (
                          <> · timer fortsätter sedan <strong>{fmtDur(t.overrunMin)}</strong></>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* ── 2. Stale GPS ─────────────────────────────────────── */}
          {isStale && !openTimers.some(t => !t.lastSeenAtBaseAt) && (
            <div className="flex items-center gap-2 text-[11px] text-destructive px-1">
              <WifiOff className="h-3.5 w-3.5" />
              <span>
                Tappad GPS-signal
                {pingAgeMin != null && <> · senaste ping för {pingAgeMin} min sedan</>}
              </span>
            </div>
          )}

          {/* ── 3. Discrepancies ─────────────────────────────────── */}
          {discrepancies.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                <AlertTriangle className="h-3 w-3 text-destructive" />
                Avvikelser ({discrepancies.length})
              </div>
              <ul className="flex flex-col gap-1">
                {discrepancies.map((d, i) => {
                  const Icon =
                    d.label.toLowerCase().includes('lunch') || d.label.toLowerCase().includes('rast')
                      ? Coffee
                      : d.label.toLowerCase().includes('borta') || d.label.toLowerCase().includes('lämnat')
                        ? Clock
                        : AlertTriangle;
                  const where = places[i];
                  const distance = d.awayDistanceMeters
                    ? d.awayDistanceMeters >= 1000
                      ? `${(d.awayDistanceMeters / 1000).toFixed(1)} km bort`
                      : `${d.awayDistanceMeters} m bort`
                    : null;
                  const timeLabel = d.until ? `${fmt(d.at)}–${fmt(d.until)}` : fmt(d.at);
                  return (
                    <li
                      key={`disc-${i}`}
                      className="flex items-start gap-2 text-xs px-2 py-1 rounded bg-background border border-border/60"
                    >
                      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-destructive" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="tabular-nums font-semibold text-foreground">{timeLabel}</span>
                          {d.durationMin != null && d.durationMin > 0 && (
                            <span className="tabular-nums text-muted-foreground">({fmtDur(d.durationMin)})</span>
                          )}
                          <span className="font-medium text-foreground">{d.label}</span>
                          {where && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <MapPin className="h-3 w-3" />{where}{distance && ` · ${distance}`}
                            </span>
                          )}
                        </div>
                        {d.detail && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">{d.detail}</div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* ── 4. All clear ─────────────────────────────────────── */}
          {nothingToShow && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              GPS bekräftar rapporterad tid · inga avvikelser
            </div>
          )}
        </div>
      </td>
    </tr>
  );
};
