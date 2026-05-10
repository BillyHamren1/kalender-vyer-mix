import { cn } from '@/lib/utils';
import { formatHoursMinutes } from '@/utils/formatHours';

export interface SummaryFigures {
  grossWorkdayMinutes: number;
  breakMinutes: number;
  payableMinutes: number;
  transportMinutes: number;
  approvedPayableMinutes: number;
  awaitingAttestPayableMinutes: number;
}

interface Props {
  totals: SummaryFigures;
  /** Optional total expected target minutes for progress (e.g. monthly goal). Omit to hide bar. */
  targetMinutes?: number;
  /** "Kvar att göra" – derived count of items needing user input from backend. */
  remainingActions?: number;
}

const fmt = (m: number) => formatHoursMinutes((m ?? 0) / 60);

/**
 * UserTimeSummaryCards — premium 6-cell summary used by TimeReportTab for
 * Day/Week/Month. All values come from canonical backend snapshots.
 */
export const UserTimeSummaryCards = ({ totals, targetMinutes, remainingActions }: Props) => {
  const pct = targetMinutes && targetMinutes > 0
    ? Math.min(100, Math.round((totals.payableMinutes / targetMinutes) * 100))
    : null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3">
        <Cell label="Brutto" value={fmt(totals.grossWorkdayMinutes)} primary />
        <Cell label="Lönegrundande" value={fmt(totals.payableMinutes)} />
        <Cell label="Rast" value={fmt(totals.breakMinutes)} />
        <Cell label="Transport" value={fmt(totals.transportMinutes)} />
        <Cell label="Godkänt" value={fmt(totals.approvedPayableMinutes)} tone="emerald" />
        <Cell label="Väntar attest" value={fmt(totals.awaitingAttestPayableMinutes)} tone="amber" />
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
          {remainingActions} sak{remainingActions === 1 ? '' : 'er'} kvar att göra
        </p>
      )}
    </div>
  );
};

const Cell = ({
  label, value, primary, tone,
}: { label: string; value: string; primary?: boolean; tone?: 'emerald' | 'amber' }) => (
  <div className={cn(
    'rounded-xl px-3 py-2.5 border',
    primary && 'bg-primary/5 border-primary/20',
    tone === 'emerald' && 'bg-emerald-500/5 border-emerald-500/20',
    tone === 'amber' && 'bg-amber-500/5 border-amber-500/20',
    !primary && !tone && 'bg-muted/40 border-transparent',
  )}>
    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
      {label}
    </p>
    <p className={cn(
      'text-base font-extrabold tabular-nums mt-0.5',
      primary && 'text-primary',
      tone === 'emerald' && 'text-emerald-700 dark:text-emerald-400',
      tone === 'amber' && 'text-amber-700 dark:text-amber-400',
      !primary && !tone && 'text-foreground',
    )}>
      {value}
    </p>
  </div>
);

export default UserTimeSummaryCards;
