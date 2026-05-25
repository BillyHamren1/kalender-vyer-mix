// Legacy mobile time UI. Do not use for Time v2.
/**
 * MobileDayReview — Review-entrypoint för dagavstämning.
 *
 * Visar dagar (riktiga workdays + syntetiska för dagar utan workday) och
 * låter användaren rätta dem direkt via useDayReviewActions.
 *
 * Per event visas endast actions som matchar event_type:
 *   • arrival              → Starta från ankomst, Starta nu, Irrelevant
 *   • departure            → Avsluta vid avgång, Irrelevant
 *   • home_arrival         → Avsluta dagen vid hemkomst, Irrelevant
 *   • travel_*             → Justera restid (öppen resa), Irrelevant
 *   • övriga               → Endast Irrelevant
 *
 * Hittas via knappen i MobileJobs-headern (badge med antal needs_review).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Clock, MapPin, Plane,
  PlayCircle, StopCircle, HomeIcon, X as XIcon, Check, Coffee, ArrowRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { mobileApi, type MobileTimeReport } from '@/services/mobileApiService';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';
import { useDayReviewActions } from '@/hooks/useDayReviewActions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { computeDayGaps, filterUnresolvedGaps, type DayGap } from '@/lib/dayGaps';

type ReviewWorkday = Awaited<ReturnType<typeof mobileApi.listWorkdaysReview>>['workdays'][number];
type ReviewEvent = ReviewWorkday['events_for_day'][number];

const REASON_LABELS: Record<string, string> = {
  open_assistant_events: 'Öppna händelser i kön',
  stale_review_events: 'Gamla händelser kvar att granska',
  missing_end: 'Dagen saknar slut',
  unresolved_travel: 'Oklara resor',
  missed_prompts_all_day: 'Många missade prompts',
  no_workday_started: 'Ingen arbetsdag startades',
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

/** Vilka actions som passar givet event_type. */
function actionsForEvent(ev: ReviewEvent): {
  startFromArrival: boolean;
  startNow: boolean;
  endAtDeparture: boolean;
  endDayAtHome: boolean;
  adjustTravel: boolean;
} {
  const t = (ev.event_type || '').toLowerCase();
  const isArrival = t.includes('arrival') && !t.includes('home');
  const isDeparture = t.includes('departure') || t.includes('exit');
  const isHome = t.includes('home');
  const isTravel = t.includes('travel');
  return {
    startFromArrival: isArrival,
    startNow: isArrival,
    endAtDeparture: isDeparture,
    endDayAtHome: isHome,
    adjustTravel: isTravel,
  };
}

