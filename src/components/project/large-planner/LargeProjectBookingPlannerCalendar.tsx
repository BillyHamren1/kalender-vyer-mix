/**
 * LargeProjectBookingPlannerCalendar — ISOLERAD intern bokningsplanerare
 * --------------------------------------------------------------------------
 * Mål: planera BOKNINGAR/TASKS inuti ett stort projekt utan att röra
 * personalkalenderns dataskrivning.
 *
 * HÅRDA REGLER (locked by .lovable/large-project-calendar-audit.md):
 *  - Får ALDRIG skriva till:
 *      • calendar_events
 *      • staff_assignments
 *      • booking_staff_assignments
 *      • large_project_team_assignments
 *  - Får ALDRIG importera/anropa:
 *      • useUnifiedStaffOperations
 *      • useRealTimeCalendarEvents (för skrivning)
 *      • useEventDragDrop
 *      • personalkalenderns staff drop/write handlers
 *      • services/calendarService.* (write)
 *      • services/eventService write-funktioner
 *      • services/largeProjectPlannerService.{moveLargeProjectDay,setLargeProjectDayTeam}
 *      • services/warehouseAssignmentsSync.*
 *
 *  - All write går via useLargeProjectPlannerItems → largeProjectPlannerService
 *    → enbart tabellen `large_project_booking_plan_items`.
 *
 * UI återanvänder visuell stil från CustomCalendar (kort, kolumner, tidsgrid,
 * dagskolumner, lila projektkänsla) men ALDRIG dess write-handlers.
 */
