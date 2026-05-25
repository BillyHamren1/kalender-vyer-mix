// Legacy mobile time UI. Do not use for Time v2.
import { cn } from '@/lib/utils';
import { formatHoursMinutes } from '@/utils/formatHours';

export interface SummaryFigures {
  grossWorkdayMinutes: number;
  breakMinutes: number;
  transportMinutes: number;
}

interface Props {
  totals: SummaryFigures;
  /** Optional total expected target minutes for progress (e.g. monthly goal). */
  targetMinutes?: number;
  /** Count of days that still need user input (rapportera/skicka). */
  remainingActions?: number;
}

const fmt = (m: number) => formatHoursMinutes((m ?? 0) / 60);

/**
 * UserTimeSummaryCards — ren summa för TIME-vyn.
 *
 * Visar ENDAST registrerad tid (Total / Rast / Transport).
 * Inga payable/approved/awaiting/godkänd-statusar exponeras — TIME är en
 * rapporteringssida, inte ett attest-/lönegrundande-flöde.
 */
export const UserTimeSummaryCards = ({ totals, targetMinutes, remainingActions }: Props) => {
  const pct = targetMinutes && targetMinutes > 0
    ? Math.min(100, Math.round((totals.grossWorkdayMinutes / targetMinutes) * 100))
    : null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="grid grid-cols-3 gap-2">
        <Cell label="Total tid" value={fmt(totals.grossWorkdayMinutes)} primary />
        <Cell label="Rast" value={fmt(totals.breakMinutes)} />
        <Cell label="Transport" value={fmt(totals.transportMinutes)} />
      </div>

      {pct !== null && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span className="font-semibold">Periodens framsteg</span>
            <span className="tabular-nums font-bold text-foreground">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {typeof remainingActions === 'number' && remainingActions > 0 && (
        <p className="mt-3 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
          {remainingActions} dag{remainingActions === 1 ? '' : 'ar'} kvar att rapportera
        </p>
      )}
    </div>
  );
};

const Cell = ({
  label, value, primary,
}: {
  label: string;
  value: string;
  primary?: boolean;
}) => (
  <div className={cn(
    'rounded-xl px-3 py-2.5 border',
    primary ? 'bg-primary/5 border-primary/20' : 'bg-muted/40 border-transparent',
  )}>
    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
      {label}
    </p>
    <p className={cn(
      'font-extrabold tabular-nums mt-0.5 text-base',
      primary ? 'text-primary' : 'text-foreground',
    )}>
      {value}
    </p>
  </div>
);

export default UserTimeSummaryCards;
