import { useState, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/calendarService';
import { supabase } from '@/integrations/supabase/client';
import { extractUTCTime, buildUTCDateTime } from '@/utils/dateUtils';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';

// Serializable subset stored in dataTransfer
export interface DraggedEventData {
  id: string;
  title: string;
  start: string;
  end: string;
  bookingId?: string;
  eventType?: string;
  resourceId: string;
  isSyntheticFallback?: boolean;
  largeProjectId?: string;
}

export const DRAG_DATA_TYPE = 'application/x-calendar-event';

export const useEventDragDrop = (refreshEvents?: () => Promise<void>) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const dragCounterRef = useRef<Map<string, number>>(new Map());

  const handleDragStart = useCallback((e: React.DragEvent, event: CalendarEvent) => {
    const data: DraggedEventData = {
      id: event.id,
      title: event.title,
      start: typeof event.start === 'string' ? event.start : new Date(event.start).toISOString(),
      end: typeof event.end === 'string' ? event.end : new Date(event.end).toISOString(),
      bookingId: event.bookingId,
      eventType: event.eventType,
      resourceId: event.resourceId,
      isSyntheticFallback: !!(event.extendedProps as any)?.isSyntheticFallback,
      largeProjectId: (event.extendedProps as any)?.largeProjectId,
    };
    e.dataTransfer.setData(DRAG_DATA_TYPE, JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
    // Small delay so the dragged element doesn't disappear instantly
    requestAnimationFrame(() => setIsDragging(true));
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDragOverDate(null);
    dragCounterRef.current.clear();
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_DATA_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, dateStr: string) => {
    if (!e.dataTransfer.types.includes(DRAG_DATA_TYPE)) return;
    e.preventDefault();
    const counter = (dragCounterRef.current.get(dateStr) || 0) + 1;
    dragCounterRef.current.set(dateStr, counter);
    setDragOverDate(dateStr);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent, dateStr: string) => {
    const counter = (dragCounterRef.current.get(dateStr) || 1) - 1;
    dragCounterRef.current.set(dateStr, counter);
    if (counter <= 0) {
      dragCounterRef.current.delete(dateStr);
      setDragOverDate(prev => prev === dateStr ? null : prev);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    setDragOverDate(null);
    setIsDragging(false);
    dragCounterRef.current.clear();

    const raw = e.dataTransfer.getData(DRAG_DATA_TYPE);
    if (!raw) return;

    let eventData: DraggedEventData;
    try {
      eventData = JSON.parse(raw);
    } catch {
      return;
    }

    // Check if dropping on the same date
    const currentDateStr = eventData.start.split('T')[0];
    if (currentDateStr === targetDateStr) return;

    // Guard: large projects manage their own dates via the project page; the
    // planner's drag flow only knows how to move single-booking events.
    if (eventData.largeProjectId) {
      toast.error('Kan inte flytta dagar för stora projekt här.', {
        description: 'Öppna projektet och justera datumen i projektvyn.',
      });
      return;
    }

    // Guard: synthetic fallback rows do not exist in calendar_events yet.
    // The backend reconciler must create the real row first; a planner move
    // would otherwise update nothing and confuse the user.
    if (eventData.isSyntheticFallback || eventData.id.startsWith('synthetic-')) {
      toast.error('Den här dagen är inte synkad än.', {
        description: 'Vänta tills bokningen är fullt synkroniserad och försök igen.',
      });
      return;
    }

    setIsMoving(true);
    try {
      const startTimeStr = extractUTCTime(eventData.start);
      const endTimeStr = extractUTCTime(eventData.end);
      const newStartISO = buildUTCDateTime(targetDateStr, startTimeStr);
      const newEndISO = buildUTCDateTime(targetDateStr, endTimeStr);

      // Update calendar event
      await updateCalendarEvent(eventData.id, {
        start: newStartISO,
        end: newEndISO,
      });

      // Also update booking dates to stay in sync
      if (eventData.bookingId && eventData.eventType) {
        const bookingFields: Record<string, { date: string; start: string; end: string }> = {
          rig: { date: 'rigdaydate', start: 'rig_start_time', end: 'rig_end_time' },
          event: { date: 'eventdate', start: 'event_start_time', end: 'event_end_time' },
          rigDown: { date: 'rigdowndate', start: 'rigdown_start_time', end: 'rigdown_end_time' },
        };
        const fields = bookingFields[eventData.eventType];
        if (fields) {
          await supabase
            .from('bookings')
            .update({
              [fields.date]: targetDateStr,
              [fields.start]: newStartISO,
              [fields.end]: newEndISO,
            })
            .eq('id', eventData.bookingId);
        }
      }

      const targetDate = new Date(targetDateStr + 'T12:00:00Z');
      toast.success('Event flyttat', {
        description: `${eventData.title} → ${format(targetDate, 'EEE d MMM')}`,
      });

      if (refreshEvents) await refreshEvents();
    } catch (error) {
      console.error('Error moving event via drag:', error);
      toast.error('Kunde inte flytta eventet. Försök igen.');
      if (refreshEvents) await refreshEvents();
    } finally {
      setIsMoving(false);
    }
  }, [refreshEvents]);

  return {
    isDragging,
    dragOverDate,
    isMoving,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
  };
};
