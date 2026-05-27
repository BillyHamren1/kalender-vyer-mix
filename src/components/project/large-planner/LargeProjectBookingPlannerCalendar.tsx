/**
 * LargeProjectBookingPlannerCalendar — ISOLERAD intern bokningsplanerare
 * --------------------------------------------------------------------------
 * Mål: planera BOKNINGAR/TASKS inuti ett stort projekt utan att röra
 * personalkalenderns dataskrivning.
 *
 * Kalender-UI:t är samma TimeGrid/dagkort som personalkalendern
 * (LargeProjectPlannerCalendarView), men datalager och write-paths är
 * helt separerade.
 *
 * HÅRDA REGLER:
 *  - Får ALDRIG skriva till calendar_events / staff_assignments /
 *    booking_staff_assignments / large_project_team_assignments / bookings.
 *  - All write går via useLargeProjectPlannerItems → largeProjectPlannerService
 *    → enbart tabellen `large_project_booking_plan_items`.
 *
 * TEAM PER DAG:
 *  - Teamkolumner renderas PER dag från projektets egen teamsByDay[day.date].
 *  - Samma team-UI som personalkalendern, men separat projektdata.
 *  - Om personal finns i teamet visas den read-only; om ingen finns visas teamet ändå.
 */
import { useCallback, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';

import LargeProjectPlannerToolbar from './LargeProjectPlannerToolbar';
import LargeProjectPlannerSidebar from './LargeProjectPlannerSidebar';
import SplitBookingIntoTasksDialog from './SplitBookingIntoTasksDialog';
import ManualProjectTaskDialog from './ManualProjectTaskDialog';
import LargeProjectPlannerQuickEditDialog from './LargeProjectPlannerQuickEditDialog';
import LargeProjectPlannerCalendarView from './LargeProjectPlannerCalendarView';
import { useLargeProjectPlannerItems } from './useLargeProjectPlannerItems';
import { plannerItemIdFromEventId } from './LargeProjectPlannerCalendarAdapter';
import type { LargeProjectPlannerBooking } from './largeProjectPlannerTypes';

interface Props {
  largeProjectId: string;
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
    createItemsFromBookings,
    splitBooking,
    getAllowedStaffForDate,
    isStaffAllowedForDate,
    isMutating,
  } = ctx;

  const [splitBookingId, setSplitBookingId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDefaults, setManualDefaults] = useState<{
    date?: string | null;
    staffId?: string | null;
  }>({});
  const [quickEditId, setQuickEditId] = useState<string | null>(null);

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

  const handleSeedFromBookings = async () => {
    try {
      const result = await createItemsFromBookings();
      const createdCount =
        typeof result === 'object' && result && 'createdCount' in result
          ? (result as { createdCount: number }).createdCount
          : Array.isArray(result)
            ? result.length
            : 0;
      const skippedCount =
        typeof result === 'object' && result && 'skippedCount' in result
          ? (result as { skippedCount: number }).skippedCount
          : 0;
      const errors =
        typeof result === 'object' && result && 'errors' in result
          ? (result as { errors: string[] }).errors
          : [];

      const parts: string[] = [];
      parts.push(`${createdCount} skapade`);
      if (skippedCount > 0) parts.push(`${skippedCount} fanns redan`);
      if (errors.length > 0) parts.push(`${errors.length} fel`);
      const description = errors.length > 0 ? errors.slice(0, 3).join('\n') : undefined;

      if (createdCount > 0) {
        toast.success(`Plan från bokningar: ${parts.join(', ')}.`, { description });
      } else if (errors.length > 0) {
        toast.error(`Plan från bokningar: ${parts.join(', ')}.`, { description });
      } else {
        toast.info(`Plan från bokningar: ${parts.join(', ')}.`);
      }
    } catch (e) {
      toast.error((e as Error).message || 'Kunde inte skapa plan från bokningar.');
    }
  };

  const handleSeedBooking = async (booking: LargeProjectPlannerBooking) => {
    const planDate =
      booking.rigdaydate ?? booking.eventdate ?? booking.rigdowndate ?? days[0]?.date;
    if (!planDate) {
      toast.error('Bokningen saknar datum.');
      return;
    }
    try {
      await createItem({
        large_project_id: largeProjectId,
        title: booking.display_name,
        plan_date: planDate,
        booking_id: booking.id,
        item_type: 'booking',
        source: 'booking',
        status: 'planned',
        start_time: booking.event_start_time ?? booking.rig_start_time ?? null,
        end_time: booking.event_end_time ?? booking.rig_end_time ?? null,
      });
      toast.success('Bokning tillagd i plan.');
    } catch (e) {
      toast.error((e as Error).message || 'Kunde inte lägga in bokning.');
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

  // Klick på event i kalendern → öppna QuickEdit för items.
  const handleCalendarEventClick = useCallback((ev: CalendarEvent) => {
    const plannerItemId = plannerItemIdFromEventId(ev.id);
    if (plannerItemId) setQuickEditId(plannerItemId);
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
    <div className="flex h-full min-h-[600px] flex-col overflow-hidden rounded-md border border-border/60 bg-background">
      <LargeProjectPlannerToolbar
        daysCount={days.length}
        rangeLabel={rangeLabel}
        isLoading={isLoading}
        isMutating={isMutating}
        onRefresh={handleRefresh}
        onSeedFromBookings={handleSeedFromBookings}
        onCreateManual={() => handleCreateManual()}
      />

      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 min-h-0 flex flex-col overflow-hidden">
          <LargeProjectPlannerCalendarView
            largeProjectId={largeProjectId}
            ctx={ctx}
            onEventClick={handleCalendarEventClick}
          />
        </div>

        <LargeProjectPlannerSidebar
          bookings={bookings}
          items={items}
          staff={staff}
          onSeedBooking={handleSeedBooking}
          onSplitBooking={(b) => setSplitBookingId(b.id)}
          onItemClick={(it) => setQuickEditId(it.id)}
          onItemDelete={handleSidebarItemDelete}
          onCreateManual={() => handleCreateManual()}
        />
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
    </div>
  );
};

export default LargeProjectBookingPlannerCalendar;
