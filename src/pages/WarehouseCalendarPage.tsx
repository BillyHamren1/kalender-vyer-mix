import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import WeekNavigation from '@/components/Calendar/WeekNavigation';
import WarehouseDayNavigationHeader from '@/components/Calendar/WarehouseDayNavigationHeader';
import WarehouseEventFilter, {
  type WarehouseEventTypeFilter,
  WAREHOUSE_EVENT_TYPE_FILTERS,
} from '@/components/Calendar/WarehouseEventFilter';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';
import WarehousePersonnelView from '@/components/warehouse/WarehousePersonnelView';
import WarehouseWorkCalendar, {
  type WarehouseCalendarView,
} from '@/components/warehouse/WarehouseWorkCalendar';
import { useWarehouseCalendarEvents, type WarehouseEvent } from '@/hooks/useWarehouseCalendarEvents';
import { useTransportCalendarEvents } from '@/hooks/useTransportCalendarEvents';
import {
  useWarehouseBookingTitles,
  useWarehouseEventCrew,
  useWarehousePackingStats,
} from '@/hooks/useWarehouseCardMeta';
import { usePlannerSync } from '@/stores/plannerStore';
import type { WarehousePlanningMode } from '@/lib/warehouse/warehouseCalendarDisplay';

const WAREHOUSE_ACTIVITY_LABELS: Record<string, string> = {
  packing: 'Packning',
  return: 'Retur',
  delivery: 'Utleverans',
  unpacking: 'Uppackning',
  inventory: 'Inventering',
  internal_task: 'Lageruppgift',
};

const formatPhaseDate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = parseISO(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, 'd MMM');
};

const phaseContext = (event: WarehouseEvent): string | undefined => {
  const parts = [
    ['Rigg', formatPhaseDate(event.source_rig_date)],
    ['Event', formatPhaseDate(event.source_event_date)],
    ['Riv', formatPhaseDate(event.source_rigdown_date)],
  ]
    .filter(([, value]) => !!value)
    .map(([label, value]) => label + ': ' + value);
  return parts.length ? parts.join(' · ') : undefined;
};

const warehouseEventToCalendarEvent = (event: WarehouseEvent): CalendarEvent => ({
  id: event.id,
  title: event.title,
  start: event.start_time,
  end: event.end_time,
  // The classic warehouse calendar has no user-facing team/resource columns.
  // Keep the technical resource only in extendedProps for compatibility.
  resourceId: 'warehouse',
  bookingId: event.booking_id || undefined,
  bookingNumber: event.booking_number || undefined,
  eventType: event.event_type as CalendarEvent['eventType'],
  deliveryAddress: event.delivery_address || undefined,
  viewed: event.viewed,
  extendedProps: {
    bookingNumber: event.booking_number || undefined,
    booking_id: event.booking_id || undefined,
    technicalResourceId: event.resource_id,
    deliveryCity: event.delivery_address?.split(',')[0] || undefined,
    has_source_changes: event.has_source_changes,
    manually_adjusted: event.manually_adjusted,
    change_details: event.change_details || undefined,
    phaseContext: phaseContext(event),
    warehouseActivityLabel: WAREHOUSE_ACTIVITY_LABELS[event.event_type] || 'Lagerjobb',
    timeLabel: event.start_time.slice(11, 16) + '–' + event.end_time.slice(11, 16),
  },
});

const eventProps = (event: CalendarEvent): Record<string, unknown> =>
  (event.extendedProps || {}) as Record<string, unknown>;

const WarehouseCalendarPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<WarehouseCalendarView>('weekly');
  const [planningMode, setPlanningMode] = useState<WarehousePlanningMode>('calendar');
  const [selectedDate, setSelectedDate] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [monthlyDate, setMonthlyDate] = useState(() => startOfMonth(new Date()));
  const [eventTypeFilters, setEventTypeFilters] = useState<WarehouseEventTypeFilter[]>(() => {
    const stored = localStorage.getItem('warehouseEventTypeFilters');
    if (!stored) return [...WAREHOUSE_EVENT_TYPE_FILTERS];
    try {
      const parsed = JSON.parse(stored) as string[];
      const valid = parsed.filter((value) =>
        (WAREHOUSE_EVENT_TYPE_FILTERS as string[]).includes(value),
      ) as WarehouseEventTypeFilter[];
      return valid.length > 0 ? valid : [...WAREHOUSE_EVENT_TYPE_FILTERS];
    } catch {
      return [...WAREHOUSE_EVENT_TYPE_FILTERS];
    }
  });
  const syncToStore = usePlannerSync();

  useEffect(() => {
    localStorage.setItem('warehouseEventTypeFilters', JSON.stringify(eventTypeFilters));
  }, [eventTypeFilters]);

  useEffect(() => {
    syncToStore({ selectedDate, viewMode });
  }, [selectedDate, syncToStore, viewMode]);

  useEffect(() => {
    const dateParam = searchParams.get('date');
    const viewParam = searchParams.get('view');
    if (!dateParam) return;
    const parsed = parseISO(dateParam);
    if (Number.isNaN(parsed.getTime())) return;
    const requestedView: WarehouseCalendarView =
      viewParam === 'day' || viewParam === 'weekly' || viewParam === 'monthly' || viewParam === 'list'
        ? viewParam
        : 'weekly';
    setSelectedDate(
      requestedView === 'day'
        ? parsed
        : requestedView === 'monthly'
          ? startOfMonth(parsed)
          : startOfWeek(parsed, { weekStartsOn: 1 }),
    );
    setMonthlyDate(startOfMonth(parsed));
    setViewMode(requestedView);
  }, [searchParams]);

  const dataView =
    planningMode === 'personnel'
      ? 'week'
      : viewMode === 'day'
        ? 'day'
        : viewMode === 'monthly'
          ? 'month'
          : 'week';

  const {
    events: warehouseEvents,
    loading: warehouseLoading,
    refetch: refreshWarehouseEvents,
  } = useWarehouseCalendarEvents({ currentDate: selectedDate, view: dataView });
  const { transportEvents, isLoading: transportLoading } = useTransportCalendarEvents(
    selectedDate,
    dataView,
  );

  const filteredWarehouseEvents = useMemo(
    () =>
      warehouseEvents
        .filter((event) => eventTypeFilters.includes(event.event_type as WarehouseEventTypeFilter))
        .map(warehouseEventToCalendarEvent),
    [eventTypeFilters, warehouseEvents],
  );

  const bookingIds = useMemo(
    () =>
      filteredWarehouseEvents
        .map((event) => event.bookingId)
        .filter((id): id is string => !!id),
    [filteredWarehouseEvents],
  );
  const eventIds = useMemo(
    () => filteredWarehouseEvents.map((event) => event.id).filter(Boolean),
    [filteredWarehouseEvents],
  );
  const { data: packingStats } = useWarehousePackingStats(bookingIds);
  const { data: bookingTitles } = useWarehouseBookingTitles(bookingIds);
  const { data: eventCrew } = useWarehouseEventCrew(eventIds);

  const enrichedEvents = useMemo<CalendarEvent[]>(
    () =>
      filteredWarehouseEvents.map((event) => {
        const props = eventProps(event);
        const stat = event.bookingId ? packingStats?.get(event.bookingId) : undefined;
        const bookingTitle = event.bookingId ? bookingTitles?.get(event.bookingId) : undefined;
        const crew = eventCrew?.get(event.id);
        const shortNames = crew?.shortNames || [];
        const crewLabel =
          shortNames.length > 2
            ? shortNames.slice(0, 2).join(' · ') + ' · +' + (shortNames.length - 2)
            : shortNames.join(' · ') || undefined;
        return {
          ...event,
          extendedProps: {
            ...props,
            bookingTitle: bookingTitle || props.bookingTitle,
            packedLabel:
              stat && stat.total > 0 ? stat.packed + ' / ' + stat.total + ' klara' : undefined,
            crewLabel,
            crewFullLabel: crew?.fullNames.join(', ') || undefined,
            crewCount: crew?.fullNames.length || 0,
          },
        };
      }),
    [bookingTitles, eventCrew, filteredWarehouseEvents, packingStats],
  );

  const allWork = useMemo(
    () => [...enrichedEvents, ...transportEvents],
    [enrichedEvents, transportEvents],
  );

  const setDayInUrl = (date: Date) => {
    setSearchParams({ date: format(date, 'yyyy-MM-dd'), view: 'day' });
  };

  const handleViewModeChange = (mode: WarehouseCalendarView) => {
    setViewMode(mode);
    if (mode === 'day') {
      setDayInUrl(selectedDate);
    } else {
      setSearchParams({ date: format(selectedDate, 'yyyy-MM-dd'), view: mode });
    }
    if (mode === 'monthly') setMonthlyDate(startOfMonth(selectedDate));
  };

  const handleDayChange = (date: Date) => {
    setSelectedDate(date);
    setMonthlyDate(startOfMonth(date));
    setDayInUrl(date);
  };

  const handleMonthChange = (date: Date) => {
    const month = startOfMonth(date);
    setMonthlyDate(month);
    setSelectedDate(month);
  };

  const openDay = (date: Date) => {
    setViewMode('day');
    handleDayChange(date);
  };

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col overflow-hidden" style={{ background: 'var(--gradient-page)' }}>
        <div className="flex items-center">
          <div className="flex-1">
            {planningMode === 'calendar' && viewMode === 'day' ? (
              <WarehouseDayNavigationHeader
                date={selectedDate}
                onDateChange={handleDayChange}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
              />
            ) : (
              <WeekNavigation
                currentWeekStart={selectedDate}
                setCurrentWeekStart={setSelectedDate}
                viewMode={planningMode === 'calendar' ? viewMode : undefined}
                onViewModeChange={planningMode === 'calendar' ? handleViewModeChange : undefined}
                currentMonth={monthlyDate}
                onMonthChange={handleMonthChange}
                variant="warehouse"
              />
            )}
          </div>
          {planningMode === 'calendar' && (
            <div className="pr-4">
              <WarehouseEventFilter
                activeFilters={eventTypeFilters}
                onFilterChange={setEventTypeFilters}
              />
            </div>
          )}
        </div>

        <div className="mx-2 mb-2 shrink-0 rounded-xl border border-border/60 bg-card/80 px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-semibold">Lagerplanering</span>
            <span className="text-xs text-muted-foreground">
              Planera alla lagerjobb och bemanna dem här. Arbetarna ser sin planering i Mitt lager.
            </span>
            <div className="ml-auto flex items-center gap-1 rounded-md border border-border/60 bg-background p-0.5">
              {(['calendar', 'personnel'] as WarehousePlanningMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPlanningMode(mode)}
                  className={
                    'h-7 rounded px-3 text-xs font-semibold transition-colors ' +
                    (planningMode === mode
                      ? 'bg-warehouse text-white'
                      : 'text-muted-foreground hover:text-foreground')
                  }
                >
                  {mode === 'calendar' ? 'Kalender' : 'Personal'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <main className="mx-2 mb-2 flex min-h-0 flex-1 flex-col rounded-2xl bg-card p-3 shadow-sm">
          {planningMode === 'personnel' ? (
            <WarehousePersonnelView currentDate={selectedDate} />
          ) : (
            <WarehouseWorkCalendar
              events={allWork}
              currentDate={selectedDate}
              viewMode={viewMode}
              isLoading={warehouseLoading || transportLoading}
              onRefresh={refreshWarehouseEvents}
              onOpenBooking={(bookingId) => navigate('/warehouse/bookings/' + bookingId)}
              onOpenDay={openDay}
            />
          )}
        </main>
      </div>
    </TooltipProvider>
  );
};

export default WarehouseCalendarPage;
