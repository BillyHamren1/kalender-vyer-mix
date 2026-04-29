import React, { useMemo } from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle, Activity, MapPin, Clock,
  CheckCircle2, WifiOff, ArrowRightFromLine, Loader2,
} from 'lucide-react';
import { useStaffDayReality, type RealityFlag, type SessionReality } from '@/hooks/useStaffDayReality';
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

const fmtDist = (m: number | null | undefined) => {
  if (m == null) return null;
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${m} m`;
};

interface Props {
  staffId: string;
  staffName: string;
  date: string;
  /** Kept for API compatibility; not used (server computes everything). */
  sessions?: ProjectSession[];
  /** Kept for API compatibility; not used (server computes everything). */
  latestPingAt?: string | null;
  /** Number of leading <td> cells to leave empty. Default 1 (Namn-col). */
  leadingCells?: number;
  /** Total columns in the parent table. Default 6. */
  totalCols?: number;
}

const SEVERITY_BG: Record<RealityFlag['severity'], string> = {
  info: 'border-border/60 bg-muted/30',
  warning: 'border-amber-500/30 bg-amber-500/5',
  critical: 'border-destructive/40 bg-destructive/5',
};
const SEVERITY_TEXT: Record<RealityFlag['severity'], string> = {
  info: 'text-muted-foreground',
  warning: 'text-amber-700 dark:text-amber-400',
  critical: 'text-destructive',
};

const FLAG_LABELS: Record<RealityFlag['type'], string> = {
  missing_gps: 'GPS saknas',
  timer_started_offsite: 'Timer startad utanför plats',
  never_at_reported_site: 'Aldrig på rapporterad plats',
  left_site_timer_still_open: 'Lämnat plats — timer öppen',
  report_overrun_after_departure: 'Rapport efter avgång',
  stale_phone: 'Telefon utan kontakt',
  wrong_reported_site: 'Fel rapporterad plats',
  gps_gap: 'GPS-glapp',
};

/**
 * Server-driven day reality summary for one staff member on one date.
 *
 * Surfaces, in order:
 *   1. Open-timer status (start, last seen at site, departure, overrun)
 *   2. Day-level flags (missing_gps, stale_phone)
 *   3. Session flags (timer_started_offsite, gps_gap, wrong_reported_site …)
 *   4. "Allt ser ok ut" — when nothing else to flag
 */
export const StaffDaySummaryRow: React.FC<Props> = ({
  staffId, date,
  leadingCells = 1, totalCols = 6,
}) => {
  const { data: reality, isLoading } = useStaffDayReality(staffId, date);

  const { openSessions, closedFlagged, dayFlags, latestPingAt } = useMemo(() => {
    if (!reality) return {
      openSessions: [] as SessionReality[],
      closedFlagged: [] as SessionReality[],
      dayFlags: [] as RealityFlag[],
      latestPingAt: null as string | null,
    };
    return {
      openSessions: reality.sessions.filter(s => s.is_open),
      closedFlagged: reality.sessions.filter(s => !s.is_open && s.flags.length > 0),
      dayFlags: reality.flags || [],
      latestPingAt: reality.last_ping?.recorded_at ?? null,
    };
  }, [reality]);

  const contentCols = totalCols - leadingCells;

  if (isLoading) {
    return (
      <tr className="bg-muted/20 border-b border-border/40">
        {Array.from({ length: leadingCells }).map((_, i) => (
          <td key={`pad-${i}`} className="py-2 px-2"></td>
        ))}
        <td colSpan={contentCols} className="py-2 px-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Granskar GPS mot rapporterad tid…
          </div>
        </td>
      </tr>
    );
  }

  if (!reality) return null;

  const pingAgeMin = latestPingAt
    ? Math.floor((Date.now() - new Date(latestPingAt).getTime()) / 60000)
    : null;

  const nothingToShow =
    openSessions.length === 0 &&
    closedFlagged.length === 0 &&
    dayFlags.length === 0;

  return (
    <tr className="bg-muted/20 border-b border-border/40">
      {Array.from({ length: leadingCells }).map((_, i) => (
        <td key={`pad-${i}`} className="py-2 px-2"></td>
      ))}
      <td colSpan={contentCols} className="py-2 px-2">
        <div className="flex flex-col gap-2">

          {/* ── 1. Open timers (rich status) ─────────────────────── */}
          {openSessions.map((s) => {
            const overrun = s.flags.find(f => f.type === 'left_site_timer_still_open');
            const offsite = s.flags.find(f => f.type === 'timer_started_offsite');
            const never = s.flags.find(f => f.type === 'never_at_reported_site');
            const headerCritical = !!(overrun || never);
            const sev: RealityFlag['severity'] = headerCritical ? 'critical' : 'warning';
            return (
              <div
                key={`open-${s.session_id}`}
                className={`flex items-start gap-2 rounded-md border px-3 py-2 ${SEVERITY_BG[sev]}`}
              >
                <Activity className={`h-4 w-4 mt-0.5 shrink-0 ${SEVERITY_TEXT[sev]}`} />
                <div className="min-w-0 flex-1 text-xs">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={`font-semibold ${SEVERITY_TEXT[sev]}`}>
                      Pågående timer · {s.label}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      pågår sedan {fmt(s.start)} ({fmtDur(s.duration_min)})
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
                        {s.last_seen_at_reported_site
                          ? fmt(s.last_seen_at_reported_site)
                          : '— ingen GPS-närvaro —'}
                      </strong>
                    </div>
                    {s.timer_start_distance_to_reported_site != null && (
                      <div>
                        <span className="text-muted-foreground">Vid start:</span>{' '}
                        <strong className="tabular-nums">
                          {fmtDist(s.timer_start_distance_to_reported_site)} från plats
                        </strong>
                      </div>
                    )}
                    {s.current_distance_to_reported_site != null && (
                      <div>
                        <span className="text-muted-foreground">Nu:</span>{' '}
                        <strong className="tabular-nums">
                          {fmtDist(s.current_distance_to_reported_site)} från plats
                        </strong>
                      </div>
                    )}
                  </div>
                  {overrun && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-destructive">
                      <ArrowRightFromLine className="h-3 w-3" />
                      <span>
                        Lämnade platsen ca{' '}
                        <strong className="tabular-nums">
                          {fmt(s.left_reported_site_at ?? s.last_seen_at_reported_site)}
                        </strong>
                        {overrun.durationMin != null && (
                          <> · timer fortsätter sedan <strong>{fmtDur(overrun.durationMin)}</strong></>
                        )}
                      </span>
                    </div>
                  )}
                  {offsite && !overrun && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                      <MapPin className="h-3 w-3" />
                      <span>{offsite.message}</span>
                    </div>
                  )}
                  {never && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      <span>{never.message}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* ── 2. Day-level flags ───────────────────────────────── */}
          {dayFlags.map((f, i) => {
            const Icon = f.type === 'stale_phone' ? WifiOff : AlertTriangle;
            return (
              <div
                key={`day-${i}`}
                className={`flex items-center gap-2 text-[11px] px-2 py-1 rounded ${SEVERITY_TEXT[f.severity]}`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{f.message}</span>
              </div>
            );
          })}

          {/* ── 3. Closed sessions with flags ────────────────────── */}
          {closedFlagged.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                <AlertTriangle className="h-3 w-3 text-destructive" />
                Avvikelser ({closedFlagged.reduce((n, s) => n + s.flags.length, 0)})
              </div>
              <ul className="flex flex-col gap-1">
                {closedFlagged.flatMap((s) =>
                  s.flags.map((f, idx) => (
                    <li
                      key={`${s.session_id}-${idx}`}
                      className={`flex items-start gap-2 text-xs px-2 py-1 rounded border ${SEVERITY_BG[f.severity]}`}
                    >
                      <Clock className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${SEVERITY_TEXT[f.severity]}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="tabular-nums font-semibold text-foreground">
                            {f.at ? fmt(f.at) : ''}
                            {f.until && <>–{fmt(f.until)}</>}
                          </span>
                          {f.durationMin != null && f.durationMin > 0 && (
                            <span className="tabular-nums text-muted-foreground">
                              ({fmtDur(f.durationMin)})
                            </span>
                          )}
                          <span className="font-medium text-foreground">
                            {FLAG_LABELS[f.type]}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            · {s.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {f.message}
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}

          {/* ── 4. All clear ─────────────────────────────────────── */}
          {nothingToShow && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              GPS bekräftar rapporterad tid · inga avvikelser
              {reality.gps_points_count > 0 && (
                <span className="text-muted-foreground/70">
                  {' '}· {reality.gps_points_count} pings granskade
                </span>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
};
