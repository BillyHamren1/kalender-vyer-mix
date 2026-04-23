/**
 * MobileDayReview — Review-entrypoint för dagavstämning.
 *
 * Visar de senaste 7 dagarnas workdays och deras `review_status`. För varje
 * dag visas räknare för:
 *   - öppna assistant_events (pending + ej stale)
 *   - staleade events kvar i review-underlaget
 *   - oklara resor (öppna travel_time_logs)
 *   - skäl-koder från workdays.review_reasons
 *
 * Sidan är ett rent fönster — den löser inte events själv (det görs i
 * WorkDayAssistant-dialogerna och MobileMyFlags). Syftet är att ge
 * användaren EN plats där hen kan se vad som behöver rättas.
 *
 * Hittas via knappen i MobileJobs-headern (badge med antal needs_review).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Clock, MapPin, Plane } from 'lucide-react';
import { format } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { mobileApi } from '@/services/mobileApiService';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';

type ReviewWorkday = Awaited<ReturnType<typeof mobileApi.listWorkdaysReview>>['workdays'][number];

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

export default function MobileDayReview() {
  const navigate = useNavigate();
  const { locale } = useLanguage();
  const [workdays, setWorkdays] = useState<ReviewWorkday[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
            return (
              <div
                key={wd.id}
                className={cn(
                  'rounded-2xl border bg-card p-4 shadow-sm',
                  wd.review_status === 'needs_review' && 'border-destructive/30',
                )}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      {dayLabel || dateFmt(wd.started_at)}
                    </div>
                    <div className="text-base font-semibold mt-0.5">
                      {(wd as any).synthetic
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

                {/* Event preview */}
                {wd.events_for_day.length > 0 && (
                  <details className="mt-3 group">
                    <summary className="text-xs text-primary cursor-pointer select-none">
                      {wd.events_for_day.length} händelser — visa
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {wd.events_for_day.slice(0, 8).map((ev) => (
                        <li key={ev.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="font-mono">{format(new Date(ev.happened_at), 'HH:mm')}</span>
                          <span className="font-medium text-foreground">{ev.event_type}</span>
                          <span className="truncate">{ev.target_label || '—'}</span>
                          {ev.stale_for_prompt && (
                            <span className="ml-auto text-[10px] uppercase text-amber-600">stale</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
