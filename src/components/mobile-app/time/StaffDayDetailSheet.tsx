/**
 * StaffDayDetailSheet — read-only detail view for a chosen day, opened from
 * the Calendar tab. Driven 100% by `useStaffDayStatus(date)`. Presents
 * arbetsdag, totaler, fördelning och flags. Indicates locked/approved
 * state so the user knows it can't be edited.
 */
import React from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Sun, AlertTriangle, Check, Lock, Loader2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useStaffDayStatus, type StaffDaySegment } from '@/hooks/useStaffDayStatus';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { extractUTCTime } from '@/utils/dateUtils';
import { formatHoursMinutes } from '@/utils/formatHours';
import { cn } from '@/lib/utils';
import { SEG_ICON, SEG_TONE, FallbackSegIcon } from './segmentVisuals';
import StaffDayAttestSection from './StaffDayAttestSection';

function segmentRange(s: StaffDaySegment) {
  const start = extractUTCTime(s.startedAt);
  if (s.isActive || !s.endedAt) return `${start}–pågår`;
  return `${start}–${extractUTCTime(s.endedAt)}`;
}

interface Props {
  date: string | null;
  onClose: () => void;
}

export const StaffDayDetailSheet: React.FC<Props> = ({ date, onClose }) => {
  const { snapshot, isLoading } = useStaffDayStatus(date ?? undefined);
  const open = !!date;
  const wd = snapshot?.workday;
  const t = snapshot?.totals;
  const isLocked = !!wd?.approved;

  const dateLabel = date
    ? format(parseISO(date), 'EEEE d MMMM yyyy', { locale: sv })
    : '';

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="capitalize text-base">{dateLabel}</SheetTitle>
          <SheetDescription className="sr-only">Dagsdetalj</SheetDescription>
        </SheetHeader>

        {isLoading && !snapshot ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !snapshot ? (
          <p className="py-8 text-sm text-muted-foreground text-center">Ingen data.</p>
        ) : (
          <div className="space-y-3 mt-2 pb-6">
            {isLocked && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <Lock className="w-4 h-4 shrink-0" />
                <p className="text-xs font-semibold">
                  Dagen är godkänd och låst — kan inte ändras av dig.
                </p>
              </div>
            )}

            {/* Workday header */}
            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Arbetsdag
                  </p>
                  <p className="font-extrabold text-base text-foreground mt-1 flex items-center gap-1.5">
                    <Sun className="w-4 h-4 text-primary shrink-0" />
                    {wd ? (
                      <>
                        <span className="tabular-nums">{extractUTCTime(wd.startedAt)}</span>
                        <span className="text-muted-foreground mx-0.5">→</span>
                        {wd.endedAt ? (
                          <span className="tabular-nums">{extractUTCTime(wd.endedAt)}</span>
                        ) : (
                          <span className="text-primary">pågår</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground text-sm font-semibold">Ingen arbetsdag</span>
                    )}
                  </p>
                </div>
                {wd?.approved && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <Check className="w-3.5 h-3.5" /> Godkänd
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Stat label="Lönegrundande" value={formatHoursMinutes((t?.workdayMinutes ?? 0) / 60)} strong />
                <Stat label="Fördelat" value={formatHoursMinutes((t?.allocatedProjectMinutes ?? 0) / 60)} />
                <Stat label="Restid" value={formatHoursMinutes((t?.travelMinutes ?? 0) / 60)} />
                <Stat label="Ej fördelat" value={formatHoursMinutes((t?.unallocatedMinutes ?? 0) / 60)} muted />
              </div>
            </section>

            {/* Flags */}
            {(snapshot.flags ?? []).filter((f) => !f.resolved && f.severity !== 'info').length > 0 && (
              <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Behöver granskning
                </p>
                {snapshot.flags
                  .filter((f) => !f.resolved && f.severity !== 'info')
                  .map((f) => (
                    <div key={f.id} className="rounded-lg border border-amber-500/30 bg-card p-2.5">
                      <p className="font-bold text-sm text-foreground">{f.title}</p>
                      {f.description && (
                        <p className="text-[12px] text-muted-foreground mt-0.5">{f.description}</p>
                      )}
                    </div>
                  ))}
              </section>
            )}

            {/* Timeline */}
            {snapshot.segments.length > 0 ? (
              <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Tidslinje
                </p>
                <div className="space-y-1.5">
                  {snapshot.segments.map((seg, idx) => {
                    const Icon = SEG_ICON[seg.kind] ?? FallbackSegIcon;
                    return (
                      <div
                        key={`${seg.startedAt}-${idx}`}
                        className={cn(
                          'flex items-start gap-3 rounded-xl border border-border bg-background/60 px-3 py-2',
                          seg.kind === 'unknown' && 'border-amber-500/30 bg-amber-500/5',
                          seg.isActive && 'border-primary/30 bg-primary/5',
                        )}
                      >
                        <div className={cn('shrink-0 w-8 h-8 rounded-lg flex items-center justify-center', SEG_TONE[seg.kind])}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] tabular-nums font-semibold text-muted-foreground">
                            {segmentRange(seg)}
                          </p>
                          <p className="text-sm font-semibold text-foreground truncate">{seg.label}</p>
                        </div>
                        <div className="text-xs tabular-nums font-bold text-foreground/80 shrink-0 pt-0.5">
                          {formatHoursMinutes(seg.durationMinutes / 60)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Inga registrerade aktiviteter denna dag.
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

const Stat: React.FC<{ label: string; value: string; strong?: boolean; muted?: boolean }> = ({
  label, value, strong, muted,
}) => (
  <div className={cn(
    'rounded-xl border border-border px-3 py-2',
    muted ? 'bg-muted/20' : 'bg-background/60',
  )}>
    <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">
      {label}
    </div>
    <div className={cn(
      'font-extrabold text-sm tabular-nums mt-0.5',
      strong ? 'text-foreground' : 'text-foreground/80',
    )}>
      {value}
    </div>
  </div>
);

export default StaffDayDetailSheet;
