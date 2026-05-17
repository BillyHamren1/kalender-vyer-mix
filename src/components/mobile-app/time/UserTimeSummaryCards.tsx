import { cn } from '@/lib/utils';
import { formatHoursMinutes } from '@/utils/formatHours';

export interface SummaryFigures {
  grossWorkdayMinutes: number;
  breakMinutes: number;
  payableMinutes: number;
  transportMinutes: number;
  approvedPayableMinutes: number;
  /** Inskickat av användare men ej godkänt av admin. */
  submittedPayableMinutes?: number;
  /** Ej inskickat av användare. */
  awaitingUserAttestPayableMinutes?: number;
  /** Legacy alias/fallback (== awaitingUserAttestPayableMinutes). */
  awaitingAttestPayableMinutes?: number;
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
 * UserTimeSummaryCards — premium summary used by TimeReportTab for
 * Day/Week/Month. All values come from canonical backend snapshots.
 *
 * OBS: Mobilen visar ALDRIG "lönegrundande", "betalbar" eller "payroll".
 * Den visar registrerad/arbetad tid och rapportstatus (ej inskickat/
 * inskickat/godkänt). Lönegrundande beräknas i admin/export.
 */
export const UserTimeSummaryCards = ({ totals, targetMinutes, remainingActions }: Props) => {
  const pct = targetMinutes && targetMinutes > 0
    ? Math.min(100, Math.round((totals.grossWorkdayMinutes / targetMinutes) * 100))
    : null;

  const awaitingUser =
    totals.awaitingUserAttestPayableMinutes ??
    totals.awaitingAttestPayableMinutes ??
    0;
  const submitted = totals.submittedPayableMinutes ?? 0;
  const approved = totals.approvedPayableMinutes ?? 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      {/* Tre primära siffror — Total / Rast / Transport (ingen lönegrundande) */}
      <div className="grid grid-cols-3 gap-2">
        <Cell label="Total tid" value={fmt(totals.grossWorkdayMinutes)} primary />
        <Cell label="Rast" value={fmt(totals.breakMinutes)} />
        <Cell label="Transport" value={fmt(totals.transportMinutes)} />
      </div>

      {/* Rapportstatus-kort (registrerad tid per status, ej payroll) */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Cell label="Ej inskickat" value={fmt(awaitingUser)} tone="amber" compact />
        <Cell label="Inskickat" value={fmt(submitted)} tone="emerald" compact />
        <Cell label="Godkänt" value={fmt(approved)} tone="emerald" compact />
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
  label, value, primary, tone, compact,
}: {
  label: string;
  value: string;
  primary?: boolean;
  tone?: 'emerald' | 'amber' | 'blue';
  compact?: boolean;
}) => (
  <div className={cn(
    'rounded-xl px-3 py-2.5 border',
    primary && 'bg-primary/5 border-primary/20',
    tone === 'emerald' && 'bg-emerald-500/5 border-emerald-500/20',
    tone === 'amber' && 'bg-amber-500/5 border-amber-500/20',
    tone === 'blue' && 'bg-blue-500/5 border-blue-500/20',
    !primary && !tone && 'bg-muted/40 border-transparent',
  )}>
    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
      {label}
    </p>
    <p className={cn(
      'font-extrabold tabular-nums mt-0.5',
      compact ? 'text-sm' : 'text-base',
      primary && 'text-primary',
      tone === 'emerald' && 'text-emerald-700 dark:text-emerald-400',
      tone === 'amber' && 'text-amber-700 dark:text-amber-400',
      tone === 'blue' && 'text-blue-700 dark:text-blue-400',
      !primary && !tone && 'text-foreground',
    )}>
      {value}
    </p>
  </div>
);

export default UserTimeSummaryCards;
