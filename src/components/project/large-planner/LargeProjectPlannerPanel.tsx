/**
 * LargeProjectPlannerPanel — intern bokningsplanering, sidopanel.
 * --------------------------------------------------------------------------
 * HÅRDA REGLER (STRIKT SEPARATION mot personalkalendern):
 *  - Skriver ENDAST till `large_project_booking_plan_items` via
 *    useLargeProjectPlannerItems / largeProjectPlannerService.
 *  - Får ALDRIG skriva till calendar_events, staff_assignments,
 *    booking_staff_assignments, large_project_team_assignments eller
 *    ändra bookings (datum/tider/team).
 *  - Projektets DAGAR ägs av personalkalendern. Saknas dagen där kan
 *    vi inte committa här — vi visar en tydlig varning och stoppar.
 *
 * Innehåller:
 *  - Lista över bokningar (planerade / oplannerade)
 *  - Skapa manuell task
 *  - Splitta bokning
 *  - Quick-edit (öppnas både via klick i panelen och via klick på
 *    planner-item-event i kalendern — global event 'lp-planner-item-open')
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
import { supabase } from '@/integrations/supabase/client';
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

  // Lyssna på klick på riktiga bokningsblock i projektkalendern → öppna sheet
  // så att bokningens orderrad-todos blir synliga (de har inga egna block).
  useEffect(() => {
    const handler = (e: Event) => {
      const bid = (e as CustomEvent<{ bookingId?: string }>).detail?.bookingId;
      if (bid) setPlannerSheetBookingId(bid);
    };
    window.addEventListener('lp-booking-sheet-open', handler as EventListener);
    return () => window.removeEventListener('lp-booking-sheet-open', handler as EventListener);
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

  /**
   * Skapa planner-items för valda bokningsfaser + ev. orderrads-to-dos.
   *
   * STRIKT: Projektkalendern äger INTE projektdagar — den får inte skriva
   * till bookings/calendar_events. Vi validerar därför varje önskad
   * plan_date mot projektdagarna (`days`, härledda från personalkalenderns
   * calendar_events). Saknas dagen där visar vi en blockerande varning.
   * Hela skrivvägen går till `large_project_booking_plan_items`.
   */
  const handlePlanWholeBooking = async (
    booking: LargeProjectPlannerBooking,
    selection: import('./BookingPlannerSheet').PlanWholeBookingSelection,
  ) => {
    const existingForBooking = items.filter((it) => it.booking_id === booking.id);
    const projectDateSet = new Set(days.map((d) => d.date));

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

    const missingDays: string[] = [];
    for (const ph of phases) {
      if (!ph.enabled) continue;
      for (const d of ph.dates) {
        if (!projectDateSet.has(d)) missingDays.push(`${ph.label}: ${d}`);
      }
    }
    if (missingDays.length > 0) {
      toast.error('Den här dagen är inte planerad som projektdag ännu.', {
        description:
          'Lägg till projektdagen i personalkalendern först.\n\nSaknas: ' +
          missingDays.slice(0, 6).join(', ') +
          (missingDays.length > 6 ? ` (+${missingDays.length - 6} till)` : ''),
        duration: 10000,
      });
      return;
    }

    let created = 0;
    let skipped = 0;
    const selectedSeed: { date: string; start: string; end: string } | null =
      (() => {
        for (const ph of phases) {
          if (ph.enabled && ph.dates.length > 0) {
            return { date: ph.dates[0], start: ph.startTime, end: ph.endTime };
          }
        }
        return null;
      })();
    for (const ph of phases) {
      if (!ph.enabled) continue;
      for (const date of ph.dates) {
        const already = existingForBooking.some(
          (it) =>
            it.source_booking_phase === ph.phase &&
            it.plan_date === date &&
            !it.booking_product_id,
        );
        if (already) {
          skipped++;
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
            start_time: `${ph.startTime}:00`,
            end_time: `${ph.endTime}:00`,
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
    if (created > 0) toast.success(`${created} faser planerade${skipped ? ` (${skipped} fanns redan)` : ''}.`);
    else if (skipped > 0) toast.info('Alla faser fanns redan i planen.');
  };

  const handleToggleItemStatus = async (
    item: LargeProjectBookingPlanItem,
    checked: boolean,
  ) => {
    try {
      await updateItem(item.id, { status: checked ? 'done' : 'planned' });
    } catch (e) {
      toast.error((e as Error).message || 'Kunde inte uppdatera status.');
    }
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
        onPlanWholeBooking={handlePlanWholeBooking}
        
        onItemClick={handleItemClick}
        onItemDelete={handleItemDelete}
        onToggleItemStatus={handleToggleItemStatus}
      />
    </Card>
  );
};

export default LargeProjectPlannerPanel;
