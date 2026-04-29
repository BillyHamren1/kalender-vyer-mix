import { useState, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/calendarService';
import { supabase } from '@/integrations/supabase/client';
import { extractUTCTime, buildUTCDateTime } from '@/utils/dateUtils';
import { moveLargeProjectDay, type LargeProjectPhase } from '@/services/largeProjectPlannerService';
import { resolveCalendarEventId } from '@/services/calendarEventResolver';
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

      // ── Normal booking move (date change).
      // calendar_events is the single source of truth: every visible row has a
      // real DB row (backfill + import-bookings expansion guarantee this). We
      // resolve the real id, update calendar_events in place, and mirror the
      // canonical date/time onto the bookings row.
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

      const realEventId = await resolveCalendarEventId({
        rawId: eventData.id,
        bookingId: eventData.bookingId,
        eventType: eventData.eventType,
        sourceDate: currentDateStr,
      });

      if (!realEventId) {
        // Should not happen post-backfill — surface clearly so we catch any miss.
        toast.error('Kunde inte hitta kalenderhändelsen att flytta', {
          description: `Bokning ${eventData.bookingId} (${eventData.eventType} ${currentDateStr}) saknar rad i calendar_events. Kör backfill.`,
        });
        return;
      }

      // 1. Update the calendar_events row in place (date + time on the row)
      try {
        await updateCalendarEvent(realEventId, { start: newStartISO, end: newEndISO });
      } catch (err) {
        console.error('[useEventDragDrop] calendar_events update failed', err);
        throw err;
      }

      // 2. Mirror canonical date/time onto bookings row — but ONLY if the
      //    day we moved is the booking's PRIMARY date for this phase.
      //    Multi-day rig/rigDown has extra calendar_events rows that should
      //    NOT overwrite bookings.<phase>date when moved (that's just a
      //    secondary day).
      const { data: bk } = await supabase
        .from('bookings')
        .select(`${fields.date}`)
        .eq('id', eventData.bookingId)
        .maybeSingle();
      const primaryDate = (bk as any)?.[fields.date];
      const isPrimaryDay = primaryDate && primaryDate === currentDateStr;

      if (isPrimaryDay) {
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
      } else {
        console.log('[useEventDragDrop] Skipping bookings mirror — not primary day', {
          bookingId: eventData.bookingId, phase: eventData.eventType,
          primaryDate, movedFrom: currentDateStr,
        });
      }

      // 3. Räkna om BSA för båda dagarna (källa städas, mål fylls från teamet)
      try {
        await Promise.all([
          supabase.rpc('recompute_booking_staff_for_day' as any, {
            p_booking_id: eventData.bookingId,
            p_date: currentDateStr,
          }),
          supabase.rpc('recompute_booking_staff_for_day' as any, {
            p_booking_id: eventData.bookingId,
            p_date: targetDateStr,
          }),
        ]);
      } catch (rpcErr) {
        console.warn('[useEventDragDrop] BSA recompute failed (non-fatal)', rpcErr);
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