export default function MobileDayReview() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusDayKey = searchParams.get('day');
  const { locale } = useLanguage();
  const [workdays, setWorkdays] = useState<ReviewWorkday[]>([]);
  const [timeReports, setTimeReports] = useState<MobileTimeReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [busyDayId, setBusyDayId] = useState<string | null>(null);
  const [busyGapKey, setBusyGapKey] = useState<string | null>(null);
  /** key → minutes-input for "Justera minuter" mode. */
  const [gapMinuteEdits, setGapMinuteEdits] = useState<Record<string, string>>({});
  /** Force-rerender helper after we mutate localStorage gap-resolutions. */
  const [resolvedTick, setResolvedTick] = useState(0);
  const [highlightedDayKey, setHighlightedDayKey] = useState<string | null>(null);
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const actions = useDayReviewActions();

  const load = async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true); else setRefreshing(true);
    try {
      const [reviewRes, reportsRes] = await Promise.all([
        mobileApi.listWorkdaysReview({ days: 7 }),
        mobileApi.getTimeReports().catch(() => ({ time_reports: [] as MobileTimeReport[] })),
      ]);
      setWorkdays(reviewRes.workdays || []);
      setTimeReports(reportsRes.time_reports || []);
    } catch (err) {
      console.error('[DayReview] load failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(true); }, []);

  // Scroll/highlight requested day after load.
  useEffect(() => {
    if (loading || !focusDayKey || workdays.length === 0) return;
    const match = workdays.find((w) => w.day_key === focusDayKey);
    if (!match) return; // ogiltig/borta dag → tyst fallback (visa hela listan)
    setHighlightedDayKey(match.day_key);
    const el = dayRefs.current[match.day_key];
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    const t = window.setTimeout(() => setHighlightedDayKey(null), 2400);
    return () => window.clearTimeout(t);
  }, [loading, focusDayKey, workdays]);

  const runEventAction = async (
    ev: ReviewEvent,
    fn: () => Promise<void>,
  ) => {
    if (busyEventId) return;
    setBusyEventId(ev.id);
    try {
      await fn();
      await load(false);
    } finally {
      setBusyEventId(null);
    }
  };

  /**
   * Wrap any gap action with busy-state and force a re-render so locally
   * resolved gaps disappear immediately. We only re-fetch the server list
   * when the action actually creates a travel_time_log.
   */
  const runGapAction = async (gapKey: string, fn: () => Promise<void>, refetch = false) => {
    if (busyGapKey) return;
    setBusyGapKey(gapKey);
    try {
      await fn();
      setResolvedTick((n) => n + 1);
      if (refetch) await load(false);
    } finally {
      setBusyGapKey(null);
    }
  };

  const handleApprove = async (wd: ReviewWorkday) => {
    if (busyDayId) return;
    if ((wd as any).synthetic) return; // syntetisk dag kan inte godkännas direkt
    setBusyDayId(wd.id);
    try {
      await actions.approveWorkday(wd.id);
      await load(false);
    } finally {
      setBusyDayId(null);
    }
  };

  const dateFmt = (iso: string) => format(new Date(iso), 'EEE d MMM', { locale: locale === 'sv' ? sv : enUS });
  const timeFmt = (iso: string | null) => iso ? format(new Date(iso), 'HH:mm') : '—';

  const todayKey = new Date().toISOString().slice(0, 10);
  const yesterdayKey = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const labelForDayKey = (key: string) => {
    if (key === todayKey) return 'Idag';
    if (key === yesterdayKey) return 'Igår';
    return null;
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-12">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 active:opacity-60">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-base font-semibold">Dagavstämning</h1>
          <button
            onClick={() => load(false)}
            className="p-2 -mr-2 active:opacity-60"
            aria-label="Uppdatera"
          >
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
          <p className="text-sm text-muted-foreground">
            Inga arbetsdagar att granska de senaste 7 dagarna.
          </p>
        </div>
      ) : (
        <div className="px-4 py-4 space-y-3">
          {workdays.map((wd) => {
            const dayLabel = labelForDayKey(wd.day_key);
            const total = wd.counts.open_events + wd.counts.stale_review_events + wd.counts.open_travel;
            const reasonChips = (wd.review_reasons || []).filter((r) => REASON_LABELS[r]);
            const isSynthetic = (wd as any).synthetic === true;
            // Inkludera olösta gap i godkänn-spärren så användaren tvingas
            // ta ställning till varje osäker restid innan dagen kan stängas.
            void resolvedTick;
            const unresolvedGapCount = filterUnresolvedGaps(
              computeDayGaps(timeReports, wd.travels_for_day, wd.day_key),
            ).length;
            const canApprove = !isSynthetic
              && (wd.review_status === 'ready' || wd.review_status === 'needs_review')
              && total === 0
              && unresolvedGapCount === 0;
            const isHighlighted = highlightedDayKey === wd.day_key;
            return (
              <div
                key={wd.id}
                ref={(el) => { dayRefs.current[wd.day_key] = el; }}
                data-day-key={wd.day_key}
                className={cn(
                  'rounded-2xl border bg-card p-4 shadow-sm transition-all',
                  wd.review_status === 'needs_review' && 'border-destructive/30',
                  isHighlighted && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                )}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      {dayLabel || dateFmt(wd.started_at)}
                    </div>
                    <div className="text-base font-semibold mt-0.5">
                      {isSynthetic
                        ? 'Ingen arbetsdag startad'
                        : `${timeFmt(wd.started_at)} – ${timeFmt(wd.ended_at)}`}
                    </div>
                  </div>
                  <span className={cn('text-[11px] font-semibold uppercase px-2 py-1 rounded-full', STATUS_STYLE[wd.review_status])}>
                    {STATUS_LABEL[wd.review_status]}
                  </span>
                </div>

                {/* Counts row */}
                {total > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {wd.counts.open_events > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-destructive/10 text-destructive">
                        <AlertTriangle className="w-3 h-3" />
                        {wd.counts.open_events} öppna händelser
                      </span>
                    )}
                    {wd.counts.stale_review_events > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400">
                        <Clock className="w-3 h-3" />
                        {wd.counts.stale_review_events} gamla att granska
                      </span>
                    )}
                    {wd.counts.open_travel > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400">
                        <Plane className="w-3 h-3" />
                        {wd.counts.open_travel} oklar resa
                      </span>
                    )}
                  </div>
                )}

                {/* Reason chips */}
                {reasonChips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {reasonChips.map((r) => (
                      <span key={r} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {REASON_LABELS[r]}
                      </span>
                    ))}
                  </div>
                )}

                {/* Events with actions */}
                {wd.events_for_day.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Händelser ({wd.events_for_day.length})
                    </div>
                    <ul className="space-y-2">
                      {wd.events_for_day.slice(0, 12).map((ev) => {
                        const av = actionsForEvent(ev);
                        const busy = busyEventId === ev.id;
                        const anyAction = av.startFromArrival || av.startNow || av.endAtDeparture || av.endDayAtHome || av.adjustTravel;
                        return (
                          <li key={ev.id} className="rounded-lg border bg-background/40 p-2.5">
                            <div className="flex items-center gap-2 text-xs">
                              <MapPin className="w-3 h-3 shrink-0 text-muted-foreground" />
                              <span className="font-mono text-muted-foreground">{format(new Date(ev.happened_at), 'HH:mm')}</span>
                              <span className="font-medium text-foreground">{ev.event_type}</span>
                              <span className="truncate text-muted-foreground">{ev.target_label || '—'}</span>
                              {ev.stale_for_prompt && (
                                <span className="ml-auto text-[10px] uppercase text-amber-600">stale</span>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {av.startFromArrival && (
                                <Button
                                  size="sm" variant="default" disabled={busy}
                                  onClick={() => runEventAction(ev, () => actions.startWorkFromArrival(ev as any))}
                                >
                                  <PlayCircle className="w-3.5 h-3.5 mr-1" />
                                  Starta från {format(new Date(ev.happened_at), 'HH:mm')}
                                </Button>
                              )}
                              {av.startNow && (
                                <Button
                                  size="sm" variant="outline" disabled={busy}
                                  onClick={() => runEventAction(ev, () => actions.startWorkNow(ev as any))}
                                >
                                  <PlayCircle className="w-3.5 h-3.5 mr-1" />
                                  Starta nu
                                </Button>
                              )}
                              {av.endAtDeparture && (
                                <Button
                                  size="sm" variant="default" disabled={busy}
                                  onClick={() => runEventAction(ev, () => actions.endActivityAtDeparture(ev as any))}
                                >
                                  <StopCircle className="w-3.5 h-3.5 mr-1" />
                                  Avsluta vid {format(new Date(ev.happened_at), 'HH:mm')}
                                </Button>
                              )}
                              {av.endDayAtHome && (
                                <Button
                                  size="sm" variant="default" disabled={busy}
                                  onClick={() => runEventAction(ev, () => actions.endWorkDayAtHomeArrival(ev as any))}
                                >
                                  <HomeIcon className="w-3.5 h-3.5 mr-1" />
                                  Avsluta arbetspass ({format(new Date(ev.happened_at), 'HH:mm')})
                                </Button>
                              )}
                              {av.adjustTravel && (
                                <Button
                                  size="sm" variant="outline" disabled={busy}
                                  onClick={() => runEventAction(ev, () => actions.adjustTravel({
                                    travel_log_id: (ev as any).linked_travel_log_id || undefined,
                                    start_time: ev.happened_at,
                                    end_time: new Date().toISOString(),
                                  }))}
                                >
                                  <Plane className="w-3.5 h-3.5 mr-1" />
                                  Registrera restid
                                </Button>
                              )}
                              <Button
                                size="sm" variant="ghost" disabled={busy}
                                onClick={() => runEventAction(ev, () => actions.dismissEvent(ev.id))}
                              >
                                <XIcon className="w-3.5 h-3.5 mr-1" />
                                Irrelevant
                              </Button>
                              {!anyAction && (
                                <span className="text-[11px] text-muted-foreground self-center">
                                  Inga automatiska åtgärder för denna typ
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* === Osäkra restidsgap (gap-modellen) ===
                    Visar gap mellan två aktiviteter samma dag som inte
                    redan täcks av en travel_time_log. Användaren får 4
                    explicita val: registrera restid, justera minuter,
                    markera paus/privat, eller ignorera. */}
                {(() => {
                  // resolvedTick i deps via closure tvingar omräkning efter mark.
                  void resolvedTick;
                  const allGaps = computeDayGaps(timeReports, wd.travels_for_day, wd.day_key);
                  const gaps = filterUnresolvedGaps(allGaps);
                  if (gaps.length === 0) return null;
                  return (
                    <div className="mt-3 space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Osäkra restidsgap ({gaps.length})
                      </div>
                      <ul className="space-y-2">
                        {gaps.map((gap: DayGap) => {
                          const busy = busyGapKey === gap.key;
                          const editValue = gapMinuteEdits[gap.key] ?? '';
                          const minutesNum = Number(editValue);
                          const editValid = editValue !== '' && Number.isFinite(minutesNum)
                            && minutesNum >= 1 && minutesNum <= gap.gapMinutes;
                          return (
                            <li key={gap.key} className={cn(
                              'rounded-lg border bg-background/40 p-2.5',
                              gap.kind === 'needs_review' && 'border-amber-500/40',
                            )}>
                              <div className="flex items-center gap-2 text-xs flex-wrap">
                                <Plane className="w-3 h-3 shrink-0 text-muted-foreground" />
                                <span className="font-medium truncate max-w-[40%]">{gap.prevLabel}</span>
                                <span className="font-mono text-muted-foreground">
                                  {format(new Date(gap.startIso), 'HH:mm')}
                                </span>
                                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                <span className="font-medium truncate max-w-[40%]">{gap.nextLabel}</span>
                                <span className="font-mono text-muted-foreground">
                                  {format(new Date(gap.endIso), 'HH:mm')}
                                </span>
                                <span className={cn(
                                  'ml-auto text-[10px] uppercase px-1.5 py-0.5 rounded',
                                  gap.kind === 'needs_review'
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                    : 'bg-muted text-muted-foreground',
                                )}>
                                  {gap.gapMinutes} min
                                </span>
                              </div>

                              <p className="text-[11px] text-muted-foreground mt-1.5">
                                Du avslutade {gap.prevLabel} {format(new Date(gap.startIso), 'HH:mm')}
                                {' '}och startade {gap.nextLabel} {format(new Date(gap.endIso), 'HH:mm')}.
                                {gap.kind === 'needs_review' && ' Långt gap — kontrollera att detta verkligen är restid.'}
                              </p>

                              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                <Button
                                  size="sm" variant="default" disabled={busy}
                                  onClick={() => runGapAction(gap.key, () => actions.createTravelForGap({
                                    gapKey: gap.key,
                                    start_time: gap.startIso,
                                    end_time: gap.endIso,
                                  }), true)}
                                >
                                  <Plane className="w-3.5 h-3.5 mr-1" />
                                  Registrera restid
                                </Button>
                                <Button
                                  size="sm" variant="outline" disabled={busy || !editValid}
                                  onClick={() => runGapAction(gap.key, () => actions.createTravelForGap({
                                    gapKey: gap.key,
                                    start_time: gap.startIso,
                                    end_time: gap.endIso,
                                    durationMinutesOverride: minutesNum,
                                  }), true)}
                                >
                                  Justera
                                </Button>
                                <Input
                                  type="number" inputMode="numeric"
                                  min={1} max={gap.gapMinutes}
                                  placeholder="min"
                                  value={editValue}
                                  onChange={(e) => setGapMinuteEdits((prev) => ({ ...prev, [gap.key]: e.target.value }))}
                                  className="h-8 w-20 text-xs"
                                />
                                <Button
                                  size="sm" variant="outline" disabled={busy}
                                  onClick={() => runGapAction(gap.key, () => actions.markGapResolved({
                                    gapKey: gap.key, resolution: 'pause',
                                  }))}
                                >
                                  <Coffee className="w-3.5 h-3.5 mr-1" />
                                  Paus/privat
                                </Button>
                                <Button
                                  size="sm" variant="ghost" disabled={busy}
                                  onClick={() => runGapAction(gap.key, () => actions.markGapResolved({
                                    gapKey: gap.key, resolution: 'ignored',
                                  }))}
                                >
                                  <XIcon className="w-3.5 h-3.5 mr-1" />
                                  Ignorera
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })()}

                {/* Approve day */}
                {!isSynthetic && (
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      variant={canApprove ? 'default' : 'outline'}
                      disabled={!canApprove || busyDayId === wd.id || wd.review_status === 'approved'}
                      onClick={() => handleApprove(wd)}
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      {wd.review_status === 'approved' ? 'Godkänd' : 'Godkänn dagen'}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