import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { CalendarOff, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import LargeProjectPlannerToolbar from './LargeProjectPlannerToolbar';
import LargeProjectPlannerSidebar from './LargeProjectPlannerSidebar';
import LargeProjectPlannerTaskCard from './LargeProjectPlannerTaskCard';
import SplitBookingIntoTasksDialog from './SplitBookingIntoTasksDialog';
import ManualProjectTaskDialog from './ManualProjectTaskDialog';
import LargeProjectPlannerQuickEditDialog from './LargeProjectPlannerQuickEditDialog';
import { useLargeProjectPlannerItems } from './useLargeProjectPlannerItems';
import { useState } from 'react';
import { readDragPayload, hasPlannerPayload } from './plannerDnd';
import type {
  LargeProjectBookingPlanItem,
  LargeProjectPlannerBooking,
  LargeProjectPlannerStaffMember,
} from './largeProjectPlannerTypes';

interface Props {
  largeProjectId: string;
}

const UNASSIGNED_KEY = '__unassigned__';

const formatDayHeader = (iso: string) => {
  try {
    const d = parseISO(iso);
    return {
      weekday: format(d, 'EEE', { locale: sv }),
      day: format(d, 'd MMM', { locale: sv }),
    };
  } catch {
    return { weekday: iso, day: '' };
  }
};

const PHASE_TONE: Record<string, string> = {
  rig: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  event: 'bg-primary/15 text-primary',
  rigDown: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
};

const PHASE_LABEL: Record<string, string> = {
  rig: 'Rigg',
  event: 'Event',
  rigDown: 'Riv',
};

const LargeProjectBookingPlannerCalendar = ({ largeProjectId }: Props) => {
  const {
    isLoading,
    error,
    bookings,
    staff,
    items,
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
  }>({});
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const staffById = useMemo(() => {
    const map = new Map<string, LargeProjectPlannerStaffMember>();
    staff.forEach((s) => map.set(s.id, s));
    return map;
  }, [staff]);

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

  /** items per (date|staffId|UNASSIGNED) */
  const grid = useMemo(() => {
    const map = new Map<string, LargeProjectBookingPlanItem[]>();
    items.forEach((it) => {
      const key = `${it.plan_date}|${it.assigned_staff_id ?? UNASSIGNED_KEY}`;
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    });
    // sort each cell by sort_order then start_time
    map.forEach((arr) =>
      arr.sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return (a.start_time ?? '').localeCompare(b.start_time ?? '');
      }),
    );
    return map;
  }, [items]);

  const handleRefresh = () => {
    void refetch();
  };

  const handleSeedFromBookings = async () => {
    try {
      const created = await createItemsFromBookings();
      const count = Array.isArray(created) ? created.length : 0;
      toast.success(
        count > 0
          ? `Skapade ${count} planer från bokningar.`
          : 'Alla bokningar var redan planerade.',
      );
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
    if (item.booking_id && (item.source === 'booking' || item.item_type === 'booking')) {
      setSplitBookingId(item.booking_id);
    }
  };

  const splitTargetBooking = splitBookingId
    ? bookingById.get(splitBookingId) ?? null
    : null;

  // Kolumner = assignad personal (via personalkalendern) + "Ej tilldelat"
  const staffColumns = useMemo(() => staff, [staff]);

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

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          {isLoading && (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Laddar projektplan…
            </div>
          )}
          {!isLoading && error && (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-destructive">
              {error.message}
            </div>
          )}
          {!isLoading && !error && days.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <CalendarOff className="h-6 w-6 text-muted-foreground" />
              Inga projektdagar att planera ännu.
            </div>
          )}
          {!isLoading && !error && days.length > 0 && (
            <ScrollArea className="flex-1">
              <div className="min-w-max">
                {/* Header row: staff columns + Unassigned */}
                <div
                  className="sticky top-0 z-10 grid border-b border-border/60 bg-primary/5"
                  style={{
                    gridTemplateColumns: `120px repeat(${staffColumns.length}, minmax(160px, 1fr)) 200px`,
                  }}
                >
                  <div className="px-2 py-2 text-[11px] font-semibold text-muted-foreground">
                    Dag
                  </div>
                  {staffColumns.map((s) => (
                    <div
                      key={s.id}
                      className="border-l border-border/60 px-2 py-2 text-[11px] font-semibold text-foreground"
                      title={s.name}
                    >
                      <div className="flex items-center gap-1">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: s.color ?? 'hsl(var(--primary))' }}
                        />
                        <span className="truncate">{s.name}</span>
                      </div>
                    </div>
                  ))}
                  <div className="border-l border-dashed border-border/60 bg-muted/30 px-2 py-2 text-[11px] font-semibold text-muted-foreground">
                    Ej tilldelat
                  </div>
                </div>

                {/* Day rows */}
                {days.map((day) => {
                  const header = formatDayHeader(day.date);
                  return (
                    <div
                      key={day.date}
                      className="grid border-b border-border/60"
                      style={{
                        gridTemplateColumns: `120px repeat(${staffColumns.length}, minmax(160px, 1fr)) 200px`,
                      }}
                    >
                      <div className="bg-primary/5 px-2 py-2">
                        <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                          {header.weekday}
                        </div>
                        <div className="text-xs font-medium text-foreground">
                          {header.day}
                        </div>
                        {day.phase && (
                          <Badge
                            variant="outline"
                            className={`mt-1 px-1 py-0 text-[9px] ${
                              PHASE_TONE[day.phase] ?? ''
                            }`}
                          >
                            {PHASE_LABEL[day.phase] ?? day.phase}
                          </Badge>
                        )}
                      </div>
                      {staffColumns.map((s) => {
                        const cellItems = grid.get(`${day.date}|${s.id}`) ?? [];
                        return (
                          <div
                            key={s.id}
                            className="group relative min-h-[80px] cursor-pointer space-y-1 border-l border-border/60 p-1.5 transition-colors hover:bg-primary/5"
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest('[data-task-card]')) return;
                              handleCreateManual({ date: day.date, staffId: s.id });
                            }}
                            title="Klicka för att skapa manuell task"
                          >
                            {cellItems.map((it) => (
                              <div data-task-card key={it.id}>
                                <LargeProjectPlannerTaskCard
                                  item={it}
                                  booking={
                                    it.booking_id
                                      ? bookingById.get(it.booking_id) ?? null
                                      : null
                                  }
                                  staff={staffById.get(s.id) ?? null}
                                  onClick={handleItemClick}
                                  onDelete={handleItemDelete}
                                />
                              </div>
                            ))}
                          </div>
                        );
                      })}
                      {/* Ej tilldelat */}
                      <div
                        className="group min-h-[80px] cursor-pointer space-y-1 border-l border-dashed border-border/60 bg-muted/20 p-1.5 transition-colors hover:bg-muted/40"
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('[data-task-card]')) return;
                          handleCreateManual({ date: day.date, staffId: null });
                        }}
                        title="Klicka för att skapa manuell task"
                      >
                        {(grid.get(`${day.date}|${UNASSIGNED_KEY}`) ?? []).map((it) => (
                          <div data-task-card key={it.id}>
                            <LargeProjectPlannerTaskCard
                              item={it}
                              booking={
                                it.booking_id
                                  ? bookingById.get(it.booking_id) ?? null
                                  : null
                              }
                              onClick={handleItemClick}
                              onDelete={handleItemDelete}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        <LargeProjectPlannerSidebar
          bookings={bookings}
          items={items}
          staff={staff}
          onSeedBooking={handleSeedBooking}
          onSplitBooking={(b) => setSplitBookingId(b.id)}
          onItemClick={handleItemClick}
          onItemDelete={handleItemDelete}
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
        onSplit={splitBooking}
        isMutating={isMutating}
      />

      <ManualProjectTaskDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        largeProjectId={largeProjectId}
        bookings={bookings}
        staff={staff}
        defaultDate={manualDefaults.date ?? null}
        defaultStaffId={manualDefaults.staffId ?? null}
        createItem={createItem}
        isMutating={isMutating}
      />
    </div>
  );
};

export default LargeProjectBookingPlannerCalendar;
