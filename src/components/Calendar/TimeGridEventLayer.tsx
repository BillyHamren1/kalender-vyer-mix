import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CalendarEvent, Resource } from './ResourceData';
import CustomEvent from './CustomEvent';
import { DRAG_DATA_TYPE, type DraggedEventData } from '@/hooks/useEventDragDrop';
import type { OverlapInfo } from './timeGridLayout';
import { useEventNavigation } from '@/hooks/useEventNavigation';

export const EventWrapper: React.FC<{
  event: CalendarEvent;
  position: { top: number; height: number };
  overlapLayout?: OverlapInfo;
  teamColumnWidth: number;
  onEventClick: (event: CalendarEvent) => void;
  onEventResize?: () => Promise<void>;
  readOnly?: boolean;
  setEvents?: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
}> = React.memo(({ event, position, overlapLayout, teamColumnWidth, onEventClick, onEventResize, readOnly, setEvents }) => {
  const navigate = useNavigate();
  const { handleProjectEventClick } = useEventNavigation();
  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (readOnly) {
      e.preventDefault();
      return;
    }
    const ext: any = event.extendedProps || {};
    const data: DraggedEventData = {
      id: event.id,
      title: event.title,
      start: typeof event.start === 'string' ? event.start : new Date(event.start).toISOString(),
      end: typeof event.end === 'string' ? event.end : new Date(event.end).toISOString(),
      bookingId: event.bookingId,
      eventType: event.eventType,
      resourceId: event.resourceId,
      isSyntheticFallback: !!ext.isSyntheticFallback,
      largeProjectId: ext.largeProjectId,
      consolidatedEventIds: Array.isArray(ext.consolidatedEventIds) ? ext.consolidatedEventIds : undefined,
      consolidatedBookingIds: Array.isArray(ext.consolidatedBookingIds) ? ext.consolidatedBookingIds : undefined,
    };
    e.dataTransfer.setData(DRAG_DATA_TYPE, JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
  }, [event, readOnly]);

  const hasOverlap = !!(overlapLayout && overlapLayout.totalColumns > 1);
  const overlapColumn = overlapLayout?.column ?? 0;
  const overlapCount = overlapLayout?.totalColumns ?? 1;
  // Sida-vid-sida i lika breda lanes (kolumnen är redan breddad i TimeGrid).
  const overlapWidthPercent = hasOverlap ? 100 / overlapCount : 100;
  const leftPercent = hasOverlap ? (overlapColumn * 100) / overlapCount : 0;
  const horizontalInset = 4;
  const baseZ = hasOverlap ? 25 + overlapColumn : 25;
  const isLocked = event.extendedProps?.timeLocked === true;

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const ext: any = event.extendedProps || {};
    const largeProjectId = ext.largeProjectId;
    if (ext.isLargeProject && largeProjectId) {
      navigate(`/large-project/${largeProjectId}`);
      return;
    }
    if (event.bookingId) {
      // Always resolve to project view (medium or large), never the booking detail page.
      handleProjectEventClick({
        event: {
          start: event.start,
          extendedProps: { bookingId: event.bookingId, largeProjectId },
        },
      });
    }
  }, [event, navigate, handleProjectEventClick]);

  return (
    <div
      draggable={!readOnly}
      onDragStart={handleDragStart}
      onDoubleClick={handleDoubleClick}
      className={`${hasOverlap ? 'cascaded-event ' : ''}${isLocked ? 'locked-event-wrapper' : ''}`.trim() || undefined}
      style={{
        position: 'absolute',
        top: `${position.top}px`,
        height: `${position.height}px`,
        left: `calc(${horizontalInset}px + ${leftPercent}%)`,
        width: `calc(${overlapWidthPercent}% - ${horizontalInset * 2}px)`,
        zIndex: baseZ,
        pointerEvents: 'auto',
        cursor: readOnly ? 'default' : 'grab',
        borderRadius: isLocked ? '6px' : undefined,
        boxShadow: isLocked ? '0 0 0 1.5px hsl(var(--destructive))' : undefined,
      }}
    >
      <CustomEvent
        event={event}
        resource={{ id: event.resourceId, title: '' } as Resource}
        style={{ width: '100%', height: '100%', position: 'relative' }}
        onEventResize={onEventResize}
        readOnly={readOnly}
        setEvents={setEvents}
      />
    </div>
  );
});

export const SimpleTimeSlot: React.FC<{
  children: React.ReactNode;
  isLast?: boolean;
  gridColumn?: number;
  fullWidth?: boolean;
  fixedWidth?: number;
}> = React.memo(({ children, isLast, gridColumn, fullWidth, fixedWidth }) => {
  return (
    <div
      className={`time-slot-wrapper ${isLast ? 'is-last' : ''}`}
      style={{
        gridColumn,
        width: fullWidth ? 'auto' : (fixedWidth ? `${fixedWidth}px` : '100%'),
        minWidth: fullWidth
          ? (fixedWidth ? `${fixedWidth}px` : 0)
          : (fixedWidth ? `${fixedWidth}px` : '100%'),
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
});
