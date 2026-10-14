/**
 * MobileLagerPage — worker-facing "Mitt lager" for the Time app.
 *
 * This surface is deliberately NOT a planning surface. Warehouse managers
 * plan all work in /warehouse/calendar; the signed-in worker only sees the
 * work assigned/planned for them here and gets one primary next action.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Loader2, MapPin, Package, ScanLine } from 'lucide-react';
import { addDays, format, isValid } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useLagerAssignments, type LagerAssignmentItem } from '@/hooks/useLagerAssignments';
import {
  ASSIGNMENT_TYPE_LABEL,
  ASSIGNMENT_TYPE_TONE,
  assignmentStatusLabel,
  dayTimeWindow,
  isAssignmentOperationallyActive,
  isAssignmentCompleted,
  resolveAction,
  resolveAssignmentType,
  resolveTitle,
  summarizeTypes,
  workerActionLabel,
} from '@/lib/warehouse/lagerLabels';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { warehouseDateOf, warehouseTimeOf } from '@/lib/warehouse/warehouseTime';

const formatHHMM = (value: string | null | undefined) => warehouseTimeOf(value) ?? '';

const itemStart = (item: LagerAssignmentItem) => {
  const ms = item.start_time ? new Date(item.start_time).getTime() : Number.MAX_SAFE_INTEGER;
  return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
};

const MobileLagerPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const requestedDate = search.get('date');
  const candidate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? new Date(`${requestedDate}T12:00:00`) : null;
  const dateParam = candidate && isValid(candidate) && format(candidate, 'yyyy-MM-dd') === requestedDate
    ? requestedDate : warehouseDateOf(new Date())!;
  const selectedDate = new Date(`${dateParam}T12:00:00`);
  const { assignments, loading, error, refresh } = useLagerAssignments({ date: dateParam });
  const [details, setDetails] = useState<LagerAssignmentItem | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const changeDate = (date: string) => {
    setDetails(null);
    setSearch((previous) => { const next = new URLSearchParams(previous); next.set('date', date); return next; });
  };
  const timeWindow = dayTimeWindow(assignments);
  const summary = summarizeTypes(assignments);
  const today = dateParam === warehouseDateOf(new Date());

  const sections = useMemo(() => {
    const sorted = [...assignments].sort((a, b) => itemStart(a) - itemStart(b));
    const active = sorted.filter((item) => isAssignmentOperationallyActive(item, now));
    const activeIds = new Set(active.map((item) => item.id));
    const completed = sorted.filter(isAssignmentCompleted);
    const planned = sorted.filter((item) => !isAssignmentCompleted(item) && !activeIds.has(item.id));
    return { active, planned, completed };
  }, [assignments, now]);

  const buildScannerLink = (item: LagerAssignmentItem, mode: 'out' | 'in') => {
    const params = new URLSearchParams();
    if (item.packing_id) params.set('packingId', item.packing_id);
    else if (item.packlist_id) params.set('packlistId', item.packlist_id);
    else if (item.booking_id) params.set('bookingId', item.booking_id);
    params.set('mode', mode);
    return `/m/tools/scanner?${params.toString()}`;
  };

  const handleAction = async (item: LagerAssignmentItem) => {
    if (pendingId) return;
    const action = resolveAction(item);
    const hasScannerTarget = Boolean(item.packing_id || item.packlist_id || item.booking_id);
    if ((action === 'open_scanner' || action === 'open_return_scanner') && !hasScannerTarget) {
      setDetails(item);
      return;
    }
    switch (action) {
      case 'open_scanner':
        navigate(buildScannerLink(item, 'out'));
        return;
      case 'open_return_scanner':
        navigate(buildScannerLink(item, 'in'));
        return;
      case 'open_inventory':
        setDetails(item);
        return;
      case 'complete_task':
        if (item.project_task_id) {
          setPendingId(item.id);
          try {
            const result = await mobileApi.completeLagerTask({ task_id: item.project_task_id, completed: true });
            if (!result.success) throw new Error('Task completion rejected');
            toast.success('Markerad som klar');
            refresh();
          } catch (e) {
            console.warn('[MobileLagerPage] complete_task failed', e);
            toast.error('Kunde inte markera som klar. Försök igen.');
          } finally {
            setPendingId(null);
          }
        } else {
          setDetails(item);
        }
        return;
      case 'open_details':
      default:
        if (item.booking_id) navigate(`/m/job/${item.booking_id}`);
        else setDetails(item);
        return;
    }
  };

  const renderAssignment = (item: LagerAssignmentItem) => {
    const type = resolveAssignmentType(item);
    const title = resolveTitle(item);
    const tone = ASSIGNMENT_TYPE_TONE[type];
    const subtitleParts: string[] = [];
    if (item.booking_number) subtitleParts.push(item.booking_number);
    if (item.customer_name && item.customer_name !== title) subtitleParts.push(item.customer_name);
    const completed = isAssignmentCompleted(item);
    const active = isAssignmentOperationallyActive(item, now);

    return (
      <article
        key={item.id}
        className={cn(
          'rounded-2xl border bg-card p-4 shadow-sm space-y-2.5',
          active ? 'border-primary/40 ring-1 ring-primary/10' : 'border-border',
          completed && 'opacity-75',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border', tone)}>
                {ASSIGNMENT_TYPE_LABEL[type]}
              </span>
              <span className={cn(
                'text-xs font-bold uppercase tracking-wider',
                completed ? 'text-emerald-600' : active ? 'text-primary' : 'text-muted-foreground',
              )}>
                {assignmentStatusLabel(item)}
              </span>
            </div>
            <h2 className="font-bold text-foreground text-[15px] leading-snug">{title}</h2>
            {subtitleParts.length > 0 && (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {subtitleParts.join(' · ')}
              </p>
            )}
          </div>
          {completed ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          ) : active ? (
            <Clock3 className="h-5 w-5 text-primary shrink-0" />
          ) : null}
        </div>

        {(item.start_time || item.end_time) && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatHHMM(item.start_time)}
            {item.end_time && item.end_time !== item.start_time ? ` – ${formatHHMM(item.end_time)}` : ''}
          </p>
        )}

        {item.delivery_address && (
          <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{item.delivery_address}</span>
          </div>
        )}

        {item.description && (
          <p className="text-sm text-muted-foreground leading-snug">{item.description}</p>
        )}

        {!completed && (
          <button
            onClick={() => handleAction(item)}
            disabled={pendingId !== null}
            className="w-full mt-1 rounded-xl bg-primary text-primary-foreground py-3 text-sm font-extrabold active:opacity-80 transition-opacity disabled:opacity-50"
          >
            {pendingId === item.id ? 'Sparar…' : workerActionLabel(item)}
          </button>
        )}
      </article>
    );
  };

  const renderSection = (title: string, items: LagerAssignmentItem[], hint?: string) => {
    if (items.length === 0) return null;
    return (
      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-2 px-0.5">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-foreground">{title}</h2>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
        {items.map(renderAssignment)}
      </section>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      <div className="bg-primary text-primary-foreground px-4 pt-3 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-primary-foreground/80 active:opacity-70"
          aria-label="Tillbaka"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs">Tillbaka</span>
        </button>
        <div className="mt-2 flex items-center gap-2">
          <Package className="w-5 h-5" />
          <h1 className="text-xl font-extrabold">Min dag · Lager</h1>
        </div>
        <p className="mt-1 text-sm text-primary-foreground/80">
          {format(selectedDate, 'EEEE d MMMM', { locale: sv })}
          {!loading && !error && timeWindow.start && ` · ${timeWindow.start}${timeWindow.end ? `–${timeWindow.end}` : ''}`}
          {!loading && !error && summary && ` · ${summary}`}
        </p>
        <p className="mt-1 text-xs text-primary-foreground/70">
          Här ser du det lagerarbete som är planerat för dig.
        </p>
      </div>

      <div className="px-4 py-4 space-y-5">
        <div className="flex items-center gap-2" aria-label="Välj arbetsdag">
          <button className="rounded-xl border p-3" aria-label="Föregående dag" onClick={() => changeDate(format(addDays(selectedDate, -1), 'yyyy-MM-dd'))}><ChevronLeft className="h-5 w-5" /></button>
          <input aria-label="Arbetsdag" type="date" value={dateParam} onChange={(event) => event.target.value && changeDate(event.target.value)} className="min-w-0 flex-1 rounded-xl border bg-card p-3 text-sm" />
          <button className="rounded-xl border p-3" aria-label="Nästa dag" onClick={() => changeDate(format(addDays(selectedDate, 1), 'yyyy-MM-dd'))}><ChevronRight className="h-5 w-5" /></button>
          {!today && <button className="rounded-xl border p-3 text-sm" onClick={() => changeDate(warehouseDateOf(new Date())!)}>Idag</button>}
        </div>
        <button onClick={() => navigate('/m/tools/scanner')} className="flex w-full items-center justify-center gap-2 rounded-xl border bg-card p-3 text-sm font-semibold"><ScanLine className="h-5 w-5" />Öppna skannern</button>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border p-5 space-y-3">
            <p className="font-semibold">Kunde inte hämta dina lageruppgifter.</p>
            <button className="rounded-xl border px-4 py-3 font-semibold" onClick={refresh}>Försök igen</button>
          </div>
        ) : assignments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <Package className="w-6 h-6 mx-auto text-muted-foreground/60 mb-2" />
            <p className="text-sm font-semibold text-foreground">Inget planerat lagerarbete</p>
            <p className="text-xs text-muted-foreground mt-1">Du har inga lageruppgifter tilldelade denna dag.</p>
          </div>
        ) : (
          <>
            {renderSection('Nu', sections.active, 'Pågående')}
            {renderSection(today ? 'Nästa' : 'Planerat', sections.planned, `${sections.planned.length} uppgifter`)}
            {sections.completed.length > 0 && <details key={dateParam} className="rounded-2xl border p-4">
              <summary className="cursor-pointer py-1 font-semibold">Klart ({sections.completed.length})</summary>
              <div className="mt-3 space-y-3">{sections.completed.map(renderAssignment)}</div>
            </details>}
          </>
        )}
      </div>
      <Dialog open={Boolean(details)} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{details && resolveTitle(details)}</DialogTitle><DialogDescription>Information om din lageruppgift</DialogDescription></DialogHeader>
          {details && <div className="space-y-3 text-sm">
            <p>{ASSIGNMENT_TYPE_LABEL[resolveAssignmentType(details)]} · {assignmentStatusLabel(details)}</p>
            {details.description && <p className="whitespace-pre-wrap">{details.description}</p>}
            {details.delivery_address && <p>{details.delivery_address}</p>}
            <p className="text-muted-foreground">Kontakta arbetsledaren om du behöver hjälp med uppgiften eller när den är klar.</p>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MobileLagerPage;
