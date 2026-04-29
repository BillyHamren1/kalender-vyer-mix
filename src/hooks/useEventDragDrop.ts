import { useState, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/calendarService';
import { supabase } from '@/integrations/supabase/client';
import { extractUTCTime, buildUTCDateTime } from '@/utils/dateUtils';
import { moveLargeProjectDay, type LargeProjectPhase } from '@/services/largeProjectPlannerService';
import { resolveCalendarEventId, isSyntheticCalendarEventId } from '@/services/calendarEventResolver';
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

    setIsMoving(true);
    try {
      const startTimeStr = extractUTCTime(eventData.start);
      const endTimeStr = extractUTCTime(eventData.end);
      const newStartISO = buildUTCDateTime(targetDateStr, startTimeStr);
      const newEndISO = buildUTCDateTime(targetDateStr, endTimeStr);

      // ── Large project: move the whole project-day across all linked bookings
      if (eventData.largeProjectId && eventData.eventType) {
        await moveLargeProjectDay({
          largeProjectId: eventData.largeProjectId,
          phase: eventData.eventType as LargeProjectPhase,
          fromDate: currentDateStr,
          toDate: targetDateStr,
          newStartISO,
          newEndISO,
        });
        const targetDate = new Date(targetDateStr + 'T12:00:00Z');
        toast.success('Projektdag flyttad', {
          description: `${eventData.title} → ${format(targetDate, 'EEE d MMM')}`,
        });
        if (refreshEvents) await refreshEvents();
        return;
      }

      // ── Normal booking move (synthetic OR real calendar_events id):
      // 1) Always update bookings.<phase>_*_time + .<phase>date — this is the
      //    authoritative write that import-bookings reconciles from.
      // 2) Try to resolve a real calendar_events row; if one exists, update it
      //    in place. If none exists yet, skip silently — the reconciler will
      //    materialize it on next sync.
      //
      // This was previously only done for events flagged isSyntheticFallback,
      // which meant staff-calendar derived rows (id starts with `staff-`) hit
      // updateCalendarEvent with an id that doesn't exist → 0 rows + opaque
      // "Kunde inte flytta eventet" toast. That's fixed here.
      const phaseFields: Record<string, { date: string; start: string; end: string }> = {
        rig: { date: 'rigdaydate', start: 'rig_start_time', end: 'rig_end_time' },
        event: { date: 'eventdate', start: 'event_start_time', end: 'event_end_time' },
        rigDown: { date: 'rigdowndate', start: 'rigdown_start_time', end: 'rigdown_end_time' },
      };
      const fields = eventData.eventType ? phaseFields[eventData.eventType] : undefined;

      if (!eventData.bookingId || !fields) {
        toast.error('Kunde inte flytta — saknar bokningsreferens.');
        return;
      }

      // 1. Update booking row (authoritative)
      const { error: bkErr } = await supabase
        .from('bookings')
        .update({
          [fields.date]: targetDateStr,
          [fields.start]: newStartISO,
          [fields.end]: newEndISO,
        })
        .eq('id', eventData.bookingId);
      if (bkErr) {
        console.error('[useEventDragDrop] bookings update failed', bkErr);
        throw new Error(`Kunde inte uppdatera bokningen: ${bkErr.message}`);
      }

      // 2. Try to update an existing calendar_events row in place
      const realEventId = await resolveCalendarEventId({
        rawId: eventData.id,
        bookingId: eventData.bookingId,
        eventType: eventData.eventType,
        sourceDate: currentDateStr,
      });

      if (realEventId) {
        try {
          await updateCalendarEvent(realEventId, {
            start: newStartISO,
            end: newEndISO,
          });
        } catch (err) {
          // Booking write already succeeded; calendar_event row will be
          // reconciled on next import-bookings tick. Surface a warning, not
          // a blocking error.
          console.warn('[useEventDragDrop] calendar_events update failed (non-fatal)', err);
        }
      } else if (isSyntheticCalendarEventId(eventData.id)) {
        // Expected: derived staff-calendar row with no underlying calendar_event yet.
        console.log('[useEventDragDrop] no calendar_events row for', {
          bookingId: eventData.bookingId,
          eventType: eventData.eventType,
          fromDate: currentDateStr,
        }, '— relying on reconciler');
      }

      const targetDate = new Date(targetDateStr + 'T12:00:00Z');
      toast.success('Riggdag flyttad', {
        description: `${eventData.title} → ${format(targetDate, 'EEE d MMM')}`,
      });

      if (refreshEvents) await refreshEvents();
    } catch (error: any) {
      console.error('Error moving event via drag:', error);
      const detail = error?.message || error?.error_description || error?.hint || (typeof error === 'string' ? error : '');
      toast.error('Kunde inte flytta eventet', {
        description: detail ? `Detaljer: ${detail}` : 'Försök igen — om felet kvarstår, skicka mig texten i konsolen.',
      });
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
