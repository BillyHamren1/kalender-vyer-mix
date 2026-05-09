/**
 * ActiveNowBanner — EN konsekvent rad högst upp i varje dagskort som svarar
 * på frågan: "Var registreras tiden JUST NU?"
 *
 * Tre och endast tre tillstånd:
 *   1. PÅ PROJEKT NU            — aktiv time_report eller reportable location-timer
 *   2. INGEN AKTIV PROJEKTREGISTRERING — workday öppen men ingen timer
 *   3. ARBETSDAG AVSLUTAD       — workday stängd (eller saknas helt utan aktivitet)
 *
 * Källa: header.active (öppna time_reports + locationEntries) och header.workday.
 * ALDRIG GPS-rader, presence-rows eller timer_tail-block.
 */
import React from 'react';
import { format } from 'date-fns';
import { Activity, Clock, Wifi, WifiOff } from 'lucide-react';
import type { DayHeaderModel } from '@/lib/staff/dayHeaderModel';
import { formatStockholmHm, formatStockholmHms } from '../../lib/staff/formatStockholmTime';

interface Props {
  header: DayHeaderModel;
  /** Senaste GPS-ping-ISO (visas som komplement, påverkar inte tillstånd). */
  lastPingIso?: string | null;
}

const fmtHm = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try { return formatStockholmHm(iso); } catch { return formatStockholmHm(iso); }
};

const fmtMin = (m: number): string => {
  if (!m || m < 0) return '0m';
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
};

export const ActiveNowBanner: React.FC<Props> = ({ header, lastPingIso }) => {
  const { active, workday } = header;

  // Tillstånd 1: aktiv timer
  if (active.hasActive) {
    return (
      <div className="px-4 py-2.5 border-b bg-blue-50 dark:bg-blue-950/30 flex items-center gap-3">
        <Activity className="h-4 w-4 text-blue-700 dark:text-blue-300 shrink-0" />
        <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="text-[10px] uppercase tracking-wide font-semibold text-blue-900 dark:text-blue-100">
            På projekt nu
          </span>
          <span className="font-semibold text-sm text-foreground truncate" title={active.label ?? undefined}>
            {active.label}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            sedan {fmtHm(active.sinceIso)} · pågått {fmtMin(active.runningMinutes)}
          </span>
          {lastPingIso && (
            <span className="text-xs text-muted-foreground tabular-nums inline-flex items-center gap-1">
              <Wifi className="h-3 w-3" /> senaste GPS {fmtHm(lastPingIso)}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Tillstånd 2: workday öppen, ingen timer
  if (workday.ongoing) {
    return (
      <div className="px-4 py-2.5 border-b bg-amber-50 dark:bg-amber-950/30 flex items-center gap-3">
        <Clock className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0" />
        <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="text-[10px] uppercase tracking-wide font-semibold text-amber-900 dark:text-amber-100">
            Ingen aktiv projektregistrering
          </span>
          <span className="text-xs text-foreground">Arbetsdag pågår fortfarande</span>
          {workday.startIso && (
            <span className="text-xs text-muted-foreground tabular-nums">
              sedan {fmtHm(workday.startIso)}
            </span>
          )}
          {lastPingIso && (
            <span className="text-xs text-muted-foreground tabular-nums inline-flex items-center gap-1">
              <Wifi className="h-3 w-3" /> senaste GPS {fmtHm(lastPingIso)}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Tillstånd 3: arbetsdag avslutad (eller helt frånvarande)
  return (
    <div className="px-4 py-2.5 border-b bg-muted/40 flex items-center gap-3">
      <WifiOff className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
          Arbetsdag avslutad
        </span>
        {workday.endIso && (
          <span className="text-xs text-muted-foreground tabular-nums">
            kl {fmtHm(workday.endIso)}
          </span>
        )}
      </div>
    </div>
  );
};

export default ActiveNowBanner;
