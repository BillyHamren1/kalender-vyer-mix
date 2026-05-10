/**
 * StaffDayAttestSection — bottom action inside StaffDayDetailSheet that lets
 * the user attest (godkänn) a finished workday with a break value.
 *
 * Three states:
 *   1. Open workday   → "Avsluta arbetsdagen innan du godkänner."
 *   2. Locked/approved → "Dagen är godkänd och låst."
 *   3. Ended, ej attested → break-picker + comment + "Godkänn dagen"
 *
 * Calls useAttestStaffDay (which hits attest-staff-day edge function).
 * Never calls admin_approve_day. Never sets workdays.approved_at.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Lock, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAttestStaffDay } from '@/hooks/useAttestStaffDay';
import type { StaffDaySnapshot } from '@/hooks/useStaffDaySnapshot';

const PRESETS = [0, 30, 45, 60] as const;

interface Props {
  staffId: string | null;
  date: string;
  snapshot: StaffDaySnapshot;
  /** Hindrar attest även om workday är klar (t.ex. olösta frågor). */
  attestBlocked?: boolean;
  /** Mänskligt skäl till blockeringen som visas i UI. */
  attestBlockedReason?: string;
}

function clampBreak(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(600, Math.round(n)));
}

const StaffDayAttestSection: React.FC<Props> = ({ staffId, date, snapshot, attestBlocked, attestBlockedReason }) => {
  const wd = snapshot.workday;
  const att = snapshot.attestation ?? null;

  const isOpen = !!wd?.isOpen;
  const isApproved = !!wd?.approved;
  const isLocked = !!att?.locked;
  const isAttested = att?.status === 'attested';

  const initialBreak = useMemo(() => {
    if (att?.breakMinutes != null) return clampBreak(att.breakMinutes);
    if (snapshot.totals?.breakMinutes != null) return clampBreak(snapshot.totals.breakMinutes);
    return 0;
  }, [att?.breakMinutes, snapshot.totals?.breakMinutes]);

  const [breakMinutes, setBreakMinutes] = useState<number>(initialBreak);
  const [customMode, setCustomMode] = useState<boolean>(
    !PRESETS.includes(initialBreak as typeof PRESETS[number]),
  );
  const [comment, setComment] = useState<string>(att?.comment ?? '');
  const [success, setSuccess] = useState<boolean>(false);

  // Resync if snapshot changes (e.g. after refresh)
  useEffect(() => {
    setBreakMinutes(initialBreak);
    setCustomMode(!PRESETS.includes(initialBreak as typeof PRESETS[number]));
    setComment(att?.comment ?? '');
  }, [initialBreak, att?.comment]);

  const { attestDay, isSaving, error } = useAttestStaffDay();

  // ── State 1: open workday ───────────────────────────────────────────
  if (!wd || isOpen) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2 text-amber-800 dark:text-amber-300">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <p className="text-xs font-semibold">
          Avsluta arbetsdagen innan du godkänner.
        </p>
      </div>
    );
  }

  // ── State 2: locked or approved ─────────────────────────────────────
  if (isApproved || isLocked) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-start gap-2 text-emerald-700 dark:text-emerald-400">
        <Lock className="w-4 h-4 shrink-0 mt-0.5" />
        <p className="text-xs font-semibold">Dagen är godkänd och låst.</p>
      </div>
    );
  }

  // ── State 3: ended, not yet attested ────────────────────────────────
  const handleSubmit = async () => {
    if (!staffId) return;
    try {
      await attestDay({
        staffId,
        date,
        breakMinutes: clampBreak(breakMinutes),
        comment: comment.trim() ? comment.trim() : null,
      });
      setSuccess(true);
    } catch {
      /* error surfaced via hook */
    }
  };

  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-3 text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        <div>
          <p className="text-sm font-extrabold">Dagen är inskickad</p>
          <p className="text-[12px] opacity-80">Vi uppdaterar översikten åt dig.</p>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Godkänn dagen
        </p>
        <p className="text-[12px] text-muted-foreground mt-1">
          Ange rast/lunch och skicka in din arbetsdag för granskning.
        </p>
      </div>

      <div>
        <p className="text-[11px] font-semibold text-foreground/80 mb-1.5">Rast/lunch</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const active = !customMode && breakMinutes === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => { setCustomMode(false); setBreakMinutes(p); }}
                className={cn(
                  'px-3 py-1.5 rounded-lg border text-[12px] font-bold tabular-nums transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border text-foreground/80 active:bg-muted',
                )}
              >
                {p} min
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setCustomMode(true)}
            className={cn(
              'px-3 py-1.5 rounded-lg border text-[12px] font-bold transition-colors',
              customMode
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border text-foreground/80 active:bg-muted',
            )}
          >
            Eget
          </button>
        </div>
        {customMode && (
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={600}
            value={breakMinutes}
            onChange={(e) => setBreakMinutes(clampBreak(Number(e.target.value)))}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
            placeholder="Antal minuter (0–600)"
          />
        )}
      </div>

      <div>
        <p className="text-[11px] font-semibold text-foreground/80 mb-1.5">Kommentar (valfritt)</p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 1000))}
          rows={2}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
          placeholder="T.ex. avvikelse, sjukdom, övertid…"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-[12px] text-destructive">
          {error}
        </div>
      )}

      {attestBlocked && attestBlockedReason && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-[12px] text-amber-800 dark:text-amber-300">
          {attestBlockedReason}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSaving || !staffId || attestBlocked}
        className={cn(
          'w-full rounded-xl bg-primary text-primary-foreground font-extrabold py-3 text-sm',
          'flex items-center justify-center gap-2 active:opacity-80 transition-opacity',
          (isSaving || !staffId || attestBlocked) && 'opacity-60',
        )}
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Skickar in…
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Godkänn dagen
          </>
        )}
      </button>
    </section>
  );
};

export default StaffDayAttestSection;
