/**
 * StaffDayAttestSection — bottom action inside StaffDayDetailSheet.
 *
 * I normalflödet får användaren ENDAST justera tre saker:
 *   1. Starttid (HH:mm, Europe/Stockholm)
 *   2. Sluttid  (HH:mm, Europe/Stockholm)
 *   3. Rast/lunch (minuter)
 *
 * Allt skickas in via attest-staff-day. INGA writes till workdays/time_reports/
 * location_time_entries/travel_time_logs sker härifrån — endast day_attestations
 * (inkl. metadata: userRequestedStartAt / userRequestedEndAt).
 *
 * Tre states:
 *   1. Open workday   → "Avsluta arbetsdagen först."
 *   2. Locked/approved → read-only
 *   3. Ended (eller pågående utan endedAt men användaren har avslutat) →
 *      Justera-formulär + "Skicka in dagen".
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Lock, CheckCircle2, Loader2, AlertCircle, Sun, Moon, Coffee, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAttestStaffDay } from '@/hooks/useAttestStaffDay';
import type { StaffDaySnapshot } from '@/hooks/useStaffDaySnapshot';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';

const PRESETS = [0, 30, 45, 60] as const;
const TZ = 'Europe/Stockholm';

interface Props {
  staffId: string | null;
  date: string;
  snapshot: StaffDaySnapshot;
  attestBlocked?: boolean;
  attestBlockedReason?: string;
}

function clampBreak(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(600, Math.round(n)));
}

/** Offset i minuter mellan Europe/Stockholm-lokal tid och UTC vid `utc`. */
function stockholmOffsetMinutes(utc: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(utc).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value; return acc;
  }, {});
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUTC - utc.getTime()) / 60000);
}

/** "YYYY-MM-DD" + "HH:mm" (Stockholm-lokal) → ISO-sträng (UTC). */
function stockholmHmToIso(date: string, hm: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(hm)) return null;
  const [h, m] = hm.split(':').map(Number);
  const y = Number(date.slice(0, 4));
  const mo = Number(date.slice(5, 7)) - 1;
  const d = Number(date.slice(8, 10));
  let guess = Date.UTC(y, mo, d, h, m, 0);
  let offset = stockholmOffsetMinutes(new Date(guess));
  let actual = guess - offset * 60000;
  offset = stockholmOffsetMinutes(new Date(actual));
  actual = guess - offset * 60000;
  return new Date(actual).toISOString();
}

