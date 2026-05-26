/**
 * MobileTimeReportQueue — startsidan för /m/report.
 *
 * Snabbflöde:
 *   - Dagkort har Skicka/Granska/Fyll i-knappar (se MobileTimeReportDayCard)
 *   - "Skicka" direkt från listan: hämtar dagvy, kör evaluateDirectSubmit,
 *     submittar om säkert, annars öppnar sheet för granskning
 *   - "Granska alla": öppnar sheet på första todo-dagen, auto-next efter submit/skip
 *   - Sheet håller listan kvar i bakgrunden (ingen full sidnavigering)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, CheckCircle2, ListChecks, ArrowLeft } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { MobileHeroHeader, MobileBackHeader } from '@/components/mobile-app/MobileHeader';
import {
  getMobileTimeReportQueue,
  getMobileGpsDayView,
  submitMobileGpsDayV2,
} from './mobileTimeV2Api';
import { evaluateDirectSubmit } from './suggestionPayload';
import type {
  TimeReportQueue,
  TimeReportQueueDay,
  MobileGpsDayView,
  MobileGpsSubmissionStatus,
  ManualDayPayload,
} from './types';
import MobileTimeReportDayCard from './MobileTimeReportDayCard';
import MobileDayReportPreview from './MobileDayReportPreview';
import ManualWorkSegmentsEditor from './ManualWorkSegmentsEditor';

interface Props {
  staffId: string;
  onOpenDay?: (date: string) => void; // legacy (oanvänd)
}

const DONE_STATUSES = new Set(['submitted', 'edited', 'needs_control', 'ai_flagged', 'approved', 'payroll_approved']);

const JUST_SUBMITTED_MS = 1400;

type SheetMode = null | 'single' | 'queue';

const MobileTimeReportQueue: React.FC<Props> = ({ staffId }) => {
  const [data, setData] = useState<TimeReportQueue | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [submittingDates, setSubmittingDates] = useState<Set<string>>(new Set());
  const [justSubmittedDates, setJustSubmittedDates] = useState<Set<string>>(new Set());

  // Sheet state
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [openInEditMode, setOpenInEditMode] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<string[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);

  // Day view inside sheet
  const [dayView, setDayView] = useState<MobileGpsDayView | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [dayComment, setDayComment] = useState('');
  const [daySubmitting, setDaySubmitting] = useState(false);

  const dayViewCacheRef = useRef<Map<string, MobileGpsDayView>>(new Map());

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const queue = await getMobileTimeReportQueue({ staffId });
      setData(queue);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Kunde inte ladda rapportkön');
    } finally {
      setIsLoading(false);
    }
  }, [staffId]);

  useEffect(() => { void load(); }, [load]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const { todoDays, doneDays } = useMemo(() => {
    const todo: TimeReportQueueDay[] = [];
    const done: TimeReportQueueDay[] = [];
    for (const d of data?.days ?? []) {
      // optimistiska "just submitted" stannar tillfälligt i todo med grön check
      // men flyttas till done så snart load() ger uppdaterad status.
      if (DONE_STATUSES.has(d.status)) done.push(d);
      else todo.push(d);
    }
    todo.sort((a, b) => {
      if (a.date === today && b.date !== today) return -1;
      if (b.date === today && a.date !== today) return 1;
      return 0;
    });
    return { todoDays: todo, doneDays: done };
  }, [data, today]);

  const todoCount = todoDays.length;
  const subtitle = todoCount === 0
    ? 'Inga dagar väntar på dig'
    : `${todoCount} ${todoCount === 1 ? 'dag väntar' : 'dagar väntar'} på dig`;

  // ------- Day view loader (för sheet) -----------------------------------
  const loadDayView = useCallback(async (date: string) => {
    setDayLoading(true);
    setDayError(null);
    try {
      const view = await getMobileGpsDayView({ staffId, date });
      dayViewCacheRef.current.set(date, view);
      setDayView(view);
    } catch (err: any) {
      setDayError(err?.message || 'Kunde inte ladda dagsvyn');
      setDayView(null);
    } finally {
      setDayLoading(false);
    }
  }, [staffId]);

  // När openDate ändras → ladda (cache-hit visas direkt, sedan refresh)
  useEffect(() => {
    if (!openDate) return;
    setDayComment('');
    setOpenInEditMode(false);
    const cached = dayViewCacheRef.current.get(openDate);
    if (cached) setDayView(cached);
    void loadDayView(openDate);
  }, [openDate, loadDayView]);

  // ------- Optimistisk markering ----------------------------------------
  const markJustSubmitted = useCallback((date: string) => {
    setJustSubmittedDates((prev) => new Set(prev).add(date));
    setSubmittingDates((prev) => {
      const next = new Set(prev);
      next.delete(date);
      return next;
    });
    // Lokal status-uppdatering så kortet flyttas till "Skickade" efter check-blip
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((d) =>
          d.date === date
            ? { ...d, status: 'submitted', statusLabel: 'Inskickad', canSubmit: false }
            : d,
        ),
      };
    });
    setTimeout(() => {
      setJustSubmittedDates((prev) => {
        const next = new Set(prev);
        next.delete(date);
        return next;
      });
    }, JUST_SUBMITTED_MS);
    // Bakgrunds-refetch för att reconcilera med servern
    void load();
  }, [load]);

  // ------- Direkt-skicka från lista -------------------------------------
  const handleQuickSubmit = useCallback(async (date: string) => {
    setSubmittingDates((prev) => new Set(prev).add(date));
    try {
      const cached = dayViewCacheRef.current.get(date);
      const view = cached ?? (await getMobileGpsDayView({ staffId, date }));
      if (!cached) dayViewCacheRef.current.set(date, view);

      const safety = evaluateDirectSubmit(view, '');
      if (!safety.ok || !safety.payload) {
        setSubmittingDates((prev) => {
          const next = new Set(prev);
          next.delete(date);
          return next;
        });
        toast.message('Granska först', { description: safety.reason ?? 'Förslaget behöver granskas innan inskick.' });
        setSheetMode('single');
        setOpenDate(date);
        return;
      }

      await submitMobileGpsDayV2({
        staffId,
        date,
        userComment: null,
        manualOverrides: [],
        expectedSourceSnapshotId: view.sourceSnapshotId,
        manualDay: safety.payload,
      });
      toast.success('Tidrapport inskickad');
      markJustSubmitted(date);
    } catch (err: any) {
      setSubmittingDates((prev) => {
        const next = new Set(prev);
        next.delete(date);
        return next;
      });
      toast.error(err?.message || 'Kunde inte skicka in');
    }
  }, [staffId, markJustSubmitted]);

  // ------- Sheet-actions -------------------------------------------------
  const openSingle = useCallback((date: string, editMode = false) => {
    setSheetMode('single');
    setReviewQueue([]);
    setReviewIndex(0);
    setOpenDate(date);
    if (editMode) setOpenInEditMode(true);
  }, []);

  const openQueue = useCallback(() => {
    const dates = todoDays.map((d) => d.date);
    if (dates.length === 0) return;
    setReviewQueue(dates);
    setReviewIndex(0);
    setSheetMode('queue');
    setOpenDate(dates[0]);
  }, [todoDays]);

  const advanceQueue = useCallback(() => {
    setReviewQueue((queue) => {
      // Skippa dagar som under tiden inskickats
      const stillTodo = (d: string) => !justSubmittedDates.has(d) &&
        !(data?.days ?? []).some((row) => row.date === d && DONE_STATUSES.has(row.status));
      const nextIndex = (() => {
        let i = reviewIndex + 1;
        while (i < queue.length && !stillTodo(queue[i])) i++;
        return i;
      })();
      if (nextIndex >= queue.length) {
        setSheetMode(null);
        setOpenDate(null);
        setReviewIndex(0);
        toast.success('Alla dagar är hanterade');
        return queue;
      }
      setReviewIndex(nextIndex);
      setOpenDate(queue[nextIndex]);
      return queue;
    });
  }, [reviewIndex, data, justSubmittedDates]);

  const closeSheet = useCallback(() => {
    setSheetMode(null);
    setOpenDate(null);
    setReviewQueue([]);
    setReviewIndex(0);
    setOpenInEditMode(false);
  }, []);

  // ------- Submit från inne i sheet ------------------------------------
  const handleSheetSubmit = useCallback(async (input: ManualDayPayload) => {
    if (!openDate || !dayView) return;
    setDaySubmitting(true);
    try {
      await submitMobileGpsDayV2({
        staffId,
        date: openDate,
        userComment: input.comment ?? (dayComment.trim() || null),
        manualOverrides: [],
        expectedSourceSnapshotId: dayView.sourceSnapshotId,
        manualDay: input,
      });
      toast.success('Tidrapport inskickad');
      markJustSubmitted(openDate);
      // Auto-next i queue-mode, annars stäng sheet
      if (sheetMode === 'queue') {
        advanceQueue();
      } else {
        closeSheet();
      }
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte skicka in');
    } finally {
      setDaySubmitting(false);
    }
  }, [openDate, dayView, staffId, dayComment, sheetMode, advanceQueue, closeSheet, markJustSubmitted]);

  // ------- Render -------------------------------------------------------
  const submittedCount = doneDays.length;
  const totalKnown = todoCount + submittedCount;
  const queuePosition = sheetMode === 'queue' && reviewQueue.length > 0
    ? { index: reviewIndex, total: reviewQueue.length }
    : null;

  const sheetDayStatus: MobileGpsSubmissionStatus =
    (dayView?.submission?.status ?? 'not_submitted') as MobileGpsSubmissionStatus;
  const sheetIsLocked = sheetDayStatus === 'approved' || sheetDayStatus === 'payroll_approved';

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      <MobileHeroHeader
        eyebrow="Tidrapport"
        title="Dagar att skicka in"
        subtitle={subtitle}
        rightAction={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void load()}
            disabled={isLoading}
            aria-label="Uppdatera"
            className="h-9 w-9 rounded-xl text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        }
      />

      <div className="flex-1 px-4 pt-5 space-y-6 w-full">
        {isLoading && !data && (
          <Card className="p-6 flex items-center justify-center gap-2 text-muted-foreground rounded-2xl border-border/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            Laddar dagar…
          </Card>
        )}

        {error && !isLoading && (
          <Card className="p-4 border-destructive/40 bg-destructive/5 rounded-2xl">
            <p className="text-sm font-medium text-destructive">Kunde inte ladda</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>
              Försök igen
            </Button>
          </Card>
        )}

        {data && (
          <>
            <section className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80">
                  Att göra
                </h2>
                {todoDays.length > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                    {todoDays.length}
                  </span>
                )}
                {totalKnown > 0 && submittedCount > 0 && (
                  <span className="ml-auto text-[10px] font-medium text-muted-foreground tabular-nums">
                    {submittedCount} / {totalKnown} skickade
                  </span>
                )}
                {todoDays.length >= 2 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-auto h-8 px-3 text-xs"
                    onClick={openQueue}
                  >
                    <ListChecks className="h-3.5 w-3.5 mr-1.5" />
                    Granska alla
                  </Button>
                )}
              </div>
              {todoDays.length === 0 ? (
                <Card className="p-4 flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50/60 border-emerald-200/70 rounded-2xl">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  Inga dagar väntar på dig just nu.
                </Card>
              ) : (
                <div className="space-y-2">
                  {todoDays.map((d) => (
                    <MobileTimeReportDayCard
                      key={d.date}
                      day={d}
                      highlight={d.date === today}
                      isSubmitting={submittingDates.has(d.date)}
                      isJustSubmitted={justSubmittedDates.has(d.date)}
                      onOpen={() => openSingle(d.date)}
                      onQuickSubmit={() => void handleQuickSubmit(d.date)}
                      onFill={() => openSingle(d.date, true)}
                    />
                  ))}
                </div>
              )}
            </section>

            {doneDays.length > 0 && (
              <section className="space-y-2.5">
                <div className="flex items-center gap-2 px-1">
                  <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80">
                    Skickade & klara
                  </h2>
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center">
                    {doneDays.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {doneDays.map((d) => (
                    <MobileTimeReportDayCard
                      key={d.date}
                      day={d}
                      onOpen={() => openSingle(d.date)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Sheet med dagvy */}
      <Sheet
        open={openDate !== null}
        onOpenChange={(open) => { if (!open) closeSheet(); }}
      >
        <SheetContent
          side="bottom"
          className="h-[92dvh] p-0 flex flex-col rounded-t-2xl"
        >
          <div className="flex-1 overflow-y-auto">
            <MobileBackHeader
              title={openDate ? formatNiceDate(openDate) : ''}
              subtitle={queuePosition ? `Dag ${queuePosition.index + 1} av ${queuePosition.total}` : undefined}
              onBack={closeSheet}
            />
            <div className="px-4 pt-4 pb-6 space-y-3">
              {dayLoading && !dayView && (
                <Card className="p-6 flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Laddar dagen…
                </Card>
              )}
              {dayError && !dayLoading && (
                <Card className="p-4 border-destructive/40 bg-destructive/5">
                  <p className="text-sm font-medium text-destructive">Kunde inte ladda</p>
                  <p className="text-xs text-muted-foreground mt-1">{dayError}</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => openDate && void loadDayView(openDate)}>
                    Försök igen
                  </Button>
                </Card>
              )}
              {dayView && openDate && !openInEditMode && (
                <MobileDayReportPreview
                  date={openDate}
                  data={dayView}
                  status={sheetDayStatus}
                  visual={{ label: sheetStatusLabel(sheetDayStatus), variant: 'outline' }}
                  userComment={dayComment}
                  onUserCommentChange={setDayComment}
                  onSubmit={handleSheetSubmit}
                  onEdit={() => setOpenInEditMode(true)}
                  isSubmitting={daySubmitting}
                  queuePosition={queuePosition}
                  onSkip={sheetMode === 'queue' ? advanceQueue : undefined}
                />
              )}
              {dayView && openDate && openInEditMode && (
                <div className="space-y-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2"
                    onClick={() => setOpenInEditMode(false)}
                    disabled={daySubmitting}
                  >
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Tillbaka till förslag
                  </Button>
                  <ManualWorkSegmentsEditor
                    date={openDate}
                    targets={dayView.manualTargets ?? { assignedTargets: [], locationTargets: [], searchableTargets: [] }}
                    suggestedSegments={dayView.segments ?? []}
                    userComment={dayComment}
                    onUserCommentChange={setDayComment}
                    onSubmit={handleSheetSubmit}
                    isSubmitting={daySubmitting}
                    disabled={sheetIsLocked}
                    disabledReason={sheetIsLocked ? 'Tidrapporten är godkänd och kan inte ändras.' : null}
                  />
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

function formatNiceDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return format(dt, 'EEEE d MMMM');
}

function sheetStatusLabel(s: MobileGpsSubmissionStatus): string {
  switch (s) {
    case 'not_submitted': return 'Väntar på dig';
    case 'submitted': return 'Väntar attest';
    case 'edited': return 'Väntar attest · ändrad';
    case 'ai_flagged':
    case 'needs_control': return 'Väntar kontroll';
    case 'needs_user_attention': return 'Behöver din uppmärksamhet';
    case 'correction_requested': return 'Behöver kompletteras';
    case 'approved': return 'Godkänd';
    case 'payroll_approved': return 'Godkänd';
    case 'rejected': return 'Avvisad';
    case 'withdrawn': return 'Återkallad';
    default: return s;
  }
}

export default MobileTimeReportQueue;
