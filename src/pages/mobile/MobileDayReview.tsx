/**
 * MobileDayReview — Review-vy + ÅTGÄRDER för dagavstämning.
 *
 * Visar workdays för senaste 7 dagar och tillåter användaren att rätta
 * dagen i efterhand via centrala flöden (useDayReviewActions):
 *   1. Starta arbete från arrival-tid       (event_type='arrival')
 *   2. Starta arbete nu                     (event_type='arrival')
 *   3. Avsluta vid departure-tid            (event_type='departure')
 *   4. Avsluta arbetsdag vid hemkomst       (event_type='home_arrival')
 *   5. Justera/registrera restid            (per travel_time_log)
 *   6. Markera event som irrelevant         (alla event-typer)
 *   7. Godkänn dagen                        (per workday)
 *
 * Hittas via clipboard-knappen i MobileJobs-headern (badge med antal
 * needs_review).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Clock,
  Plane, Play, Square, Home, X, Check,
} from 'lucide-react';
import { format } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { mobileApi } from '@/services/mobileApiService';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';
import { useDayReviewActions } from '@/hooks/useDayReviewActions';

type ReviewWorkday = Awaited<ReturnType<typeof mobileApi.listWorkdaysReview>>['workdays'][number];
type ReviewEvent = ReviewWorkday['events_for_day'][number];
type ReviewTravel = ReviewWorkday['travels_for_day'][number];

const REASON_LABELS: Record<string, string> = {
  open_assistant_events: 'Öppna händelser i kön',
  stale_review_events: 'Gamla händelser kvar att granska',
  missing_end: 'Dagen saknar slut',
  unresolved_travel: 'Oklara resor',
  missed_prompts_all_day: 'Många missade prompts',
};

const STATUS_STYLE: Record<ReviewWorkday['review_status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  needs_review: 'bg-destructive/15 text-destructive',
  ready: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  approved: 'bg-primary/15 text-primary',
};

const STATUS_LABEL: Record<ReviewWorkday['review_status'], string> = {
  draft: 'Pågår',
  needs_review: 'Behöver granskas',
  ready: 'Klar',
  approved: 'Godkänd',
};

export default function MobileDayReview() {
  const navigate = useNavigate();
  const { locale } = useLanguage();
  const actions = useDayReviewActions();
  const [workdays, setWorkdays] = useState<ReviewWorkday[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [busyWorkdayId, setBusyWorkdayId] = useState<string | null>(null);

  const load = async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true); else setRefreshing(true);
    try {
      const res = await mobileApi.listWorkdaysReview({ days: 7 });
      setWorkdays(res.workdays || []);
    } catch (err) {
      console.error('[DayReview] load failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(true); }, []);

  const runEventAction = async (eventId: string, fn: () => Promise<void>) => {
    setBusyEventId(eventId);
    try { await fn(); await load(false); } finally { setBusyEventId(null); }
  };
  const runWorkdayAction = async (workdayId: string, fn: () => Promise<void>) => {
    setBusyWorkdayId(workdayId);
    try { await fn(); await load(false); } finally { setBusyWorkdayId(null); }
  };

  const dateFmt = (iso: string) => format(new Date(iso), 'EEE d MMM', { locale: locale === 'sv' ? sv : enUS });
  const timeFmt = (iso: string | null) => iso ? format(new Date(iso), 'HH:mm') : '—';
  const todayKey = new Date().toISOString().slice(0, 10);
  const yesterdayKey = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const labelForDayKey = (key: string) => key === todayKey ? 'Idag' : key === yesterdayKey ? 'Igår' : null;

  return (
    <div className="flex flex-col min-h-screen bg-background pb-12">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 active:opacity-60">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-base font-semibold">Dagavstämning</h1>
          <button onClick={() => load(false)} className="p-2 -mr-2 active:opacity-60" aria-label="Uppdatera">
            <RefreshCw className={cn('w-5 h-5 text-muted-foreground', refreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : workdays.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-3" />
          <p className="text-sm text-muted-foreground">Inga arbetsdagar att granska de senaste 7 dagarna.</p>
        </div>
      ) : (
        <div className="px-4 py-4 space-y-3">
          {workdays.map((wd) => {
            const dayLabel = labelForDayKey(wd.day_key);
            const reasonChips = (wd.review_reasons || []).filter((r) => REASON_LABELS[r]);
            const total = wd.counts.open_events + wd.counts.stale_review_events + wd.counts.open_travel;
            const wdBusy = busyWorkdayId === wd.id;
            return (
              <div key={wd.id} className={cn(
                'rounded-2xl border bg-card p-4 shadow-sm',
                wd.review_status === 'needs_review' && 'border-destructive/30',
              )}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      {dayLabel || dateFmt(wd.started_at)}
                    </div>
                    <div className="text-base font-semibold mt-0.5">
                      {timeFmt(wd.started_at)} – {timeFmt(wd.ended_at)}
                    </div>
                  </div>
                  <span className={cn('text-[11px] font-semibold uppercase px-2 py-1 rounded-full', STATUS_STYLE[wd.review_status])}>
                    {STATUS_LABEL[wd.review_status]}
                  </span>
                </div>

                {total > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {wd.counts.open_events > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-destructive/10 text-destructive">
                        <AlertTriangle className="w-3 h-3" />{wd.counts.open_events} öppna händelser
                      </span>
                    )}
                    {wd.counts.stale_review_events > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400">
                        <Clock className="w-3 h-3" />{wd.counts.stale_review_events} gamla att granska
                      </span>
                    )}
                    {wd.counts.open_travel > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400">
                        <Plane className="w-3 h-3" />{wd.counts.open_travel} oklar resa
                      </span>
                    )}
                  </div>
                )}

                {reasonChips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {reasonChips.map((r) => (
                      <span key={r} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {REASON_LABELS[r]}
                      </span>
                    ))}
                  </div>
                )}

                {wd.events_for_day.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Händelser</div>
                    {wd.events_for_day.map((ev) => (
                      <EventRow
                        key={ev.id}
                        ev={ev}
                        busy={busyEventId === ev.id}
                        onStartFromArrival={() => runEventAction(ev.id, () => actions.startWorkFromArrival(ev as any))}
                        onStartNow={() => runEventAction(ev.id, () => actions.startWorkNow(ev as any))}
                        onEndAtDeparture={() => runEventAction(ev.id, () => actions.endActivityAtDeparture(ev as any))}
                        onEndDayAtHome={() => runEventAction(ev.id, () => actions.endWorkDayAtHomeArrival(ev as any))}
                        onDismiss={() => runEventAction(ev.id, () => actions.dismissEvent(ev.id))}
                      />
                    ))}
                  </div>
                )}

                {wd.travels_for_day.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resor</div>
                    {wd.travels_for_day.map((tr) => (
                      <TravelRow
                        key={tr.id}
                        tr={tr}
                        onAdjust={(start, end) =>
                          runWorkdayAction(wd.id, () => actions.adjustTravel({ travel_log_id: tr.id, start_time: start, end_time: end }))
                        }
                      />
                    ))}
                  </div>
                )}

                {wd.review_status !== 'approved' && (
                  <button
                    disabled={wdBusy}
                    onClick={() => runWorkdayAction(wd.id, () => actions.approveWorkday(wd.id))}
                    className="mt-4 w-full py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] bg-primary text-primary-foreground disabled:opacity-50"
                  >
                    {wdBusy ? (
                      <Loader2 className="w-4 h-4 animate-spin inline" />
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <Check className="w-4 h-4" /> Godkänn dagen
                      </span>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface EventRowProps {
  ev: ReviewEvent;
  busy: boolean;
  onStartFromArrival: () => void;
  onStartNow: () => void;
  onEndAtDeparture: () => void;
  onEndDayAtHome: () => void;
  onDismiss: () => void;
}

function EventRow({ ev, busy, onStartFromArrival, onStartNow, onEndAtDeparture, onEndDayAtHome, onDismiss }: EventRowProps) {
  const time = format(new Date(ev.happened_at), 'HH:mm');
  return (
    <div className="rounded-lg border bg-background/40 p-2.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono font-semibold">{time}</span>
        <span className="font-medium uppercase text-[10px] text-muted-foreground">{ev.event_type}</span>
        <span className="truncate flex-1">{ev.target_label || '—'}</span>
        {ev.stale_for_prompt && <span className="text-[10px] uppercase text-amber-600">stale</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {ev.event_type === 'arrival' && (
          <>
            <ActionButton onClick={onStartFromArrival} disabled={busy} icon={<Play className="w-3 h-3" />}>Starta från {time}</ActionButton>
            <ActionButton onClick={onStartNow} disabled={busy} variant="muted" icon={<Play className="w-3 h-3" />}>Starta nu</ActionButton>
          </>
        )}
        {ev.event_type === 'departure' && (
          <ActionButton onClick={onEndAtDeparture} disabled={busy} icon={<Square className="w-3 h-3" />}>Avsluta vid {time}</ActionButton>
        )}
        {ev.event_type === 'home_arrival' && (
          <ActionButton onClick={onEndDayAtHome} disabled={busy} icon={<Home className="w-3 h-3" />}>Avsluta dagen vid {time}</ActionButton>
        )}
        <ActionButton onClick={onDismiss} disabled={busy} variant="ghost" icon={<X className="w-3 h-3" />}>Irrelevant</ActionButton>
        {busy && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground self-center ml-1" />}
      </div>
    </div>
  );
}

interface TravelRowProps {
  tr: ReviewTravel;
  onAdjust: (start_iso: string, end_iso?: string) => void;
}

function TravelRow({ tr, onAdjust }: TravelRowProps) {
  const [editing, setEditing] = useState(false);
  const [startVal, setStartVal] = useState(toLocalInput(tr.start_time));
  const [endVal, setEndVal] = useState(tr.end_time ? toLocalInput(tr.end_time) : '');

  const submit = () => {
    if (!startVal) return;
    onAdjust(new Date(startVal).toISOString(), endVal ? new Date(endVal).toISOString() : undefined);
    setEditing(false);
  };

  return (
    <div className="rounded-lg border bg-background/40 p-2.5">
      <div className="flex items-center gap-2 text-xs">
        <Plane className="w-3 h-3 shrink-0 text-muted-foreground" />
        <span className="font-mono">
          {format(new Date(tr.start_time), 'HH:mm')} – {tr.end_time ? format(new Date(tr.end_time), 'HH:mm') : 'pågår'}
        </span>
        {tr.classification && <span className="text-[10px] uppercase text-muted-foreground">{tr.classification}</span>}
        <button onClick={() => setEditing((v) => !v)} className="ml-auto text-[11px] text-primary">
          {editing ? 'Avbryt' : 'Justera'}
        </button>
      </div>
      {editing && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-[10px] text-muted-foreground flex flex-col">
            Start
            <input type="datetime-local" value={startVal} onChange={(e) => setStartVal(e.target.value)} className="text-xs px-2 py-1 rounded border bg-background" />
          </label>
          <label className="text-[10px] text-muted-foreground flex flex-col">
            Slut
            <input type="datetime-local" value={endVal} onChange={(e) => setEndVal(e.target.value)} className="text-xs px-2 py-1 rounded border bg-background" />
          </label>
          <button onClick={submit} className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground">Spara</button>
        </div>
      )}
    </div>
  );
}

interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  variant?: 'primary' | 'muted' | 'ghost';
  children: React.ReactNode;
}

function ActionButton({ onClick, disabled, icon, variant = 'primary', children }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-md transition-all active:scale-95 disabled:opacity-40',
        variant === 'primary' && 'bg-primary/10 text-primary hover:bg-primary/15',
        variant === 'muted' && 'bg-muted text-foreground hover:bg-muted/80',
        variant === 'ghost' && 'text-muted-foreground hover:bg-muted/50',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
