import React from 'react';
import { Sun, Clock, Briefcase, Car, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatHoursMinutes } from '@/utils/formatHours';
import { extractUTCTime } from '@/utils/dateUtils';
import { type DayCardModel, type DayStatus, statusLabel } from '@/lib/mobile/dayCardModel';

interface Props {
  model: DayCardModel;
  /** Header label, t.ex. "Idag", "Igår" eller "tis 6 maj". */
  dateLabel: string;
  /** Optional click handler — t.ex. expandera / öppna detalj. */
  onClick?: () => void;
}

const STATUS_TONE: Record<DayStatus, string> = {
  ongoing:  'bg-primary/10 text-primary border-primary/20',
  ready:    'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400',
  approved: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
  error:    'bg-destructive/10 text-destructive border-destructive/30',
};

const STATUS_ICON: Record<DayStatus, React.ComponentType<{ className?: string }>> = {
  ongoing:  Loader2,
  ready:    Clock,
  approved: Check,
  error:    AlertTriangle,
};

/**
 * MobileDayCard — workday-first per-dag-kort.
 *
 * Visar:
 *   1. Arbetsdag (start/slut/total)
 *   2. Fördelat (projekttid + ev. restid)
 *   3. Oallokerat (workday − fördelat) — neutralt, ingen varning
 *   4. Status (Pågår / Redo för attest / Godkänd / Kräver korrigering)
 *
 * "Kräver korrigering" visas ENDAST vid riktiga fel (saknad start/slut,
 * aktiv timer kvar, överlapp, över-rapportering, tekniskt fel).
 * Oallokerad tid är ALDRIG ett fel.
 */
export const MobileDayCard: React.FC<Props> = ({ model, dateLabel, onClick }) => {
  const StatusIcon = STATUS_ICON[model.status];
  const wdStartHm = model.workdayStartIso ? extractUTCTime(model.workdayStartIso) : null;
  const wdEndHm = model.workdayEndIso ? extractUTCTime(model.workdayEndIso) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'w-full text-left rounded-2xl border border-border bg-card shadow-sm p-4 space-y-3',
        onClick && 'active:opacity-80 transition-opacity',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {dateLabel}
          </p>
          <p className="font-extrabold text-base text-foreground mt-0.5 flex items-center gap-1.5">
            <Sun className="w-4 h-4 text-primary shrink-0" />
            {wdStartHm ? (
              <>
                {wdStartHm}
                <span className="text-muted-foreground mx-0.5">→</span>
                {wdEndHm ? (
                  <span>{wdEndHm}</span>
                ) : (
                  <span className="text-primary">pågår</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground text-sm font-semibold">
                Ingen arbetsdag
              </span>
            )}
          </p>
        </div>
        <div
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap shrink-0',
            STATUS_TONE[model.status],
          )}
        >
          <StatusIcon
            className={cn(
              'w-3 h-3',
              model.status === 'ongoing' && 'animate-spin',
            )}
          />
          {statusLabel(model.status)}
        </div>
      </div>

      {/* Totals row — workday = registrerad total tid (mobilen visar inte lönegrundande) */}
      <div className="grid grid-cols-3 gap-2">
        <Cell
          label="Arbetsdag"
          value={formatHoursMinutes(model.workdayMinutes / 60)}
          tone="strong"
        />
        <Cell
          label="Fördelat"
          value={formatHoursMinutes(model.distributedMinutes / 60)}
          tone="muted"
          icon={<Briefcase className="w-3 h-3" />}
        />
        <Cell
          label="Ej fördelat"
          value={formatHoursMinutes(model.unallocatedMinutes / 60)}
          tone="muted"
          subtitle="på projekt"
        />
      </div>

      {/* Travel split, only if relevant */}
      {model.travelMinutes > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Car className="w-3.5 h-3.5 shrink-0" />
          <span>
            varav restid:{' '}
            <span className="font-semibold text-foreground tabular-nums">
              {formatHoursMinutes(model.travelMinutes / 60)}
            </span>
          </span>
        </div>
      )}

      {/* Real errors */}
      {model.errors.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 space-y-1">
          {model.errors.map((err) => (
            <div
              key={err.kind}
              className="flex items-start gap-2 text-xs text-destructive"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold">{err.label}</p>
                <p className="text-[11px] text-destructive/80">{err.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </button>
  );
};

const Cell: React.FC<{
  label: string;
  value: string;
  tone: 'strong' | 'muted';
  subtitle?: string;
  icon?: React.ReactNode;
}> = ({ label, value, tone, subtitle, icon }) => (
  <div className="rounded-xl border border-border bg-muted/20 px-2.5 py-2">
    <div className="flex items-center gap-1 text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">
      {icon}
      {label}
    </div>
    <div
      className={cn(
        'tabular-nums font-extrabold text-sm mt-0.5',
        tone === 'strong' ? 'text-foreground' : 'text-foreground/80',
      )}
    >
      {value}
    </div>
    {subtitle && (
      <div className="text-[10px] text-muted-foreground leading-tight">{subtitle}</div>
    )}
  </div>
);

export default MobileDayCard;
