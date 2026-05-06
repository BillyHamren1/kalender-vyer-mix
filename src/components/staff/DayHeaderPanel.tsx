/**
 * DayHeaderPanel — den enda godkända headern för tidrapportsvyn.
 * Renderar fyra sektioner i FAST ordning, exakt likadant för alla:
 *   1. Arbetsdag
 *   2. Aktiv just nu
 *   3. Fördelning
 *   4. Status (4 värden)
 *
 * Får ALDRIG visa: "TIMER SAKNAS", "TIMER SEDAN", "ARBETSDAG SAKNAS",
 * "SIGNAL TAPPAD", "GPS_ON_KNOWN_WORK_SITE", "timer_tail", "timer_bridge".
 */
import React from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import type { DayHeaderModel, DayHeaderStatus } from '@/lib/staff/dayHeaderModel';

const fmtHm = (iso: string | null): string => {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'HH:mm');
  } catch {
    return iso.slice(11, 16);
  }
};

const fmtMin = (m: number): string => {
  if (!m || m < 0) return '0h';
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
};

const STATUS_CLASS: Record<DayHeaderStatus, string> = {
  ongoing: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100',
  ready_review: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  needs_review: 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100',
  approved: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100',
};

interface Props {
  staffName: string;
  date: string;
  header: DayHeaderModel;
  /** Slot för extra inline-info (t.ex. "Auto-skapad")-badge eller PlanningHeaderPill. */
  extra?: React.ReactNode;
}

export const DayHeaderPanel: React.FC<Props> = ({ staffName, date, header, extra }) => {
  const { workday, active, allocation, status, statusLabel } = header;

  return (
    <div className="border-b bg-muted/30">
      {/* Topprad: identitet + status */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="font-semibold text-sm">{staffName}</div>
        <div className="text-xs text-muted-foreground tabular-nums">{date}</div>
        {extra}
        <div className="ml-auto">
          <Badge className={`${STATUS_CLASS[status]} font-medium`} title="Dagens status">
            {statusLabel}
          </Badge>
        </div>
      </div>

      {/* Fyra sektioner i fast ordning */}
      <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2 text-xs">
        {/* 1. Arbetsdag */}
        <Section label="Arbetsdag">
          <div className="tabular-nums">
            <span className="font-medium text-foreground">{fmtHm(workday.startIso)}</span>
            <span className="text-muted-foreground"> → </span>
            <span className="font-medium text-foreground">
              {workday.ongoing ? 'pågår' : fmtHm(workday.endIso)}
            </span>
          </div>
          <div className="text-muted-foreground">
            <span>Längd </span>
            <span className="tabular-nums text-foreground">{fmtMin(workday.workdayMinutes)}</span>
            <span className="mx-1">·</span>
            <span>Lönegrundande </span>
            <span className="tabular-nums text-foreground">{fmtMin(workday.payableMinutes)}</span>
          </div>
        </Section>

        {/* 2. Aktiv just nu */}
        <Section label="Aktiv just nu">
          {active.hasActive ? (
            <>
              <div className="font-medium text-foreground truncate" title={active.label ?? undefined}>
                {active.label}
              </div>
              <div className="text-muted-foreground tabular-nums">
                sedan {fmtHm(active.sinceIso)} · {fmtMin(active.runningMinutes)}
              </div>
            </>
          ) : (
            <div className="text-muted-foreground">Ingen aktiv projektregistrering</div>
          )}
        </Section>

        {/* 3. Fördelning */}
        <Section label="Fördelning">
          <div className="tabular-nums">
            <span className="text-muted-foreground">Projekt </span>
            <span className="font-medium text-foreground">{fmtMin(allocation.projectMinutes)}</span>
          </div>
          <div className="tabular-nums">
            <span className="text-muted-foreground">Restid </span>
            <span className="font-medium text-foreground">{fmtMin(allocation.travelMinutes)}</span>
            <span className="mx-1">·</span>
            <span className="text-muted-foreground">Oallokerat </span>
            <span className="font-medium text-foreground">{fmtMin(allocation.unallocatedMinutes)}</span>
          </div>
        </Section>

        {/* 4. Status (textuellt — badge sitter i topprad) */}
        <Section label="Status">
          <div className="font-medium text-foreground">{statusLabel}</div>
        </Section>
      </div>
    </div>
  );
};

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
    {children}
  </div>
);

export default DayHeaderPanel;
