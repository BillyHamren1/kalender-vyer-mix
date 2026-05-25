import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Square, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { useWorkDay } from '@/hooks/useWorkDay';
import { cn } from '@/lib/utils';

/**
 * MobileWorkDayWidget — kompakt arbetsdags-kontroll i Jobs-headern.
 *
 * Tre lägen:
 *   - Ej startad    → "Starta arbetsdag"
 *   - Pågående      → "Avsluta arbetsdag" + live-räknare
 *   - Avslutad idag → "Visa tidrapport" + intervall
 *
 * Backas av useWorkDay (befintligt single-timer-API). Påverkar inte
 * Time Engine, GPS-logik, submissions eller adminflöden.
 */

const SESSION_LAST_END_KEY = 'mobile.workday.lastEnd';

interface LastEnd {
  startedAt: string;
  endedAt: string;
}

const fmtHm = (mins: number) => {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

const fmtClock = (iso: string) => {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '--:--';
  }
};

const MobileWorkDayWidget = () => {
  const navigate = useNavigate();
  const { current, isLoading, start, end } = useWorkDay();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<'start' | 'end' | null>(null);
  const [lastEnd, setLastEnd] = useState<LastEnd | null>(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_LAST_END_KEY);
      return raw ? (JSON.parse(raw) as LastEnd) : null;
    } catch {
      return null;
    }
  });

  // Live timer when day is running
  useEffect(() => {
    if (!current || current.ended_at) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [current]);

  // Track ended days for current session ("Avslutad idag" state)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ endedAtIso?: string }>).detail;
      if (current?.started_at) {
        const next: LastEnd = {
          startedAt: current.started_at,
          endedAt: detail?.endedAtIso || new Date().toISOString(),
        };
        setLastEnd(next);
        try { sessionStorage.setItem(SESSION_LAST_END_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      }
    };
    window.addEventListener('workday-ended', handler as EventListener);
    return () => window.removeEventListener('workday-ended', handler as EventListener);
  }, [current]);

  // Clear "ended" memory once a new day starts
  useEffect(() => {
    if (current && !current.ended_at && lastEnd) {
      setLastEnd(null);
      try { sessionStorage.removeItem(SESSION_LAST_END_KEY); } catch { /* ignore */ }
    }
  }, [current, lastEnd]);

  const handleStart = async () => {
    if (busy) return;
    setBusy('start');
    try { await start(); } finally { setBusy(null); }
  };

  const handleEnd = async () => {
    if (busy) return;
    setBusy('end');
    try {
      await end();
      window.dispatchEvent(new CustomEvent('workday-ended', { detail: { endedAtIso: new Date().toISOString() } }));
    } finally { setBusy(null); }
  };

  const isRunning = !!current && !current.ended_at;
  const startedAt = current?.started_at || lastEnd?.startedAt || null;
  const endedAt = lastEnd?.endedAt || null;

  let title: string;
  let status: React.ReactNode;
  let action: React.ReactNode;
  let icon: React.ReactNode;
  let toneRing: string;

  if (isRunning && startedAt) {
    const elapsedMin = Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 60_000));
    title = 'Arbetsdag pågår';
    status = (
      <>
        <span className="font-mono">Startad {fmtClock(startedAt)}</span>
        <span className="opacity-50"> · </span>
        <span className="font-mono font-semibold">{fmtHm(elapsedMin)}</span>
      </>
    );
    icon = <Clock className="w-4 h-4 text-primary-foreground" />;
    toneRing = 'ring-primary-foreground/30';
    action = (
      <button
        type="button"
        onClick={handleEnd}
        disabled={!!busy}
        className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-primary-foreground text-primary text-xs font-bold shadow-sm active:scale-95 transition-all disabled:opacity-60"
      >
        {busy === 'end' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5 fill-current" />}
        Avsluta arbetsdag
      </button>
    );
  } else if (lastEnd && startedAt && endedAt) {
    const totalMin = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000));
    title = 'Arbetsdag avslutad';
    status = (
      <>
        <span className="font-mono">{fmtClock(startedAt)}–{fmtClock(endedAt)}</span>
        <span className="opacity-50"> · </span>
        <span className="font-mono font-semibold">{fmtHm(totalMin)}</span>
      </>
    );
    icon = <CheckCircle2 className="w-4 h-4 text-primary-foreground" />;
    toneRing = 'ring-primary-foreground/20';
    action = (
      <button
        type="button"
        onClick={() => navigate('/m/report')}
        className="text-xs font-semibold text-primary-foreground/90 underline-offset-2 hover:underline px-2 h-9 active:scale-95 transition-all"
      >
        Visa tidrapport
      </button>
    );
  } else {
    title = 'Arbetsdag';
    status = <span className="opacity-80">Inte startad</span>;
    icon = <Clock className="w-4 h-4 text-primary-foreground/70" />;
    toneRing = 'ring-primary-foreground/15';
    action = (
      <button
        type="button"
        onClick={handleStart}
        disabled={!!busy || isLoading}
        className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-primary-foreground text-primary text-xs font-bold shadow-sm active:scale-95 transition-all disabled:opacity-60"
      >
        {busy === 'start' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
        Starta arbetsdag
      </button>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-xl bg-primary-foreground/10 ring-1',
        toneRing,
      )}
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-foreground/15 shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-bold text-primary-foreground leading-tight truncate">
          {title}
        </div>
        <div className="text-[11px] text-primary-foreground/80 leading-tight truncate">
          {status}
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
};

export default MobileWorkDayWidget;
