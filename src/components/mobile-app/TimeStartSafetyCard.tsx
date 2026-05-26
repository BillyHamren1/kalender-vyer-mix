/**
 * TimeStartSafetyCard — Time Debug → "Time start safety"
 *
 * Visar att tid endast kan starta från en användarinitierad timer.
 * Speglar backend-reglerna:
 *   - canGpsCreateTime är alltid false
 *   - mellan 00:00–05:00 lokal tid blockeras all auto-start
 *   - GPS får aldrig skapa currentTimeRegistration
 *
 * gpsAttemptedAutoStart sätts om något i appen försöker dispatcha
 * `gps-auto-start-attempt` (debug-signal). I produktion ska det inte hända.
 */
import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useActiveTimerStatus } from '@/hooks/useActiveTimerStatus';
import { useMobileAuth } from '@/contexts/MobileAuthContext';

type Row = { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' | 'muted' };

const toneClass = (t: Row['tone']) => {
  switch (t) {
    case 'ok': return 'text-emerald-600';
    case 'warn': return 'text-amber-600';
    case 'bad': return 'text-destructive';
    default: return 'text-foreground';
  }
};

export default function TimeStartSafetyCard() {
  const { staff } = useMobileAuth();
  const { data: timer } = useActiveTimerStatus(!!staff);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const [gpsAttemptedAutoStart, setGpsAttempted] = useState(false);
  useEffect(() => {
    const onAttempt = () => setGpsAttempted(true);
    window.addEventListener('gps-auto-start-attempt', onAttempt);
    return () => window.removeEventListener('gps-auto-start-attempt', onAttempt);
  }, []);

  const localHour = now.getHours();
  const isNightLocal = localHour >= 0 && localHour < 5;
  const activeUserStartedTimer = !!timer.timerActive;

  const autoStartBlocked = !activeUserStartedTimer; // GPS får aldrig skapa tid
  const autoStartBlockReason = !activeUserStartedTimer
    ? (isNightLocal ? 'blocked_night_auto_start_no_active_timer' : 'gps_cannot_start_time')
    : null;

  const rows: Row[] = useMemo(() => [
    { label: 'activeUserStartedTimer', value: String(activeUserStartedTimer), tone: activeUserStartedTimer ? 'ok' : 'muted' },
    { label: 'gpsAttemptedAutoStart', value: String(gpsAttemptedAutoStart), tone: gpsAttemptedAutoStart ? 'warn' : 'muted' },
    { label: 'autoStartBlocked', value: String(autoStartBlocked), tone: autoStartBlocked ? 'ok' : 'bad' },
    { label: 'autoStartBlockReason', value: autoStartBlockReason ?? '—', tone: autoStartBlockReason ? 'ok' : 'muted' },
    { label: 'isNightLocal', value: String(isNightLocal), tone: isNightLocal ? 'warn' : 'muted' },
    { label: 'localHour', value: String(localHour), tone: 'muted' },
    { label: 'timerStartedByUserAt', value: timer.startedAt ?? '—', tone: timer.startedAt ? 'ok' : 'muted' },
    { label: 'canGpsCreateTime', value: 'false', tone: 'ok' },
  ], [activeUserStartedTimer, gpsAttemptedAutoStart, autoStartBlocked, autoStartBlockReason, isNightLocal, localHour, timer.startedAt]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-md">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl bg-primary/10">
          <ShieldCheck className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-foreground">Tidsstartsäkerhet</h3>
          <p className="text-[11px] text-muted-foreground">
            Endast användarstartad timer får skapa tid. GPS klassificerar — startar aldrig.
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-muted/40 border border-border/60 divide-y divide-border/60">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between px-3 py-2 text-[12px]">
            <span className="text-muted-foreground font-mono">{r.label}</span>
            <span className={`font-mono font-medium ${toneClass(r.tone)}`}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
