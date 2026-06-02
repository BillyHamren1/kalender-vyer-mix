/**
 * LargeProjectBookingPlannerCalendar — ISOLERAD intern bokningsplanerare
 * --------------------------------------------------------------------------
 * Planera BOKNINGAR/TASKS inuti ett stort projekt utan att röra
 * personalkalenderns dataskrivning.
 *
 * "Planera"-knappen på en bokning öppnar BookingPlannerSheet (full
 * översikt + faser + orderrader). Den skapar ALDRIG items direkt utan
 * att admin bekräftat — annars hamnar man bara "in i kalendern" utan att
 * veta vart eller hur.
 *
 * HÅRDA REGLER:
 *  - Får ALDRIG skriva till calendar_events / staff_assignments /
 *    booking_staff_assignments / large_project_team_assignments / bookings.
 *  - All write går via useLargeProjectPlannerItems → largeProjectPlannerService
 *    → enbart tabellen `large_project_booking_plan_items`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';

import LargeProjectPlannerToolbar, { type PlannerViewMode } from './LargeProjectPlannerToolbar';
import LargeProjectPlannerSidebar from './LargeProjectPlannerSidebar';
import LargeProjectPlannerChecklistView from './LargeProjectPlannerChecklistView';
import SplitBookingIntoTasksDialog from './SplitBookingIntoTasksDialog';
import ManualProjectTaskDialog from './ManualProjectTaskDialog';
import LargeProjectPlannerQuickEditDialog from './LargeProjectPlannerQuickEditDialog';
import LargeProjectPlannerCalendarView from './LargeProjectPlannerCalendarView';
import LargeProjectPlannerGanttView from './LargeProjectPlannerGanttView';
import type { PlanWholeBookingSelection } from './BookingPlannerSheet';
import BookingPlannerWorkspace from './BookingPlannerWorkspace';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useLargeProjectPlannerItems } from './useLargeProjectPlannerItems';
import { plannerItemIdFromEventId } from './LargeProjectPlannerCalendarAdapter';
import type { LargeProjectPlannerBooking } from './largeProjectPlannerTypes';

interface Props {
  largeProjectId: string;
}

interface ManualDefaults {
  date?: string | null;
  staffId?: string | null;
  bookingId?: string | null;
  title?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  bookingProductId?: string | null;
  bookingProductLabel?: string | null;
}

const LargeProjectBookingPlannerCalendar = ({ largeProjectId }: Props) => {
  const ctx = useLargeProjectPlannerItems(largeProjectId);
  const {
    isLoading,
    bookings,
    staff,
    items,
    itemsWithAssignmentValidity,
    days,
    refetch,
    createItem,
    updateItem,
    deleteItem,
    // createItemsFromBookings borttaget från UI — admin planerar varje bokning via sheet
    splitBooking,
    getAllowedStaffForDate,
    isStaffAllowedForDate,
    isMutating,
  } = ctx;

  const [splitBookingId, setSplitBookingId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDefaults, setManualDefaults] = useState<ManualDefaults>({});
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const [plannerSheetBookingId, setPlannerSheetBookingId] = useState<string | null>(null);
  const [plannerSheetHighlightDate, setPlannerSheetHighlightDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PlannerViewMode>('calendar');
  const [bookingsDrawerOpen, setBookingsDrawerOpen] = useState(false);

  const todosCount = useMemo(
    () => items.filter((it) => it.item_type !== 'booking').length,
    [items],
  );

  const bookingById = useMemo(() => {
    const map = new Map<string, LargeProjectPlannerBooking>();
    bookings.forEach((b) => map.set(b.id, b));
    return map;
  }, [bookings]);

  const rangeLabel = useMemo(() => {
    if (days.length === 0) return null;
    const first = days[0].date;
    const last = days[days.length - 1].date;
    try {
      const f = format(parseISO(first), 'd MMM', { locale: sv });
      const l = format(parseISO(last), 'd MMM', { locale: sv });
      return first === last ? f : `${f} – ${l}`;
    } catch {
      return `${first} – ${last}`;
    }
  }, [days]);

  const handleRefresh = () => {
    void refetch();
  };

  // (Seed-från-bokningar är borttaget — admin planerar varje bokning aktivt
  // via "Planera bokning" → BookingPlannerSheet för full kontroll.)

  /**
   * "Planera" på en bokning ÖPPNAR BookingPlannerSheet (full översikt
   * med faser, datum, tider, orderrader). Skapar ALDRIG items direkt —
   * admin måste bekräfta via "Planera hela bokningen" i sheeten.
   */
  const handleSeedBooking = (booking: LargeProjectPlannerBooking) => {
    setPlannerSheetBookingId(booking.id);
  };

  const openCreateTodoDialog = (
    booking: LargeProjectPlannerBooking,
    product?: { id: string; name: string; quantity: number | null },
    defaultDate?: string | null,
  ) => {
    const suggestedDate =
      defaultDate ??
      booking.rigdaydate ??
      booking.eventdate ??
      booking.rigdowndate ??
      days[0]?.date ??
      null;
    const suggestedStart =
      booking.event_start_time ?? booking.rig_start_time ?? '08:00:00';
    const suggestedEnd =
      booking.event_end_time ?? booking.rig_end_time ?? '17:00:00';
    setManualDefaults({
      date: suggestedDate,
      staffId: null,
      bookingId: booking.id,
      title: product ? product.name : booking.display_name,
      startTime: suggestedStart,
      endTime: suggestedEnd,
      bookingProductId: product?.id ?? null,
      bookingProductLabel: product?.name ?? null,
    });
    setManualOpen(true);
  };

  const handlePlanWholeBooking = async (
    booking: LargeProjectPlannerBooking,
    selection: PlanWholeBookingSelection,
  ) => {
    const existingForBooking = items.filter((it) => it.booking_id === booking.id);

    const phases: Array<{
      phase: 'rig' | 'event' | 'rigDown';
      label: string;
      enabled: boolean;
      dates: string[];
      startTime: string;
      endTime: string;
    }> = [
      { phase: 'rig', label: 'Rigg', enabled: selection.rig, dates: selection.drafts.rig.dates, startTime: selection.drafts.rig.startTime, endTime: selection.drafts.rig.endTime },
      { phase: 'event', label: 'Event', enabled: selection.event, dates: selection.drafts.event.dates, startTime: selection.drafts.event.startTime, endTime: selection.drafts.event.endTime },
      { phase: 'rigDown', label: 'Rigg ner', enabled: selection.rigDown, dates: selection.drafts.rigDown.dates, startTime: selection.drafts.rigDown.startTime, endTime: selection.drafts.rigDown.endTime },
    ];

    let created = 0;
    let skipped = 0;
    const selectedSeed: { date: string; start: string; end: string } | null = (() => {
      for (const ph of phases) {
        if (ph.enabled && ph.dates.length > 0) {
          return { date: ph.dates[0], start: ph.startTime, end: ph.endTime };
        }
      }
      return null;
    })();

    let updated = 0;
    for (const ph of phases) {
      if (!ph.enabled) continue;
      for (const date of ph.dates) {
        const nextStart = `${ph.startTime}:00`;
        const nextEnd = `${ph.endTime}:00`;
        const existing = existingForBooking.find(
          (it) =>
            it.source_booking_phase === ph.phase &&
            it.plan_date === date &&
            !it.booking_product_id,
        );
        if (existing) {
          // UPSERT: uppdatera tid/titel om något ändrats — annars hoppa över.
          const nextTitle = `${ph.label} — ${booking.display_name}${booking.booking_number ? ` (#${booking.booking_number})` : ''}`;
          const timeChanged =
            existing.start_time !== nextStart || existing.end_time !== nextEnd;
          const titleChanged = existing.title !== nextTitle;
          if (timeChanged || titleChanged) {
            try {
              await updateItem(existing.id, {
                start_time: nextStart,
                end_time: nextEnd,
                title: nextTitle,
                status: 'planned',
              });
              updated++;
            } catch (e) {
              toast.error(`Kunde inte uppdatera ${ph.label}: ${(e as Error).message}`);
            }
          } else {
            skipped++;
          }
          continue;
        }
        try {
          await createItem({
            large_project_id: largeProjectId,
            booking_id: booking.id,
            title: `${ph.label} — ${booking.display_name}${booking.booking_number ? ` (#${booking.booking_number})` : ''}`,
            plan_date: date,
            item_type: 'booking',
            source: 'booking',
            phase: ph.phase,
            source_booking_phase: ph.phase,
            start_time: nextStart,
            end_time: nextEnd,
          });
          created++;
        } catch (e) {
          toast.error(`Kunde inte skapa ${ph.label}: ${(e as Error).message}`);
        }
      }
    }


    if (selection.productIdsForTodos.length > 0 && selectedSeed) {
      try {
        const { data: products, error } = await supabase
          .from('booking_products')
          .select('id,name,quantity')
          .eq('booking_id', booking.id)
          .in('id', selection.productIdsForTodos);
        if (error) throw error;

        for (const product of products ?? []) {
          const alreadyExists = existingForBooking.some((it) => it.booking_product_id === product.id);
          if (alreadyExists) {
            skipped++;
            continue;
          }
          await createItem({
            large_project_id: largeProjectId,
            booking_id: booking.id,
            booking_product_id: product.id,
            title: product.name || 'Orderrad',
            plan_date: selectedSeed.date,
            start_time: `${selectedSeed.start}:00`,
            end_time: `${selectedSeed.end}:00`,
            item_type: 'task',
            source: 'manual',
            status: 'planned',
          });
          created++;
        }
      } catch (e) {
        toast.error((e as Error).message || 'Kunde inte skapa to-dos från orderrader.');
      }
    }

    setPlannerSheetBookingId(booking.id);
    const parts: string[] = [];
    if (created > 0) parts.push(`${created} nya`);
    if (updated > 0) parts.push(`${updated} uppdaterade`);
    if (skipped > 0) parts.push(`${skipped} oförändrade`);
    if (created + updated > 0) {
      toast.success(`Arbetsdagar sparade: ${parts.join(', ')}.`);
    } else if (skipped > 0) {
      toast.info('Inga ändringar — alla arbetsdagar var redan i planen.');
    }
  };

  const handleToggleItemStatus = async (
    item: { id: string },
    checked: boolean,
  ) => {
    try {
      await updateItem(item.id, { status: checked ? 'done' : 'planned' });
    } catch (e) {
      toast.error((e as Error).message || 'Kunde inte uppdatera status.');
    }
  };

  const handleCreateManual = (
    opts: { date?: string | null; staffId?: string | null } = {},
  ) => {
    setManualDefaults({
      date: opts.date ?? days[0]?.date ?? null,
      staffId: opts.staffId ?? null,
    });
    setManualOpen(true);
  };

  const handleItemDelete = async (itemId: string) => {
    try {
      await deleteItem(itemId);
      toast.success('Task borttagen.');
    } catch (e) {
      toast.error((e as Error).message || 'Kunde inte ta bort.');
    }
  };

  const handleSidebarItemDelete = async (item: { id: string; title: string }) => {
    if (!window.confirm(`Ta bort "${item.title}"?`)) return;
    await handleItemDelete(item.id);
  };

  const handleCalendarEventClick = useCallback((ev: CalendarEvent) => {
    const plannerItemId = plannerItemIdFromEventId(ev.id);
    if (!plannerItemId) return;
    const ep = (ev.extendedProps ?? {}) as Record<string, unknown>;
    if (ep.plannerItemType === 'booking' && typeof ep.plannerBookingId === 'string') {
      setPlannerSheetBookingId(ep.plannerBookingId);
      setPlannerSheetHighlightDate(
        typeof ep.plannerPlanDate === 'string' ? ep.plannerPlanDate : null,
      );
      return;
    }
    setQuickEditId(plannerItemId);
  }, []);


  // Dubbelklick på ett bokningsblock i kalendern → öppna BookingPlannerSheet
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ bookingId?: string; planDate?: string | null }>).detail;
      const bid = detail?.bookingId;
      if (bid) {
        setPlannerSheetBookingId(bid);
        setPlannerSheetHighlightDate(detail?.planDate ?? null);
      }
    };
    window.addEventListener('lp-booking-sheet-open', handler as EventListener);
    return () => window.removeEventListener('lp-booking-sheet-open', handler as EventListener);
  }, []);

  const quickEditItem = quickEditId
    ? itemsWithAssignmentValidity.find((it) => it.id === quickEditId) ?? null
    : null;
  const quickEditBooking =
    quickEditItem?.booking_id ? bookingById.get(quickEditItem.booking_id) ?? null : null;

  const splitTargetBooking = splitBookingId
    ? bookingById.get(splitBookingId) ?? null
    : null;

  return (
    <div className="flex h-full min-h-[600px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
      <LargeProjectPlannerToolbar
        daysCount={days.length}
        bookingsCount={bookings.length}
        todosCount={todosCount}
        rangeLabel={rangeLabel}
        isLoading={isLoading}
        isMutating={isMutating}
        onRefresh={handleRefresh}
        onCreateManual={() => handleCreateManual()}
        onOpenBookingsDrawer={() => setBookingsDrawerOpen(true)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <div className="min-w-0 min-h-0 flex flex-1 flex-col overflow-hidden">
        {viewMode === 'gantt' ? (
          <LargeProjectPlannerGanttView ctx={ctx} />
        ) : viewMode === 'checklist' ? (
          <LargeProjectPlannerChecklistView
            bookings={bookings}
            items={items}
            staff={staff}
            onItemClick={(it) => setQuickEditId(it.id)}
            onItemDelete={handleSidebarItemDelete}
            onToggleItemStatus={(it, done) => handleToggleItemStatus(it, done)}
            onCreateManual={() => handleCreateManual()}
          />
        ) : (
          <LargeProjectPlannerCalendarView
            largeProjectId={largeProjectId}
            ctx={ctx}
            onEventClick={handleCalendarEventClick}
          />
        )}
      </div>

      {/* Bokningar — öppnas via "Planera bokning"-knappen i toolbar */}
      <Sheet open={bookingsDrawerOpen} onOpenChange={setBookingsDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
          <SheetHeader className="px-4 py-3 border-b border-border/60">
            <SheetTitle className="text-sm font-semibold">Bokningar i projektet</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <LargeProjectPlannerSidebar
              bookings={bookings}
              items={items}
              staff={staff}
              onSeedBooking={(b) => {
                setBookingsDrawerOpen(false);
                handleSeedBooking(b);
              }}
              onSplitBooking={(b) => {
                setBookingsDrawerOpen(false);
                setSplitBookingId(b.id);
              }}
              onItemClick={(it) => {
                setBookingsDrawerOpen(false);
                setQuickEditId(it.id);
              }}
              onItemDelete={handleSidebarItemDelete}
              onCreateManual={() => {
                setBookingsDrawerOpen(false);
                handleCreateManual();
              }}
              onCreateTodoForProduct={(booking, product) => {
                setBookingsDrawerOpen(false);
                openCreateTodoDialog(booking, product);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>


      <SplitBookingIntoTasksDialog
        open={splitBookingId !== null}
        onOpenChange={(open) => {
          if (!open) setSplitBookingId(null);
        }}
        largeProjectId={largeProjectId}
        booking={splitTargetBooking}
        staff={staff}
        getAllowedStaffForDate={getAllowedStaffForDate}
        isStaffAllowedForDate={isStaffAllowedForDate}
        onSplit={splitBooking}
        isMutating={isMutating}
      />

      <ManualProjectTaskDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        largeProjectId={largeProjectId}
        bookings={bookings}
        staff={staff}
        getAllowedStaffForDate={getAllowedStaffForDate}
        isStaffAllowedForDate={isStaffAllowedForDate}
        defaultDate={manualDefaults.date ?? null}
        defaultStaffId={manualDefaults.staffId ?? null}
        defaultBookingId={manualDefaults.bookingId ?? null}
        defaultTitle={manualDefaults.title ?? null}
        defaultStartTime={manualDefaults.startTime ?? null}
        defaultEndTime={manualDefaults.endTime ?? null}
        defaultBookingProductId={manualDefaults.bookingProductId ?? null}
        defaultBookingProductLabel={manualDefaults.bookingProductLabel ?? null}
        createItem={createItem}
        isMutating={isMutating}
      />

      <LargeProjectPlannerQuickEditDialog
        open={quickEditId !== null}
        onOpenChange={(open) => {
          if (!open) setQuickEditId(null);
        }}
        item={quickEditItem}
        booking={quickEditBooking}
        staff={staff}
        getAllowedStaffForDate={getAllowedStaffForDate}
        isStaffAllowedForDate={isStaffAllowedForDate}
        updateItem={updateItem}
        deleteItem={deleteItem}
        onSplit={(it) => it.booking_id && setSplitBookingId(it.booking_id)}
        isMutating={isMutating}
      />

      <BookingPlannerSheet
        open={plannerSheetBookingId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPlannerSheetBookingId(null);
            setPlannerSheetHighlightDate(null);
          }
        }}
        booking={
          plannerSheetBookingId
            ? bookingById.get(plannerSheetBookingId) ?? null
            : null
        }
        items={items}
        staff={staff}
        highlightDate={plannerSheetHighlightDate}
        onCreateTodoForBooking={(b, defaultDate) => openCreateTodoDialog(b, undefined, defaultDate)}
        onCreateTodoForProduct={(b, p, defaultDate) => openCreateTodoDialog(b, p, defaultDate)}
        onPlanWholeBooking={handlePlanWholeBooking}
        onItemClick={(it) => setQuickEditId(it.id)}
        onItemDelete={(it) => handleItemDelete(it.id)}
        onToggleItemStatus={handleToggleItemStatus}
      />
    </div>
  );
};

export default LargeProjectBookingPlannerCalendar;