const StaffDayAttestSection: React.FC<Props> = ({
  staffId, date, snapshot, attestBlocked, attestBlockedReason,
}) => {
  const wd = snapshot.workday;
  const att = snapshot.attestation ?? null;

  const isOpen = !!wd?.isOpen;
  const isApproved = !!wd?.approved;
  const isLocked = !!att?.locked;
  const isAttested = att?.status === 'attested';

  // ── Förifyll start/sluttid ─────────────────────────────────────────
  const segments = snapshot.segments ?? [];
  const firstSegStart = segments[0]?.startedAt ?? null;
  const lastSegEnd = (() => {
    for (let i = segments.length - 1; i >= 0; i--) {
      const s = segments[i];
      if (s.endedAt) return s.endedAt;
    }
    return null;
  })();

  const initialStartIso =
    att?.requestedStartAt ?? wd?.startedAt ?? firstSegStart ?? null;
  const initialEndIso =
    att?.requestedEndAt ?? wd?.endedAt ?? lastSegEnd ?? null;

  const initialStartHm = initialStartIso ? formatStockholmHm(initialStartIso) : '';
  const initialEndHm = initialEndIso ? formatStockholmHm(initialEndIso) : '';

  const [startHm, setStartHm] = useState<string>(initialStartHm);
  const [endHm, setEndHm] = useState<string>(initialEndHm);

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

  // Resync at snapshot refresh
  useEffect(() => {
    setBreakMinutes(initialBreak);
    setCustomMode(!PRESETS.includes(initialBreak as typeof PRESETS[number]));
    setComment(att?.comment ?? '');
    setStartHm(initialStartHm);
    setEndHm(initialEndHm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBreak, att?.comment, initialStartHm, initialEndHm]);

  const { attestDay, isSaving, error } = useAttestStaffDay();

  // ── State 1: aktiv/öppen workday — kräv stopp först ─────────────────
  // Notera: !wd ensamt är INTE skäl att blockera. Tom dag (ingen Time
  // Engine-data) ska kunna fyllas i manuellt så länge datumet är idag
  // eller tidigare.
  const todayLocal = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());
  const isFutureDate = date > todayLocal;
  if (wd && isOpen) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2 text-amber-800 dark:text-amber-300">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <p className="text-xs font-semibold">
          Avsluta arbetsdagen först — sedan kan du justera och skicka in.
        </p>
      </div>
    );
  }
  if (!wd && isFutureDate) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-start gap-2 text-muted-foreground">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <p className="text-xs font-semibold">
          Framtida datum — du kan rapportera dagen tidigast samma dag.
        </p>
      </div>
    );
  }

  // ── State 2: låst/godkänd ───────────────────────────────────────────
  if (isApproved || isLocked) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-start gap-2 text-emerald-700 dark:text-emerald-400">
        <Lock className="w-4 h-4 shrink-0 mt-0.5" />
        <p className="text-xs font-semibold">Dagen är godkänd och låst.</p>
      </div>
    );
  }

  // ── State 2b: redan inskickad, väntar på admin ──────────────────────
  if (isAttested && !success) {
    return (
      <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <p className="text-sm font-extrabold">Inskickad – väntar på godkännande</p>
        </div>
        <div className="text-[12px] text-foreground/80 space-y-1 tabular-nums">
          {att?.requestedStartAt && (
            <p><span className="font-semibold">Start:</span> {formatStockholmHm(att.requestedStartAt)}</p>
          )}
          {att?.requestedEndAt && (
            <p><span className="font-semibold">Slut:</span> {formatStockholmHm(att.requestedEndAt)}</p>
          )}
          <p><span className="font-semibold">Rast/lunch:</span> {clampBreak(att?.breakMinutes ?? 0)} min</p>
          {att?.comment && (
            <p><span className="font-semibold">Kommentar:</span> {att.comment}</p>
          )}
          <p className="text-[11px] text-muted-foreground pt-1">
            Behöver du ändra något? Använd "Begär korrigering" nedan.
          </p>
        </div>
      </section>
    );
  }

  // ── State 3: justera + skicka in ────────────────────────────────────
  const validate = (): string | null => {
    if (!startHm) return 'Ange starttid.';
    if (!endHm) return 'Ange sluttid.';
    const startIso = stockholmHmToIso(date, startHm);
    const endIso = stockholmHmToIso(date, endHm);
    if (!startIso || !endIso) return 'Ogiltig tid.';
    const startMs = Date.parse(startIso);
    const endMs = Date.parse(endIso);
    if (startMs >= endMs) {
      return 'Starttid måste vara före sluttid.';
    }
    // Sluttid får inte vara i framtiden om datumet är idag
    const todayLocal = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ })
      .format(new Date());
    if (date === todayLocal && endMs > Date.now()) {
      return 'Sluttid kan inte ligga i framtiden.';
    }
    if (!Number.isFinite(breakMinutes) || breakMinutes < 0) {
      return 'Rast måste vara 0 min eller mer.';
    }
    return null;
  };


  const localError = validate();

  const handleSubmit = async () => {
    if (!staffId) return;
    if (localError) return;
    const requestedStartAt = stockholmHmToIso(date, startHm);
    const requestedEndAt = stockholmHmToIso(date, endHm);
    try {
      await attestDay({
        staffId,
        date,
        breakMinutes: clampBreak(breakMinutes),
        comment: comment.trim() ? comment.trim() : null,
        requestedStartAt,
        requestedEndAt,
      });
      setSuccess(true);
    } catch {
      /* ytrad i hooks error */
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
    <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Justera dagen
        </p>
        <p className="text-[12px] text-muted-foreground mt-1">
          Du kan justera starttid, sluttid och rast. Övriga uppgifter kvarstår
          som systemets förslag — admin/lön godkänner senare.
        </p>
      </div>

      {/* Start / Slut */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-foreground/80 mb-1.5 flex items-center gap-1">
            <Sun className="w-3.5 h-3.5 text-primary" /> Starttid
          </label>
          <input
            type="time"
            value={startHm}
            onChange={(e) => setStartHm(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
          />
          {initialStartIso && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Förslag: {formatStockholmHm(initialStartIso)}
            </p>
          )}
        </div>
        <div>
          <label className="text-[11px] font-semibold text-foreground/80 mb-1.5 flex items-center gap-1">
            <Moon className="w-3.5 h-3.5 text-primary" /> Sluttid
          </label>
          <input
            type="time"
            value={endHm}
            onChange={(e) => setEndHm(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
          />
          {initialEndIso && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Förslag: {formatStockholmHm(initialEndIso)}
            </p>
          )}
        </div>
      </div>

      {/* Rast/lunch */}
      <div>
        <p className="text-[11px] font-semibold text-foreground/80 mb-1.5 flex items-center gap-1">
          <Coffee className="w-3.5 h-3.5 text-primary" /> Rast/lunch
        </p>
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

      {/* Kommentar (valfri, kort) */}
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

      {(localError || error) && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-[12px] text-destructive">
          {localError ?? error}
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
        disabled={isSaving || !staffId || attestBlocked || !!localError}
        className={cn(
          'w-full rounded-xl bg-primary text-primary-foreground font-extrabold py-3 text-sm',
          'flex items-center justify-center gap-2 active:opacity-80 transition-opacity',
          (isSaving || !staffId || attestBlocked || !!localError) && 'opacity-60',
        )}
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Skickar in…
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Skicka in dagen
          </>
        )}
      </button>
      <p className="text-[10px] text-muted-foreground text-center">
        Admin/lön godkänner och låser dagen i ett senare steg.
      </p>
    </section>
  );
};

export default StaffDayAttestSection;
