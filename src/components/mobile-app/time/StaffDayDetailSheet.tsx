/**
 * StaffDayDetailSheet — användarens daggranskning. 100% backend-driven av
 * `useStaffDayStatus(date)`. Inga råtabeller summeras. Sektioner:
 *   A. Header (datum + statuschip + workday-spann)
 *   B. Summering (canonical totals)
 *   C. Tidslinje (snapshot.segments)
 *   D. Behöver åtgärdas (actionsNeeded + ej resolvade flags)
 *   E. Rast/lunch + Godkänn dagen (StaffDayAttestSection → attest-staff-day)
 *   F. Begär korrigering (workday_flag via mobileApi.createWorkdayFlag)
 *
 * Tider visas alltid i Europe/Stockholm via `formatStockholmHm` —
 * `extractUTCTime` används INTE här.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Sun, AlertTriangle, Check, Lock, Loader2, Wrench, Send, ShieldCheck,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  type StaffDaySegment,
  type StaffDaySnapshot,
} from '@/hooks/useStaffDaySnapshot';
import { useStaffDayStatusViaMobileReport } from '@/hooks/useStaffDayStatusViaMobileReport';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import { formatHoursMinutes } from '@/utils/formatHours';
import { mobileApi } from '@/services/mobileApiService';
import { cn } from '@/lib/utils';
import { SEG_ICON, SEG_TONE, FallbackSegIcon } from './segmentVisuals';
import StaffDayAttestSection from './StaffDayAttestSection';
import EndDayButton from './EndDayButton';
import SegmentDetailSheet from './SegmentDetailSheet';

const TZ_TODAY = 'Europe/Stockholm';
function useTick(intervalMs = 1000) {
  const [, setT] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

const ActiveTimelineRow: React.FC<{ seg: StaffDaySegment }> = ({ seg }) => {
  useTick(1000);
  const Icon = SEG_ICON[seg.kind] ?? FallbackSegIcon;
  const startedMs = new Date(seg.startedAt).getTime();
  const elapsedSec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  const s = elapsedSec % 60;
  return (
    <div className="rounded-xl border-2 border-primary bg-primary/5 px-3 py-3">
      <div className="flex items-start gap-3">
        <div className={cn('shrink-0 w-8 h-8 rounded-lg flex items-center justify-center relative', SEG_TONE[seg.kind])}>
          <Icon className="w-4 h-4" />
          <span className="absolute -top-0.5 -right-0.5 flex w-2.5 h-2.5">
            <span className="absolute inset-0 rounded-full bg-primary opacity-75 animate-ping" />
            <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-primary" />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold text-foreground truncate">{seg.label}</p>
          <p className="text-[12px] text-muted-foreground tabular-nums">
            Startade <span className="font-semibold text-foreground/80">{formatStockholmHm(seg.startedAt)}</span>
          </p>
          <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-primary/15 text-primary">
            <ShieldCheck className="w-3 h-3" /> Pågår
          </span>
        </div>
        <div className="font-mono font-extrabold text-base tabular-nums text-primary shrink-0 pt-0.5">
          {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
        </div>
      </div>
    </div>
  );
};

function segmentRange(s: StaffDaySegment) {
  const start = formatStockholmHm(s.startedAt);
  if (s.isActive || !s.endedAt) return `${start}–pågår`;
  return `${start}–${formatStockholmHm(s.endedAt)}`;
}

interface Props {
  date: string | null;
  onClose: () => void;
}

export const StaffDayDetailSheet: React.FC<Props> = ({ date, onClose }) => {
  const { snapshot, isLoading, refresh } = useStaffDayStatusViaMobileReport(date ?? undefined);
  const { staff } = useMobileAuth();
  const open = !!date;

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
        ) : !snapshot || !date ? (
          <p className="py-8 text-sm text-muted-foreground text-center">Ingen data.</p>
        ) : (
          <DayBody
            snapshot={snapshot}
            date={date}
            staffId={staff?.id ?? null}
            onChanged={() => { void refresh(); }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};

// ────────────────────────────────────────────────────────────────────

const DayBody: React.FC<{
  snapshot: StaffDaySnapshot;
  date: string;
  staffId: string | null;
  onChanged: () => void;
}> = ({ snapshot, date, staffId, onChanged }) => {
  const [selectedSeg, setSelectedSeg] = useState<StaffDaySegment | null>(null);
  const wd = snapshot.workday;
  const t = snapshot.totals;
  const isLocked = !!wd?.approved;
  const grossMin = t?.grossWorkdayMinutes ?? t?.workdayMinutes ?? 0;
  const breakMin = t?.breakMinutes ?? 0;
  const payableMin = t?.payableMinutes ?? grossMin;
  const transportMin = t?.transportMinutes ?? t?.travelMinutes ?? 0;
  const projectMin =
    (t?.projectMinutes ?? t?.allocatedProjectMinutes ?? 0) +
    (t?.warehouseMinutes ?? 0);
  const otherPlaceMin = t?.otherPlaceMinutes ?? 0;

  const openFlags = useMemo(
    () => (snapshot.flags ?? []).filter(
      (f) => !f.resolved && f.severity !== 'info',
    ),
    [snapshot.flags],
  );
  const flagsNeedingInput = useMemo(
    () => openFlags.filter((f) => f.needsUserInput),
    [openFlags],
  );
  const actions = snapshot.actionsNeeded ?? [];
  const hasOpenIssues = flagsNeedingInput.length > 0 || actions.length > 0;
  const todayStockholm = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ_TODAY }).format(new Date());
  const isToday = date === todayStockholm;

  const recommendBreak = !isLocked && grossMin > 300 && breakMin === 0;

  const statusChip = (() => {
    if (isLocked) return { label: 'Godkänd', tone: 'emerald' as const, Icon: Check };
    if (!wd) return { label: 'Ingen tid', tone: 'muted' as const, Icon: AlertTriangle };
    if (wd.isOpen) return { label: 'Pågår', tone: 'primary' as const, Icon: Loader2 };
    if (snapshot.attestation?.status === 'attested') {
      return { label: 'Inskickad', tone: 'emerald' as const, Icon: Check };
    }
    if (hasOpenIssues) return { label: 'Behöver åtgärdas', tone: 'amber' as const, Icon: AlertTriangle };
    return { label: 'Ej inskickad', tone: 'amber' as const, Icon: Check };
  })();

  return (
    <div className="space-y-3 mt-2 pb-6">
      {isLocked && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
          <Lock className="w-4 h-4 shrink-0" />
          <p className="text-xs font-semibold">
            Dagen är godkänd och låst — kan inte ändras av dig.
          </p>
        </div>
      )}

      {/* A. Header */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Arbetsdag
            </p>
            <p className="font-extrabold text-base text-foreground mt-1 flex items-center gap-1.5 flex-wrap">
              <Sun className="w-4 h-4 text-primary shrink-0" />
              {wd ? (
                <>
                  <span className="tabular-nums">{formatStockholmHm(wd.startedAt)}</span>
                  <span className="text-muted-foreground mx-0.5">→</span>
                  {wd.endedAt ? (
                    <span className="tabular-nums">{formatStockholmHm(wd.endedAt)}</span>
                  ) : (
                    <span className="text-primary">pågår</span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground text-sm font-semibold">Ingen arbetsdag</span>
              )}
            </p>
          </div>

          <span className={cn(
            'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border whitespace-nowrap',
            statusChip.tone === 'emerald' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
            statusChip.tone === 'amber' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
            statusChip.tone === 'primary' && 'bg-primary/10 text-primary border-primary/20',
            statusChip.tone === 'muted' && 'bg-muted text-muted-foreground border-border',
          )}>
            <statusChip.Icon className={cn('w-3 h-3', statusChip.tone === 'primary' && 'animate-spin')} />
            {statusChip.label}
          </span>
        </div>

        {/* Inga totals-rutor här — Summering nedan äger siffrorna. */}
      </section>

      {/* B. Summering — Brutto/Rast/Lön framträdande, övrigt som chips */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Summering
        </p>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Brutto" value={formatHoursMinutes(grossMin / 60)} />
          <Stat label="Rast" value={breakMin > 0 ? formatHoursMinutes(breakMin / 60) : '—'} muted={breakMin === 0} />
          <Stat label="Lönegrundande" value={formatHoursMinutes(payableMin / 60)} strong />
        </div>
        {(projectMin > 0 || transportMin > 0 || otherPlaceMin > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {projectMin > 0 && (
              <SecondaryChip label="Projekt/Lager" value={formatHoursMinutes(projectMin / 60)} />
            )}
            {transportMin > 0 && (
              <SecondaryChip label="Transport" value={formatHoursMinutes(transportMin / 60)} />
            )}
            {otherPlaceMin > 0 && (
              <SecondaryChip label="Annan plats" value={formatHoursMinutes(otherPlaceMin / 60)} />
            )}
          </div>
        )}
        {recommendBreak && (
          <p className="text-[12px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Glöm inte att lägga in lunch/rast.
          </p>
        )}
      </section>

      {/* D. Behöver åtgärdas */}
      {(actions.length > 0 || openFlags.length > 0) && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Behöver åtgärdas
          </p>
          {actions.map((a) => (
            <div key={a.id} className="rounded-lg border border-amber-500/30 bg-card p-2.5">
              <p className="font-bold text-sm text-foreground">{a.title}</p>
              {a.description && (
                <p className="text-[12px] text-muted-foreground mt-0.5">{a.description}</p>
              )}
            </div>
          ))}
          {openFlags.map((f) => (
            <div key={f.id} className="rounded-lg border border-amber-500/30 bg-card p-2.5">
              <p className="font-bold text-sm text-foreground">{f.title}</p>
              {f.description && (
                <p className="text-[12px] text-muted-foreground mt-0.5">{f.description}</p>
              )}
            </div>
          ))}
          {hasOpenIssues && !isLocked && (
            <p className="text-[12px] text-amber-800 dark:text-amber-300 mt-1">
              Lös frågorna eller skicka korrigeringsbegäran innan du skickar in dagen.
            </p>
          )}
        </section>
      )}

      {/* C. Tidslinje */}
      {snapshot.segments.length > 0 ? (
        <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Tidslinje
          </p>
          <div className="space-y-1.5">
            {snapshot.segments.map((seg, idx) => {
              const Icon = SEG_ICON[seg.kind] ?? FallbackSegIcon;
              const isActive = !!seg.isActive || !seg.endedAt;
              if (isActive && isToday) {
                return <ActiveTimelineRow key={`${seg.startedAt}-${idx}`} seg={seg} />;
              }
              return (
                <button
                  type="button"
                  key={`${seg.startedAt}-${idx}`}
                  onClick={() => setSelectedSeg(seg)}
                  className={cn(
                    'w-full text-left flex items-start gap-3 rounded-xl border border-border bg-background/60 px-3 py-2 active:bg-muted/50 transition-colors',
                    seg.kind === 'unknown' && 'border-amber-500/30 bg-amber-500/5',
                    isActive && 'border-primary/30 bg-primary/5',
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
                </button>
              );
            })}
          </div>
          {/* Stoppknapp under sista raden när det är dagens datum + arbetsdag pågår. */}
          {isToday && !!snapshot.workday?.isOpen && (
            <div className="pt-2">
              <EndDayButton workdayOpen onStopped={onChanged} />
            </div>
          )}
        </section>
      ) : (
        <>
          <p className="text-sm text-muted-foreground text-center py-4">
            Inga registrerade aktiviteter denna dag.
          </p>
          {isToday && !!snapshot.workday?.isOpen && (
            <EndDayButton workdayOpen onStopped={onChanged} />
          )}
        </>
      )}

      {/* E. Rast/lunch + Godkänn dagen */}
      <StaffDayAttestSection
        staffId={staffId}
        date={date}
        snapshot={snapshot}
        attestBlocked={hasOpenIssues}
        attestBlockedReason={hasOpenIssues
          ? 'Lös frågorna eller skicka korrigeringsbegäran först.'
          : undefined}
      />

      {/* F. Begär korrigering */}
      {!isLocked && (
        <CorrectionRequest
          date={date}
          snapshot={snapshot}
          onSubmitted={onChanged}
        />
      )}

      <SegmentDetailSheet
        segment={selectedSeg}
        date={date}
        staffId={staffId}
        onClose={() => setSelectedSeg(null)}
      />
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────

const CorrectionRequest: React.FC<{
  date: string;
  snapshot: StaffDaySnapshot;
  onSubmitted: () => void;
}> = ({ date, snapshot, onSubmitted }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error('Beskriv kort vad som behöver ändras.');
      return;
    }
    setSaving(true);
    try {
      await mobileApi.createWorkdayFlag({
        flag_type: snapshot.workday ? 'time_gap' : 'missing_report',
        flag_date: date,
        title: 'Korrigeringsbegäran från användare',
        description: trimmed,
        severity: 'warning',
        needs_user_input: false,
        context: {
          source: 'mobile_time_day_detail',
          requestedChange: trimmed,
          snapshotDate: date,
          workdayId: snapshot.workday?.id ?? null,
          currentBreakMinutes: snapshot.totals?.breakMinutes ?? 0,
          currentTotals: snapshot.totals,
        },
      });
      toast.success('Korrigeringsbegäran skickad');
      setText('');
      setOpen(false);
      onSubmitted();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte skicka begäran');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm font-bold text-foreground/80 active:bg-muted/40 flex items-center justify-center gap-2"
      >
        <Wrench className="w-4 h-4" />
        Begär korrigering
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Begär korrigering
        </p>
        <p className="text-[12px] text-muted-foreground mt-1">
          Beskriv kort vad som behöver ändras. En administratör tar emot begäran.
        </p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1000))}
        rows={3}
        autoFocus
        placeholder="Vad behöver ändras?"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setText(''); }}
          disabled={saving}
          className="flex-1 rounded-xl border border-border bg-background py-2.5 text-sm font-bold text-foreground/80 active:bg-muted/40"
        >
          Avbryt
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving || !text.trim()}
          className={cn(
            'flex-1 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-extrabold flex items-center justify-center gap-2 active:opacity-80',
            (saving || !text.trim()) && 'opacity-60',
          )}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Skicka
        </button>
      </div>
    </section>
  );
};

const Stat: React.FC<{ label: string; value: string; strong?: boolean; muted?: boolean }> = ({
  label, value, strong, muted,
}) => (
  <div className={cn(
    'rounded-xl border px-3 py-2.5',
    strong ? 'bg-primary/5 border-primary/20' : 'bg-background/60 border-border',
    muted && 'bg-muted/20 border-border',
  )}>
    <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">
      {label}
    </div>
    <div className={cn(
      'font-extrabold text-base tabular-nums mt-0.5',
      strong ? 'text-primary' : 'text-foreground',
      muted && 'text-muted-foreground',
    )}>
      {value}
    </div>
  </div>
);

const SecondaryChip: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-semibold tabular-nums">
    <span className="text-foreground/70">{label}</span>
    <span className="text-foreground">{value}</span>
  </span>
);

export default StaffDayDetailSheet;
