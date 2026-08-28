import React, { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { EventClickArg, EventContentArg, EventDropArg } from '@fullcalendar/core';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { AlertTriangle, Clock3, MapPin, PackageCheck, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';
import { getEventDotClass } from '@/components/Calendar/ResourceData';
import { updateWarehouseCalendarEvent } from '@/services/warehouseCalendarService';
import './WarehouseWorkCalendar.css';

export type WarehouseCalendarView = 'day' | 'weekly' | 'monthly' | 'list';

interface Props {
  events: CalendarEvent[];
  currentDate: Date;
  viewMode: WarehouseCalendarView;
  isLoading: boolean;
  onRefresh: () => Promise<void>;
  onOpenBooking: (bookingId: string) => void;
  onOpenDay: (date: Date) => void;
}

const fullCalendarView: Record<Exclude<WarehouseCalendarView, 'list'>, string> = {
  day: 'timeGridDay',
  weekly: 'timeGridWeek',
  monthly: 'dayGridMonth',
};

const ACTIVITY_LABELS: Record<string, string> = {
  packing: 'Packning',
  delivery: 'Utleverans',
  return: 'Retur',
  inventory: 'Inventering',
  unpacking: 'Uppackning',
  internal_task: 'Lageruppgift',
  transport: 'Transport',
  transport_out: 'Transport ut',
  transport_in: 'Transport in',
};

type ExtendedProps = Record<string, unknown>;

const extendedPropsOf = (value: unknown): ExtendedProps =>
  value && typeof value === 'object' ? (value as ExtendedProps) : {};

const optionalText = (value: unknown): string | undefined =>
  value === null || value === undefined || value === '' ? undefined : String(value);

const EventCard: React.FC<{ info: EventContentArg }> = ({ info }) => {
  const props = extendedPropsOf(info.event.extendedProps);
  const activityType = String(props.eventType || props.activityType || 'internal_task');
  const activityLabel = optionalText(props.warehouseActivityLabel) || ACTIVITY_LABELS[activityType] || 'Lagerjobb';
  const bookingNumber = optionalText(props.bookingNumber);
  const bookingTitle = optionalText(props.bookingTitle);
  const timeLabel = optionalText(props.timeLabel);
  const packedLabel = optionalText(props.packedLabel);
  const crewLabel = optionalText(props.crewLabel);
  const crewFullLabel = optionalText(props.crewFullLabel);
  const phaseContext = optionalText(props.phaseContext);
  const isTransport = props.isTransport === true;
  const isUnstaffed = !isTransport && Number(props.crewCount || 0) === 0;
  const changed = props.has_source_changes === true && props.manually_adjusted !== true;

  return (
    <div className={`warehouse-fc-event ${changed ? 'warehouse-fc-event--changed' : ''}`}>
      <div className="warehouse-fc-event__topline">
        <span className={`h-2 w-2 rounded-full shrink-0 ${getEventDotClass(activityType)}`} />
        <span className="truncate font-semibold">{activityLabel}</span>
        {bookingNumber && <span className="ml-auto truncate tabular-nums">{bookingNumber}</span>}
      </div>
      <div className="warehouse-fc-event__title">{bookingTitle || info.event.title}</div>
      {phaseContext && <div className="warehouse-fc-event__phase">{phaseContext}</div>}
      <div className="warehouse-fc-event__meta">
        <span>{timeLabel || info.timeText}</span>
        {packedLabel && (
          <span className="inline-flex items-center gap-1">
            <PackageCheck className="h-3 w-3" /> {packedLabel}
          </span>
        )}
      </div>
      {crewLabel && (
        <div className="warehouse-fc-event__crew" title={crewFullLabel}>
          <UsersRound className="h-3 w-3 shrink-0" />
          <span className="truncate">{crewLabel}</span>
        </div>
      )}
      {isUnstaffed && (
        <div className="warehouse-fc-event__warning">
          <AlertTriangle className="h-3 w-3" /> Obemannat
        </div>
      )}
    </div>
  );
};

const WarehouseWorkCalendar: React.FC<Props> = ({
  events,
  currentDate,
  viewMode,
  isLoading,
  onRefresh,
  onOpenBooking,
  onOpenDay,
}) => {
  const calendarRef = useRef<FullCalendar>(null);
  const [savingEventId, setSavingEventId] = useState<string | null>(null);

  const formattedEvents = useMemo(
    () =>
      events.map((event) => {
        const props = extendedPropsOf(event.extendedProps);
        const eventType = event.eventType || (props.eventType as string | undefined) || 'internal_task';
        const isTransport = props.isTransport === true || event.id.startsWith('transport-');
        return {
          ...event,
          editable: !isTransport,
          startEditable: !isTransport,
          durationEditable: !isTransport,
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          textColor: 'inherit',
          extendedProps: {
            ...props,
            eventType,
            activityType: eventType,
            bookingId: event.bookingId,
            bookingNumber: event.bookingNumber || props.bookingNumber,
          },
        };
      }),
    [events],
  );

  useEffect(() => {
    if (viewMode === 'list') return;
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api.changeView(fullCalendarView[viewMode], currentDate);
  }, [currentDate, viewMode]);

  const persistMove = async (
    eventId: string,
    start: Date | null,
    end: Date | null,
    revert: () => void,
  ) => {
    if (!start) {
      revert();
      return;
    }
    const safeEnd = end || new Date(start.getTime() + 60 * 60 * 1000);
    setSavingEventId(eventId);
    try {
      await updateWarehouseCalendarEvent(eventId, {
        start_time: start.toISOString(),
        end_time: safeEnd.toISOString(),
      });
      await onRefresh();
      toast.success('Lagerjobbet flyttades');
    } catch (error) {
      console.error('[WarehouseWorkCalendar] move failed', error);
      revert();
      toast.error('Kunde inte flytta lagerjobbet');
    } finally {
      setSavingEventId(null);
    }
  };

  const handleDrop = (info: EventDropArg) => {
    void persistMove(info.event.id, info.event.start, info.event.end, info.revert);
  };

  const handleResize = (info: EventResizeDoneArg) => {
    void persistMove(info.event.id, info.event.start, info.event.end, info.revert);
  };

  const handleEventClick = (info: EventClickArg) => {
    const props = extendedPropsOf(info.event.extendedProps);
    const bookingId = props.bookingId || props.booking_id;
    if (bookingId) onOpenBooking(String(bookingId));
  };

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => String(a.start).localeCompare(String(b.start))),
    [events],
  );
  const groupedList = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>();
    for (const event of sortedEvents) {
      const key = String(event.start).slice(0, 10);
      const day = groups.get(key) || [];
      day.push(event);
      groups.set(key, day);
    }
    return groups;
  }, [sortedEvents]);

  if (viewMode === 'list') {
    return (
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border/60 bg-background">
        {groupedList.size === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Inga lagerjobb i perioden.</p>
        ) : (
          Array.from(groupedList.entries()).map(([date, dayEvents]) => (
            <section key={date} className="border-b border-border/60 last:border-b-0">
              <div className="sticky top-0 z-10 bg-muted/90 px-4 py-2 text-sm font-semibold capitalize backdrop-blur">
                {format(new Date(`${date}T12:00:00`), 'EEEE d MMMM', { locale: sv })}
              </div>
              <div className="divide-y divide-border/50">
                {dayEvents.map((event) => {
                  const props = extendedPropsOf(event.extendedProps);
                  const eventType = event.eventType || 'internal_task';
                  const isTransport = props.isTransport === true;
                  const unstaffed = !isTransport && Number(props.crewCount || 0) === 0;
                  const activityLabel = optionalText(props.warehouseActivityLabel);
                  const bookingTitle = optionalText(props.bookingTitle);
                  const crewLabel = optionalText(props.crewLabel);
                  const phaseContext = optionalText(props.phaseContext);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => event.bookingId && onOpenBooking(event.bookingId)}
                      className="grid w-full grid-cols-[90px_1fr_auto] items-center gap-3 px-4 py-3 text-left hover:bg-accent/40"
                    >
                      <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums">
                        <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                        {format(new Date(event.start), 'HH:mm')}–{format(new Date(event.end), 'HH:mm')}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-xs font-semibold">
                          <span className={`h-2 w-2 rounded-full ${getEventDotClass(eventType)}`} />
                          {activityLabel || ACTIVITY_LABELS[eventType] || 'Lagerjobb'}
                          {event.bookingNumber && <span className="text-muted-foreground">{event.bookingNumber}</span>}
                        </span>
                        <span className="mt-0.5 block truncate text-sm font-medium">
                          {bookingTitle || event.title}
                        </span>
                        {phaseContext && (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {phaseContext}
                          </span>
                        )}
                        {event.deliveryAddress && (
                          <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" /> {event.deliveryAddress}
                          </span>
                        )}
                      </span>
                      <span className="text-right text-xs">
                        {unstaffed ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800">
                            <AlertTriangle className="h-3 w-3" /> Obemannat
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <UsersRound className="h-3.5 w-3.5" /> {crewLabel || 'Transport'}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="warehouse-work-calendar relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border/60 bg-background">
      {(isLoading || savingEventId) && (
        <div className="pointer-events-none absolute right-3 top-3 z-30 rounded-full border bg-background/95 px-3 py-1 text-xs font-medium shadow-sm">
          {savingEventId ? 'Sparar…' : 'Laddar…'}
        </div>
      )}
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={fullCalendarView[viewMode]}
        initialDate={currentDate}
        headerToolbar={false}
        locale="sv"
        timeZone="UTC"
        firstDay={1}
        weekends
        height="100%"
        expandRows
        nowIndicator
        allDaySlot={false}
        slotMinTime="05:00:00"
        slotMaxTime="24:00:00"
        slotDuration="00:30:00"
        slotLabelInterval="01:00:00"
        events={formattedEvents}
        editable
        eventDurationEditable
        eventStartEditable
        eventDrop={handleDrop}
        eventResize={handleResize}
        eventClick={handleEventClick}
        eventContent={(info) => <EventCard info={info} />}
        dateClick={(info) => viewMode === 'monthly' && onOpenDay(info.date)}
        dayMaxEvents={viewMode === 'monthly' ? 4 : false}
        moreLinkClick="popover"
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        dayHeaderFormat={
          viewMode === 'day'
            ? { weekday: 'long', day: 'numeric', month: 'long' }
            : { weekday: 'short', day: 'numeric', month: 'short' }
        }
      />
    </div>
  );
};

export default WarehouseWorkCalendar;
