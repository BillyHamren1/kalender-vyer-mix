/**
 * LargeProjectPlannerPanel
 * --------------------------------------------------------------------------
 * Sidopanel för intern bokningsplanering i ett stort projekt — designad
 * att stå BREDVID ProjectCalendarView (personalkalenderns CustomCalendar).
 *
 * Innehåller:
 *  - Lista över bokningar (planerade / oplannerade)
 *  - Skapa manuell task
 *  - Splitta bokning
 *  - Quick-edit (öppnas både via klick i panelen och via klick på
 *    planner-item-event i kalendern — global event 'lp-planner-item-open')
 *
 * Skriver ENDAST till large_project_booking_plan_items via
 * useLargeProjectPlannerItems / largeProjectPlannerService.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, ListChecks, RefreshCw, Plus, Wand2 } from 'lucide-react';
import LargeProjectPlannerSidebar from './LargeProjectPlannerSidebar';
import SplitBookingIntoTasksDialog from './SplitBookingIntoTasksDialog';
import ManualProjectTaskDialog from './ManualProjectTaskDialog';
import LargeProjectPlannerQuickEditDialog from './LargeProjectPlannerQuickEditDialog';
import BookingPlannerSheet from './BookingPlannerSheet';
import { useLargeProjectPlannerItems } from './useLargeProjectPlannerItems';
import type {
  LargeProjectBookingPlanItem,
  LargeProjectPlannerBooking,
} from './largeProjectPlannerTypes';

interface Props {
  largeProjectId: string;
}

const LargeProjectPlannerPanel = ({ largeProjectId }: Props) => {
  const {
    isLoading,
    error,
    bookings,
    staff,
    getAllowedStaffForDate,
    isStaffAllowedForDate,
    items,
    itemsWithAssignmentValidity,
    days,
    refetch,
    createItem,
    updateItem,
    deleteItem,
    createItemsFromBookings,
    splitBooking,
    isMutating,
  } = useLargeProjectPlannerItems(largeProjectId);

  const [splitBookingId, setSplitBookingId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDefaults, setManualDefaults] = useState<{
    date?: string | null;
    staffId?: string | null;
    bookingId?: string | null;
    title?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    bookingProductId?: string | null;
    bookingProductLabel?: string | null;
  }>({});
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const [plannerSheetBookingId, setPlannerSheetBookingId] = useState<string | null>(null);

  // Lyssna på klick i kalenderns planner_item-event.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ itemId?: string }>).detail?.itemId;
      if (id) setQuickEditId(id);
    };
    window.addEventListener('lp-planner-item-open', handler as EventListener);
    return () => window.removeEventListener('lp-planner-item-open', handler as EventListener);
  }, []);

  /** "Planera"-knapp: öppna sidopanelen med bokningsöversikten. */
  const handleSeedBooking = (booking: LargeProjectPlannerBooking) => {
    setPlannerSheetBookingId(booking.id);
  };

  /** Bygg defaults för manuell to-do-dialog från en bokning + (valfri) orderrad. */
  const openCreateTodoDialog = (
    booking: LargeProjectPlannerBooking,
    product?: { id: string; name: string; quantity: number | null },
  ) => {
    const suggestedDate =
      booking.rigdaydate ?? booking.eventdate ?? booking.rigdowndate ?? days[0]?.date ?? null;
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
      bookingProductLabel: product
        ? `${product.name}${product.quantity ? ` · ${product.quantity} st` : ''}`
        : null,
    });
    setManualOpen(true);
  };

  /** Skapa planner-items för alla bokningens 3 faser i ett svep. */
  const handlePlanWholeBooking = async (booking: LargeProjectPlannerBooking) => {
    const existingForBooking = items.filter((it) => it.booking_id === booking.id);
    const phases: Array<{
      phase: 'rig' | 'event' | 'rigDown';
      label: string;
      date: string | null;
      start: string | null;
      end: string | null;
    }> = [
      { phase: 'rig', label: 'Rigg', date: booking.rigdaydate, start: booking.rig_start_time, end: booking.rig_end_time },
      { phase: 'event', label: 'Event', date: booking.eventdate, start: booking.event_start_time, end: booking.event_end_time },
      { phase: 'rigDown', label: 'Rigg ner', date: booking.rigdowndate, start: booking.rigdown_start_time, end: booking.rigdown_end_time },
    ];
    let created = 0;
    let skipped = 0;
    for (const ph of phases) {
      if (!ph.date) continue;
      const already = existingForBooking.some(
        (it) =>
          it.source_booking_phase === ph.phase &&
          it.plan_date === ph.date &&
          !it.booking_product_id,
      );
      if (already) { skipped++; continue; }
      try {
        await createItem({
          large_project_id: largeProjectId,
          booking_id: booking.id,
          title: `${ph.label} — ${booking.display_name}${booking.booking_number ? ` (#${booking.booking_number})` : ''}`,
          plan_date: ph.date,
          item_type: 'booking',
          source: 'booking',
          phase: ph.phase,
          source_booking_phase: ph.phase,
          start_time: ph.start ?? '08:00:00',
          end_time: ph.end ?? '17:00:00',
        });
        created++;
      } catch (e) {
        toast.error(`Kunde inte skapa ${ph.label}: ${(e as Error).message}`);
      }
    }
    if (created > 0) toast.success(`${created} faser planerade${skipped ? ` (${skipped} fanns redan)` : ''}.`);
    else if (skipped > 0) toast.info('Alla faser fanns redan i planen.');
  };

  const handleSeedAll = async () => {
    try {
      const result = await createItemsFromBookings();
      const created =
        typeof result === 'object' && result && 'createdCount' in result
          ? (result as { createdCount: number }).createdCount
          : Array.isArray(result)
            ? result.length
            : 0;
      toast.success(`${created} bokningar lades till i planen.`);
    } catch (e) {
      toast.error((e as Error).message || 'Kunde inte seeda plan.');
    }
  };

  const handleItemDelete = async (item: LargeProjectBookingPlanItem) => {
    if (!window.confirm(`Ta bort "${item.title}"?`)) return;
    try {
      await deleteItem(item.id);
      toast.success('Task borttagen.');
    } catch (e) {
      toast.error((e as Error).message || 'Kunde inte ta bort.');
    }
  };

  const handleItemClick = (item: LargeProjectBookingPlanItem) => {
    setQuickEditId(item.id);
  };

  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const quickEditItem = quickEditId
    ? itemsWithAssignmentValidity.find((it) => it.id === quickEditId) ?? null
    : null;
  const quickEditBooking = quickEditItem?.booking_id
    ? bookingById.get(quickEditItem.booking_id) ?? null
    : null;
  const splitTargetBooking = splitBookingId ? bookingById.get(splitBookingId) ?? null : null;

  return (
    <Card className="flex h-full min-h-[600px] flex-col overflow-hidden border-border/60">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-primary/5 px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <ListChecks className="h-4 w-4 text-primary" />
          Planera projektet
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={handleSeedAll}
            disabled={isMutating || isLoading}
            title="Skapa planeringsitems från alla bokningar"
          >
            <Wand2 className="mr-1 h-3 w-3" /> Auto
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={() => {
              setManualDefaults({ date: days[0]?.date ?? null, staffId: null });
              setManualOpen(true);
            }}
          >
            <Plus className="mr-1 h-3 w-3" /> Ny
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => void refetch()}
            disabled={isLoading}
            title="Ladda om"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            Laddar plan…
          </div>
        ) : error ? (
          <div className="p-3 text-xs text-destructive">{error.message}</div>
        ) : (
          <div className="h-full">
            <LargeProjectPlannerSidebar
              bookings={bookings}
              items={items}
              staff={staff}
              onSeedBooking={handleSeedBooking}
              onSplitBooking={(b) => setSplitBookingId(b.id)}
              onItemClick={handleItemClick}
              onItemDelete={handleItemDelete}
              onCreateManual={() => {
                setManualDefaults({ date: days[0]?.date ?? null, staffId: null });
                setManualOpen(true);
              }}
              onCreateTodoForProduct={(booking, product) =>
                openCreateTodoDialog(booking, product)
              }
            />
          </div>
        )}
      </div>


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
          if (!open) setPlannerSheetBookingId(null);
        }}
        booking={
          plannerSheetBookingId
            ? bookingById.get(plannerSheetBookingId) ?? null
            : null
        }
        items={items}
        staff={staff}
        onCreateTodoForBooking={(b) => openCreateTodoDialog(b)}
        onCreateTodoForProduct={(b, p) => openCreateTodoDialog(b, p)}
        onPlanWholeBooking={handlePlanWholeBooking}
        onItemClick={handleItemClick}
        onItemDelete={handleItemDelete}
      />
    </Card>
  );
};

export default LargeProjectPlannerPanel;
