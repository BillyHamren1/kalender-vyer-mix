import React, { useState, useRef, useCallback, useMemo } from 'react';
import { CalendarEvent, Resource, getEventColor, loadResourcesFromStorage } from './ResourceData';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import { useNavigate } from 'react-router-dom';
import { createDialogHandlers } from '@/hooks/useEventEditController';
import { useGlobalEditController } from '@/contexts/EditControllerContext';
import { deleteCalendarEvent } from '@/services/eventService';
import { Trash2, Combine, Plus, Palette, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import EventHoverCard from './EventHoverCard';
import EventActionPopover from './EventActionPopover';
import PlannerEventActionPopover from '@/components/project/large-planner/PlannerEventActionPopover';
import MoveEventDateDialog from './MoveEventDateDialog';
import { DeleteDayButton } from './DeleteDayButton';
import { TodoEventCard } from './TodoEventCard';
import { BOOKING_COLOR_PRESETS, setBookingCalendarColor } from '@/services/bookingColorService';

import { useWarehouseResources } from '@/hooks/useWarehouseResources';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import ConsolidateProjectsDialog from '@/components/project/ConsolidateProjectsDialog';
import { resolveEventConsolidationSource } from '@/services/eventConsolidationResolver';
import type { ConsolidationSource } from '@/services/projectConsolidationService';
import { useConsolidationMenuDisabled } from '@/contexts/ConsolidationMenuContext';
import './CustomEvent.css';

interface CustomEventProps {
  event: CalendarEvent;
  resource: Resource;
  style?: React.CSSProperties;
  onEventResize?: () => Promise<void>;
  readOnly?: boolean;
  setEvents?: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
}

const CustomEvent: React.FC<CustomEventProps> = React.memo(({
  event,
  resource,
  style,
  onEventResize,
  readOnly = false,
  setEvents
}) => {
  
  const eventRef = useRef<HTMLDivElement>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [consolidateOpen, setConsolidateOpen] = useState(false);
  const [consolidateSource, setConsolidateSource] = useState<ConsolidationSource | null>(null);
  const [consolidateName, setConsolidateName] = useState<string>('');
  const [consolidateMode, setConsolidateMode] = useState<'create' | 'add'>('create');

  const consolidationMenuDisabled = useConsolidationMenuDisabled();

  const handleOpenConsolidate = useCallback(async (mode: 'create' | 'add') => {
    if (consolidationMenuDisabled) return;
    try {
      const src = await resolveEventConsolidationSource(event);
      if (!src) {
        toast.info('Detta event är inte kopplat till ett projekt');
        return;
      }
      setConsolidateSource(src);
      setConsolidateName(event.title || '');
      setConsolidateMode(mode);
      setConsolidateOpen(true);
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte öppna konsolidering');
    }
  }, [event, consolidationMenuDisabled]);

  // Add event navigation hook for context menu
  const { handleEventClick } = useEventNavigation();
  const navigate = useNavigate();
  
  // EDIT CONTROLLER: Global mutex via context — shared across all events
  const editController = useGlobalEditController();
  const quickTimeHandlers = createDialogHandlers(editController, 'quickTime');
  const moveDateHandlers = createDialogHandlers(editController, 'moveDate');
  
  // Dialog state for date move — LEGACY: still uses local state,
  // but now gated by editController for conflict prevention
  const [showDateDialog, setShowDateDialog] = useState(false);
  const { teamResources: warehouseTeamResources } = useWarehouseResources();

  // Check if this is a warehouse event (covers all warehouse calendar resources)
  const isWarehouseEvent =
    event.resourceId === 'warehouse' ||
    event.resourceId === 'warehouse-event' ||
    event.resourceId?.startsWith('lager-');

  // Use warehouse resources (Lager 1–N + Transport) for warehouse events,
  // otherwise the regular planning resources (Team 1–N).
  const availableResources = useMemo(
    () => isWarehouseEvent
      ? warehouseTeamResources.filter(r => r.id !== 'warehouse-event')
      : loadResourcesFromStorage(),
    [isWarehouseEvent, warehouseTeamResources]
  );

  const customerPickup = Boolean((event.extendedProps as any)?.customerPickup);
  const calendarColor = (event.extendedProps as any)?.calendarColor as string | undefined;
  const bookingTitle = (event.extendedProps as any)?.bookingTitle as string | undefined;
  const defaultEventColor = getEventColor(event.eventType, customerPickup);
  // Manuell färgmärkning vinner alltid över default-färgen.
  const eventColor = calendarColor || defaultEventColor;

  // Check if booking is cancelled
  const isCancelled = event.bookingStatus === 'CANCELLED' || event.extendedProps?.bookingStatus === 'CANCELLED';
  const isLocked = event.extendedProps?.timeLocked === true;
  const isTodo = event.eventType === 'todo' || (event.extendedProps as any)?.isTodo === true;

  // Context menu handlers
  const handleViewDetails = useCallback(() => {
    // LP-tiles har medvetet bookingId=undefined — navigera direkt till projektet.
    const largeProjectId = (event.extendedProps as any)?.largeProjectId;
    if (event.extendedProps?.isLargeProject && largeProjectId) {
      navigate(`/large-project/${largeProjectId}`);
      return;
    }
    if (event.bookingId) {
      // Create mock event info for navigation
      const mockEventInfo = {
        event: {
          id: event.id,
          title: event.title,
          start: new Date(event.start),
          end: new Date(event.end),
          extendedProps: {
            bookingId: event.bookingId,
            booking_id: event.bookingId,
            ...event.extendedProps
          },
          _def: {
            extendedProps: {
              bookingId: event.bookingId,
              booking_id: event.bookingId
            }
          }
        },
        el: eventRef.current
      };
      handleEventClick(mockEventInfo);
    }
  }, [event, handleEventClick, navigate]);

  // Handle removing a cancelled event from the calendar
  const handleRemoveCancelledEvent = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await deleteCalendarEvent(event.id);
      toast.success('Avbokad händelse borttagen från kalendern');
    } catch (error) {
      console.error('Error removing cancelled event:', error);
      toast.error('Kunde inte ta bort händelsen');
    }
  }, [event.id]);

  // Check if this is a warehouse event with source changes
  const hasSourceChanges = event.extendedProps?.has_source_changes === true && 
                           event.extendedProps?.manually_adjusted !== true;
  
  // Calculate dynamic styles
  const getDynamicStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      ...style,
      backgroundColor: isCancelled ? '#FEE2E2' : eventColor,
      cursor: 'pointer',
      position: 'relative' as const,
      color: '#000000',
      opacity: isCancelled ? 0.75 : 1,
    };
    
    // Cancelled events get a red dashed border
    if (isCancelled) {
      return {
        ...baseStyles,
        border: '2px dashed #EF4444',
        boxShadow: '0 0 6px rgba(239, 68, 68, 0.3)',
      };
    }

    // Locked time = solid red border (Fast tid) — has priority over warehouse change indicator
    if (isLocked) {
      return {
        ...baseStyles,
        border: '1.5px solid #DC2626',
        boxShadow: '0 0 4px rgba(220, 38, 38, 0.4)',
      };
    }

    // Add orange border + animation for warehouse events with changes
    if (hasSourceChanges) {
      return {
        ...baseStyles,
        border: '2px solid #f97316',
        boxShadow: '0 0 8px rgba(249, 115, 22, 0.5)',
        animation: 'pulse-orange 2s infinite'
      };
    }

    return baseStyles;
  };

  // Get booking number and delivery info from event
  const rawBookingId = event.bookingNumber || event.extendedProps?.bookingNumber || event.extendedProps?.booking_id || 'No ID';
  const bookingNumber = rawBookingId.length > 20 ? rawBookingId.slice(-8) : rawBookingId;
  const deliveryCity = event.extendedProps?.deliveryCity || event.extendedProps?.delivery_city || '';
  const deliveryAddress = event.deliveryAddress || event.extendedProps?.deliveryAddress || '';

  // Strip legacy "Packning - " / "Retur - " / "Återleverans - " prefixes from warehouse event titles
  const displayTitle = isWarehouseEvent
    ? event.title.replace(/^(Packning|Retur|Återleverans)\s*-\s*/i, '')
    : event.title;

  // For warehouse events: hide location entirely (only client name + booking number)
  const locationLine = isWarehouseEvent ? '' : deliveryCity;

  // Render the event card content
  const eventCardContent = (
    <div
      ref={eventRef}
      className={`custom-event hover:scale-105 ${hasSourceChanges ? 'warehouse-changed' : ''} ${readOnly ? 'cursor-default' : ''}`}
      style={getDynamicStyles()}
    >
      <div className="event-content" style={{ color: '#000000', pointerEvents: 'auto' }}>
        {/* Färgmärknings-knapp i hörnet — visas för alla bokningskort
            (utom avbokade där "AVBOKAD"/Trash redan tar den platsen). */}
        {/* Färgmärkning flyttad till högerklicks-menyn (ContextMenu) */}
        {/* Cancelled badge */}
        {isCancelled && (
          <div 
            className="absolute -top-1 -right-1 bg-red-600 text-white text-[8px] px-1 py-0.5 rounded font-bold z-10"
          >
            AVBOKAD
          </div>
        )}
        {/* In-card move/add/delete-day buttons removed — moved into EventActionPopover */}
        {/* Radera enskild dag — tillgängligt för cancelled (popover ej tillgänglig då) */}
        {isCancelled && !readOnly && (
          <DeleteDayButton event={event} setEvents={setEvents} onUpdate={onEventResize} />
        )}
        {/* Large project badge — inline, not overlapping */}
        {!isCancelled && event.extendedProps?.isLargeProject && (
          <div 
            className="text-[7px] font-bold uppercase tracking-wide rounded px-1 py-px mb-0.5 w-fit"
            style={{
              backgroundColor: 'hsl(var(--primary) / 0.15)',
              color: 'hsl(var(--primary))',
            }}
          >
            Projekt
          </div>
        )}
        {/* Changed badge for warehouse events */}
        {hasSourceChanges && !isCancelled && !event.extendedProps?.isLargeProject && (
          <div 
            className="absolute -top-1 -right-1 bg-orange-500 text-white text-[8px] px-1 py-0.5 rounded font-bold z-10"
          >
            Ändrad!
          </div>
        )}
        {/* Read-only events no longer show a badge */}
        {!(event.extendedProps as any)?.isPlannerItem && (
          <div className={`event-title ${isCancelled ? 'line-through' : ''}`} style={{ color: isCancelled ? '#991B1B' : '#000000' }}>
            {displayTitle}
          </div>
        )}
        {bookingTitle && !event.extendedProps?.isLargeProject && (
          <div
            className={`event-rubrik ${isCancelled ? 'line-through' : ''}`}
            style={{
              color: isCancelled ? '#991B1B' : '#000000',
              fontSize: '11px',
              fontWeight: 700,
              lineHeight: 1.15,
              marginTop: 1,
              wordBreak: 'break-word',
            }}
            title={bookingTitle}
          >
            {bookingTitle}
          </div>
        )}
        {(event.extendedProps as any)?.isPlannerItem && (
          <>
            {(event.extendedProps as any)?.projectName && (
              <div
                className="event-project"
                style={{ color: '#000000', fontSize: '10px', fontWeight: 600 }}
              >
                Projekt: {(event.extendedProps as any).projectName}
              </div>
            )}
            {((event.extendedProps as any)?.projectNumber ||
              (event.extendedProps as any)?.bookingNumber) && (
              <div
                className="event-project-number"
                style={{ color: '#000000', fontSize: '10px', opacity: 0.85 }}
              >
                #{(event.extendedProps as any).projectNumber ??
                  (event.extendedProps as any).bookingNumber}
              </div>
            )}
          </>
        )}
        {!event.extendedProps?.isLargeProject && !event.extendedProps?.hideBookingNumber && !(event.extendedProps as any)?.isPlannerItem && (
          <div 
            className={`event-booking ${isCancelled ? 'line-through' : ''}`}
            style={{ 
              color: isCancelled ? '#991B1B' : '#000000',
              fontSize: '10px'
            }}
          >
            #{bookingNumber}
          </div>
        )}
        {locationLine && (
          <div 
            className={`event-city ${isCancelled ? 'line-through' : ''}`}
            style={{ 
              color: isCancelled ? '#991B1B' : '#000000',
              fontSize: '10px',
              opacity: 0.8
            }}
          >
            {locationLine}
          </div>
        )}
        {/* Trash icon for cancelled events */}
        {isCancelled && (
          <button
            onClick={handleRemoveCancelledEvent}
            className="absolute bottom-0.5 right-0.5 p-0.5 rounded bg-red-100 hover:bg-red-300 transition-colors z-20"
            title="Ta bort från kalendern"
          >
            <Trash2 className="h-3 w-3 text-red-700" />
          </button>
        )}
      </div>
    </div>
  );

  // Right-click intentionally falls through to the browser's native context
  // menu — all event actions (team / dagar / tid / öppna / flytta datum…)
  // are reachable from the single-click EventActionPopover.

  // Project-activity rendering (establishment_tasks visualiserade i
  // ProjectCalendarView). Eget kort med tydlig "Endast projekt"-/publicerad-
  // markering. Klick öppnar ingen booking-detaljvy — vi hoverar/dblclick:ar
  // bara info via EventHoverCard.
  // To-do: dedikerat kort + popover med detaljer (ingen booking-koppling)
  if (isTodo) {
    return <TodoEventCard event={event} />;
  }

  const ext = event.extendedProps as any;
  if (ext?.isProjectActivity) {
    const published = !!ext.published;
    const inTimeApp = !!ext.inTimeApp;
    const missing = !!ext.missingInfo;
    const status = String(ext.status ?? 'todo');
    const category = ext.category ? String(ext.category) : null;
    const assignedCount = Array.isArray(ext.assignedIds) ? ext.assignedIds.length : 0;
    return (
      <EventHoverCard event={event} onClick={handleViewDetails}>
        <div
          className="h-full w-full rounded-md border-l-4 px-1.5 py-1 text-[11px] leading-tight overflow-hidden"
          style={{
            background: event.backgroundColor ?? '#F5F3FF',
            borderLeftColor: event.borderColor ?? '#A78BFA',
          }}
        >
          <div className="flex items-center gap-1">
            <span className="font-semibold truncate">{event.title}</span>
            {missing && (
              <span className="ml-auto text-[9px] uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1 shrink-0">
                Saknar info
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
            {category && <span className="truncate">{category}</span>}
            {category && <span>·</span>}
            <span>{status}</span>
            {assignedCount > 0 && (
              <>
                <span>·</span>
                <span>{assignedCount} pers</span>
              </>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            <span
              className={`inline-block text-[9px] uppercase tracking-wide rounded px-1 ${
                published
                  ? 'bg-violet-200 text-violet-900'
                  : 'bg-violet-50 text-violet-700 border border-violet-200'
              }`}
            >
              {published ? 'I personalkalender' : 'Endast projekt'}
            </span>
            {inTimeApp && (
              <span className="inline-block text-[9px] uppercase tracking-wide rounded px-1 bg-emerald-100 text-emerald-800 border border-emerald-200">
                I Time-app
              </span>
            )}
          </div>
        </div>
      </EventHoverCard>
    );
  }

  // If read-only, just render the card with double-click for details
  if (readOnly) {
    return (
      <EventHoverCard event={event} onClick={handleViewDetails}>
        {eventCardContent}
      </EventHoverCard>
    );
  }

  // Warehouse events: single-click opens details (consolidated UX). Drag/resize
  // still work via EventHoverCard.
  if (isWarehouseEvent && !readOnly) {
    return (
      <>
        <EventHoverCard event={event} onClick={handleViewDetails}>
          <div style={{ width: '100%', height: '100%' }}>
            {eventCardContent}
          </div>
        </EventHoverCard>

        <MoveEventDateDialog
          open={showDateDialog}
          onOpenChange={(open) => {
            setShowDateDialog(open);
            if (!open) {
              moveDateHandlers.onClose();
            }
          }}
          event={event}
          resources={availableResources}
          onUpdate={onEventResize}
          exactTimeNeeded={event.extendedProps?.exactTimeNeeded === true}
          setEvents={setEvents}
        />
      </>
    );
  }
  // Planner-items (projektkalenderns large_project_booking_plan_items)
  // har en EGEN popover som skriver till plan-tabellen — aldrig till
  // calendar_events / bookings. Routningen sker via extendedProps.kind.
  if ((event.extendedProps as any)?.kind === 'planner_item') {
    const plannerBookingId = (event.extendedProps as any)?.plannerBookingId as string | undefined;
    const handlePlannerDoubleClick = (e: React.MouseEvent) => {
      if (!plannerBookingId) return;
      e.stopPropagation();
      e.preventDefault();
      navigate(`/booking/${plannerBookingId}`);
    };

    return (
      <PlannerEventActionPopover event={event} onOpenDetails={handleViewDetails}>
        <div
          style={{ width: '100%', height: '100%' }}
          onDoubleClick={handlePlannerDoubleClick}
          title="Dubbelklicka för att öppna bokningen"
        >
          {eventCardContent}
        </div>
      </PlannerEventActionPopover>
    );
  }

  return (
    <>

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div style={{ width: '100%', height: '100%' }}>
            <EventActionPopover
              event={event}
              setEvents={setEvents}
              onUpdate={onEventResize}
              onOpenDetails={handleViewDetails}
              onMoveDate={() => {
                if (moveDateHandlers.canOpen()) {
                  moveDateHandlers.onOpen({ id: event.id, title: event.title, start: event.start, end: event.end });
                  setShowDateDialog(true);
                }
              }}
            >
              <div style={{ width: '100%', height: '100%' }}>
                {eventCardContent}
              </div>
            </EventActionPopover>
          </div>
        </ContextMenuTrigger>
        {(!consolidationMenuDisabled || (!isCancelled && event.bookingId)) && (
          <ContextMenuContent className="w-64 rounded-xl border bg-popover p-1.5 shadow-lg">
            {!isCancelled && event.bookingId && (
              <>
                <ContextMenuSub>
                  <ContextMenuSubTrigger className="rounded-lg gap-2 px-2.5 py-2 text-sm cursor-pointer focus:bg-primary/10">
                    <Palette className="h-4 w-4" />
                    Färgmärkning
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-56 rounded-xl border bg-popover p-1.5 shadow-lg">
                    <ContextMenuItem
                      onSelect={async () => {
                        try {
                          await setBookingCalendarColor(event.bookingId!, BOOKING_COLOR_PRESETS.transport.hex);
                          toast.success('Färgmärkning uppdaterad');
                          onEventResize?.();
                        } catch (e: any) {
                          toast.error(e?.message || 'Kunde inte spara färg');
                        }
                      }}
                      className="rounded-lg gap-2 px-2.5 py-2 text-sm cursor-pointer focus:bg-primary/10"
                    >
                      <span className="h-4 w-4 rounded border border-border" style={{ backgroundColor: BOOKING_COLOR_PRESETS.transport.hex }} />
                      <span className="flex-1">{BOOKING_COLOR_PRESETS.transport.label}</span>
                      {calendarColor === BOOKING_COLOR_PRESETS.transport.hex && <Check className="h-3 w-3" />}
                    </ContextMenuItem>
                    <ContextMenuItem
                      onSelect={async () => {
                        try {
                          await setBookingCalendarColor(event.bookingId!, BOOKING_COLOR_PRESETS.rental.hex);
                          toast.success('Färgmärkning uppdaterad');
                          onEventResize?.();
                        } catch (e: any) {
                          toast.error(e?.message || 'Kunde inte spara färg');
                        }
                      }}
                      className="rounded-lg gap-2 px-2.5 py-2 text-sm cursor-pointer focus:bg-primary/10"
                    >
                      <span className="h-4 w-4 rounded border border-border" style={{ backgroundColor: BOOKING_COLOR_PRESETS.rental.hex }} />
                      <span className="flex-1">{BOOKING_COLOR_PRESETS.rental.label}</span>
                      {calendarColor === BOOKING_COLOR_PRESETS.rental.hex && <Check className="h-3 w-3" />}
                    </ContextMenuItem>
                    {calendarColor && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onSelect={async () => {
                            try {
                              await setBookingCalendarColor(event.bookingId!, null);
                              toast.success('Färgmärkning borttagen');
                              onEventResize?.();
                            } catch (e: any) {
                              toast.error(e?.message || 'Kunde inte ta bort färg');
                            }
                          }}
                          className="rounded-lg gap-2 px-2.5 py-2 text-sm cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                        >
                          <X className="h-4 w-4" />
                          Ta bort färg
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuSubContent>
                </ContextMenuSub>
                {!consolidationMenuDisabled && <ContextMenuSeparator />}
              </>
            )}
            {!consolidationMenuDisabled && (
              <>
                <ContextMenuItem
                  onSelect={() => handleOpenConsolidate('create')}
                  className="rounded-lg gap-2 px-2.5 py-2 text-sm cursor-pointer focus:bg-primary/10"
                >
                  <Combine className="h-4 w-4" style={{ color: 'hsl(var(--project-large-foreground))' }} />
                  Konsolidera till nytt stort projekt...
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => handleOpenConsolidate('add')}
                  className="rounded-lg gap-2 px-2.5 py-2 text-sm cursor-pointer focus:bg-primary/10"
                >
                  <Plus className="h-4 w-4" style={{ color: 'hsl(var(--project-large-foreground))' }} />
                  Lägg till i stort projekt...
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        )}
      </ContextMenu>

      <ConsolidateProjectsDialog
        open={consolidateOpen}
        onOpenChange={setConsolidateOpen}
        initialSelection={consolidateSource}
        initialName={consolidateName}
        initialMode={consolidateMode}
      />

      {/* Date Move Dialog — LEGACY local state, gated by editController */}
      <MoveEventDateDialog
        open={showDateDialog}
        onOpenChange={(open) => {
          setShowDateDialog(open);
          if (!open) {
            moveDateHandlers.onClose();
          }
        }}
        event={event}
        resources={availableResources}
        onUpdate={onEventResize}
        exactTimeNeeded={event.extendedProps?.exactTimeNeeded === true}
        setEvents={setEvents}
      />
    </>
  );
});

CustomEvent.displayName = 'CustomEvent';

export default CustomEvent;
