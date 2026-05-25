/**
 * LargeProjectBookingPlannerCalendar — ISOLERAD intern bokningsplanerare
 * --------------------------------------------------------------------------
 * Mål: planera BOKNINGAR/TASKS inuti ett stort projekt utan att röra
 * personalkalenderns dataskrivning.
 *
 * HÅRDA REGLER:
 *  - Får ALDRIG skriva till calendar_events / staff_assignments /
 *    booking_staff_assignments / large_project_team_assignments.
 *  - All write går via useLargeProjectPlannerItems → largeProjectPlannerService
 *    → enbart tabellen `large_project_booking_plan_items`.
 *
 * BEMANNING PER DAG (project-team-stickiness):
 *  - Personalkolumner renderas PER dag från staffByDay[day.date].
 *  - En person som inte är bemannad en viss dag visas inte den dagen.
 *  - Items vars assigned_staff_id inte är bemannad den dagen hamnar i
 *    "Ej tilldelat" med badge "Bemanning saknas".
 *  - Drag/drop till obemannad person stoppas.
 *  - Drag/drop till ny dag där personen inte är bemannad rensar personen.
 */
import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { AlertTriangle, CalendarOff, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import LargeProjectPlannerToolbar from './LargeProjectPlannerToolbar';
import LargeProjectPlannerSidebar from './LargeProjectPlannerSidebar';
import LargeProjectPlannerTaskCard from './LargeProjectPlannerTaskCard';
import SplitBookingIntoTasksDialog from './SplitBookingIntoTasksDialog';
import ManualProjectTaskDialog from './ManualProjectTaskDialog';
import LargeProjectPlannerQuickEditDialog from './LargeProjectPlannerQuickEditDialog';
import { useLargeProjectPlannerItems, type PlannerItemWithValidity } from './useLargeProjectPlannerItems';
import { readDragPayload, hasPlannerPayload } from './plannerDnd';
import type {
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
    staffByDay,
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

  /**
   * grid: items per (date|staffId|UNASSIGNED)
   * Använder itemsWithAssignmentValidity — items med isAssignedStaffAllowed=false
   * tvångsroutas till UNASSIGNED-kolumnen för sin plan_date.
   */
  const grid = useMemo(() => {
    const map = new Map<string, PlannerItemWithValidity[]>();
    itemsWithAssignmentValidity.forEach((it) => {
      const effectiveStaffId =
        it.assigned_staff_id && it.isAssignedStaffAllowed
          ? it.assigned_staff_id
          : null;
      const key = `${it.plan_date}|${effectiveStaffId ?? UNASSIGNED_KEY}`;
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    });
    map.forEach((arr) =>
      arr.sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return (a.start_time ?? '').localeCompare(b.start_time ?? '');
      }),
    );
    return map;
  }, [itemsWithAssignmentValidity]);

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

  const handleItemDelete = async (item: PlannerItemWithValidity) => {
    if (!window.confirm(`Ta bort "${item.title}"?`)) return;
    try {
      await deleteItem(item.id);
      toast.success('Task borttagen.');
    } catch (e) {
      toast.error((e as Error).message || 'Kunde inte ta bort.');
    }
  };

  const handleItemClick = (item: PlannerItemWithValidity) => {
    setQuickEditId(item.id);
  };

  const dropKey = (date: string, staffId: string | null) =>
    `${date}|${staffId ?? UNASSIGNED_KEY}`;

  const handleCellDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    key: string,
  ) => {
    if (!hasPlannerPayload(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverKey !== key) setDragOverKey(key);
  };

  const handleCellDrop = async (
    e: React.DragEvent<HTMLDivElement>,
    date: string,
    staffId: string | null,
  ) => {
    const payload = readDragPayload(e.dataTransfer);
    setDragOverKey(null);
    if (!payload) return;
    e.preventDefault();
    if (
      payload.fromDate === date &&
      (payload.fromStaffId ?? null) === (staffId ?? null)
    ) {
      return; // no-op
    }

    // Drop på en person-kolumn: personen måste vara bemannad den dagen.
    if (staffId && !isStaffAllowedForDate(staffId, date)) {
      toast.error('Personen är inte bemannad på stora projektet den här dagen.');
      return;
    }

    // Drop på en ny dag i samma persons kolumn (eller utan staff angiven) —
    // om itemet ÄGS av någon som inte är bemannad nya dagen, rensa staff.
    const sourceItem = items.find((it) => it.id === payload.itemId);
    let nextStaffId: string | null = staffId;
    let movedToUnassignedDueToStaff = false;
    if (
      staffId === null &&
      sourceItem?.assigned_staff_id &&
      payload.fromDate !== date
    ) {
      // Behåller personen om den fortfarande är bemannad nya dagen,
      // annars hamnar tasken i Ej tilldelat.
      if (isStaffAllowedForDate(sourceItem.assigned_staff_id, date)) {
        nextStaffId = sourceItem.assigned_staff_id;
      } else {
        nextStaffId = null;
        movedToUnassignedDueToStaff = true;
      }
    }

    try {
      await updateItem(payload.itemId, {
        plan_date: date,
        assigned_staff_id: nextStaffId,
        assigned_team_id: null,
        status: nextStaffId ? 'planned' : undefined,
      });
      if (movedToUnassignedDueToStaff) {
        toast.warning(
          'Personen är inte bemannad på projektet den nya dagen. Tasken flyttades till Ej tilldelat.',
        );
      }
    } catch (err) {
      toast.error((err as Error).message || 'Kunde inte flytta task.');
    }
  };

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
                {days.map((day) => {
                  const header = formatDayHeader(day.date);
                  const dayStaff = staffByDay[day.date] ?? [];
                  const gridTemplate = `120px repeat(${Math.max(dayStaff.length, 1)}, minmax(160px, 1fr)) 200px`;
                  return (
                    <div
                      key={day.date}
                      className="border-b border-border/60"
                    >
                      {/* Per-dag staff-header */}
                      <div
                        className="grid border-b border-border/40 bg-primary/5"
                        style={{ gridTemplateColumns: gridTemplate }}
                      >
                        <div className="px-2 py-1.5">
                          <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                            {header.weekday}
                          </div>
                          <div className="text-xs font-medium text-foreground">
                            {header.day}
                          </div>
                          {day.phase && (
                            <Badge
                              variant="outline"
                              className={`mt-1 px-1 py-0 text-[9px] ${PHASE_TONE[day.phase] ?? ''}`}
                            >
                              {PHASE_LABEL[day.phase] ?? day.phase}
                            </Badge>
                          )}
                        </div>
                        {dayStaff.length === 0 ? (
                          <div className="border-l border-border/60 px-2 py-1.5 text-[11px] italic text-muted-foreground">
                            Ingen bemannad personal denna dag
                          </div>
                        ) : (
                          dayStaff.map((s) => (
                            <div
                              key={s.id}
                              className="border-l border-border/60 px-2 py-1.5 text-[11px] font-semibold text-foreground"
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
                          ))
                        )}
                        <div className="border-l border-dashed border-border/60 bg-muted/30 px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">
                          Ej tilldelat
                        </div>
                      </div>

                      {/* Cells row */}
                      <div
                        className="grid"
                        style={{ gridTemplateColumns: gridTemplate }}
                      >
                        <div className="bg-primary/5" />
                        {dayStaff.length === 0 ? (
                          <div className="min-h-[80px] border-l border-border/60 bg-muted/10" />
                        ) : (
                          dayStaff.map((s) => {
                            const key = dropKey(day.date, s.id);
                            const cellItems = grid.get(key) ?? [];
                            const isOver = dragOverKey === key;
                            return (
                              <div
                                key={s.id}
                                className={`group relative min-h-[80px] cursor-pointer space-y-1 border-l border-border/60 p-1.5 transition-colors hover:bg-primary/5 ${
                                  isOver ? 'bg-primary/15 ring-2 ring-primary/50' : ''
                                }`}
                                onClick={(e) => {
                                  if ((e.target as HTMLElement).closest('[data-task-card]')) return;
                                  handleCreateManual({ date: day.date, staffId: s.id });
                                }}
                                onDragOver={(e) => handleCellDragOver(e, key)}
                                onDragLeave={() => {
                                  if (dragOverKey === key) setDragOverKey(null);
                                }}
                                onDrop={(e) => handleCellDrop(e, day.date, s.id)}
                                title="Klicka för att skapa manuell task — eller släpp en task här"
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
                                      draggable
                                      onClick={handleItemClick}
                                      onDelete={handleItemDelete}
                                    />
                                  </div>
                                ))}
                              </div>
                            );
                          })
                        )}
                        {/* Ej tilldelat */}
                        {(() => {
                          const key = dropKey(day.date, null);
                          const cellItems = grid.get(key) ?? [];
                          const isOver = dragOverKey === key;
                          return (
                            <div
                              className={`group min-h-[80px] cursor-pointer space-y-1 border-l border-dashed border-border/60 bg-muted/20 p-1.5 transition-colors hover:bg-muted/40 ${
                                isOver ? 'bg-muted/60 ring-2 ring-primary/40' : ''
                              }`}
                              onClick={(e) => {
                                if ((e.target as HTMLElement).closest('[data-task-card]')) return;
                                handleCreateManual({ date: day.date, staffId: null });
                              }}
                              onDragOver={(e) => handleCellDragOver(e, key)}
                              onDragLeave={() => {
                                if (dragOverKey === key) setDragOverKey(null);
                              }}
                              onDrop={(e) => handleCellDrop(e, day.date, null)}
                              title="Släpp här för att avtilldela"
                            >
                              {cellItems.map((it) => {
                                const orphan =
                                  !!it.assigned_staff_id && !it.isAssignedStaffAllowed;
                                return (
                                  <div data-task-card key={it.id} className="space-y-1">
                                    {orphan && (
                                      <Badge
                                        variant="outline"
                                        className="gap-1 border-amber-500/50 bg-amber-500/10 px-1.5 py-0 text-[9px] font-semibold text-amber-700 dark:text-amber-300"
                                      >
                                        <AlertTriangle className="h-2.5 w-2.5" />
                                        Bemanning saknas
                                      </Badge>
                                    )}
                                    <LargeProjectPlannerTaskCard
                                      item={it}
                                      booking={
                                        it.booking_id
                                          ? bookingById.get(it.booking_id) ?? null
                                          : null
                                      }
                                      staff={
                                        it.assigned_staff_id
                                          ? staffById.get(it.assigned_staff_id) ?? null
                                          : null
                                      }
                                      draggable
                                      onClick={handleItemClick}
                                      onDelete={handleItemDelete}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
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
