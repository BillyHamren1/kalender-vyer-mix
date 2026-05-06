import { useState, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/calendarService';
import { supabase } from '@/integrations/supabase/client';
import { extractUTCTime, buildUTCDateTime } from '@/utils/dateUtils';
import { moveLargeProjectDay, setLargeProjectDayTeam, type LargeProjectPhase } from '@/services/largeProjectPlannerService';
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
  targetResourceId?: string;
  isSyntheticFallback?: boolean;
  largeProjectId?: string;
  // For large-project tiles: every calendar_events.id that belongs to this
  // (project, phase, date, team) group. Drag mutates the WHOLE group.
  consolidatedEventIds?: string[];
  consolidatedBookingIds?: string[];
}

export const DRAG_DATA_TYPE = 'application/x-calendar-event';

export const useEventDragDrop = (
  refreshEvents?: () => Promise<void>,
  setEvents?: React.Dispatch<React.SetStateAction<CalendarEvent[]>>,
) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const dragCounterRef = useRef<Map<string, number>>(new Map());

  const handleDragStart = useCallback((e: React.DragEvent, event: CalendarEvent) => {
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

  const handleDrop = useCallback(async (e: React.DragEvent, targetDateStr: string, targetResourceId?: string) => {
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

    const currentDateStr = eventData.start.split('T')[0];
    const targetTeamId = targetResourceId || eventData.targetResourceId || eventData.resourceId;
    const teamChanged = targetTeamId !== eventData.resourceId;
    if (currentDateStr === targetDateStr && !teamChanged) return;

    setIsMoving(true);

    // ── Snapshot for rollback if the server rejects ──
    let prevSnapshot: CalendarEvent[] | null = null;

    try {
      const startTimeStr = extractUTCTime(eventData.start);
      const endTimeStr = extractUTCTime(eventData.end);
      const newStartISO = buildUTCDateTime(targetDateStr, startTimeStr);
      const newEndISO = buildUTCDateTime(targetDateStr, endTimeStr);

      // ── OPTIMISTIC UI: flytta eventet direkt så att användaren ser
      //    förflyttningen omedelbart. Servern körs i bakgrunden; vid fel
      //    rullar vi tillbaka och gör en refresh.
      if (setEvents) {
        setEvents(prev => {
          prevSnapshot = prev;
          if (eventData.largeProjectId && eventData.eventType) {
            // Flytta endast denna teams tile för (projekt, fas, datum) — andra
            // team för samma projektdag rörs inte.
            return prev.map(ev => {
              const lpId = (ev.extendedProps as any)?.largeProjectId;
              const evDateStr = (typeof ev.start === 'string' ? ev.start : new Date(ev.start as any).toISOString()).split('T')[0];
              if (
                lpId === eventData.largeProjectId &&
                ev.eventType === eventData.eventType &&
                evDateStr === currentDateStr &&
                ev.resourceId === eventData.resourceId
              ) {
                return { ...ev, start: newStartISO, end: newEndISO, resourceId: targetTeamId };
              }
              return ev;
            });
          }
          return prev.map(ev =>
            ev.id === eventData.id
              ? { ...ev, start: newStartISO, end: newEndISO, resourceId: targetTeamId }
              : ev
          );
        });
      }

      // ── Large project tile = a (project, phase, date, team) group of
      //    calendar_events rows. Mutate every row in the group atomically.
      //    Same-team move on a different date → also update bookings phase
      //    date for any sibling whose primary phase date matched the source.
      if (eventData.largeProjectId && eventData.eventType) {
        // 1. Resolve the exact set of calendar_events rows to update — keyed
        //    by (largeProjectId, phase, sourceDate, teamId). NEVER by a single
        //    sub-booking. Three-tier resolution:
        //      a) consolidatedEventIds from the tile metadata (preferred)
        //      b) lookup via consolidatedBookingIds + phase/date/team
        //      c) deep fallback: large_project_bookings → calendar_events
        let eventIds = (eventData.consolidatedEventIds || []).filter(Boolean);

        let bookingIdsForRecompute = Array.from(
          new Set((eventData.consolidatedBookingIds || []).filter(Boolean))
        );

        if (eventIds.length === 0) {
          if (bookingIdsForRecompute.length === 0) {
            // Deep fallback — load all sibling bookings for this large project.
            const { data: lpbRows, error: lpbErr } = await supabase
              .from('large_project_bookings')
              .select('booking_id')
              .eq('large_project_id', eventData.largeProjectId);
            if (lpbErr) throw lpbErr;
            bookingIdsForRecompute = Array.from(
              new Set((lpbRows || []).map((r: any) => r.booking_id).filter(Boolean))
            );
          }

          if (bookingIdsForRecompute.length > 0) {
            const { data: rows, error: lookupErr } = await supabase
              .from('calendar_events')
              .select('id')
              .in('booking_id', bookingIdsForRecompute)
              .eq('event_type', eventData.eventType)
              .eq('source_date', currentDateStr)
              .eq('resource_id', eventData.resourceId);
            if (lookupErr) throw lookupErr;
            eventIds = (rows || []).map(r => r.id);
          }
        }

        if (eventIds.length === 0) {
          toast.error('Hittade inga kalenderrader för denna projektdag.');
          if (prevSnapshot && setEvents) setEvents(prevSnapshot);
          return;
        }

        // 2. Update the WHOLE group: new resource, new times, new source_date.
        const { error: updErr } = await supabase
          .from('calendar_events')
          .update({
            resource_id: targetTeamId,
            start_time: newStartISO,
            end_time: newEndISO,
            source_date: targetDateStr,
          })
          .in('id', eventIds);
        if (updErr) throw updErr;

        if (import.meta.env.DEV) {
          console.info('[calendar-team-change] large project (drag)', {
            eventId: eventData.id,
            bookingId: eventData.bookingId,
            largeProjectId: eventData.largeProjectId,
            phase: eventData.eventType,
            sourceDate: currentDateStr,
            targetDate: targetDateStr,
            oldTeamId: eventData.resourceId,
            newTeamId: targetTeamId,
            updatedEventIds: eventIds,
            ranRecompute: true,
          });
        }

        // 3. BSA-recompute för varje booking på källa+mål-datum.
        const bookingIds = Array.from(new Set(eventData.consolidatedBookingIds || []));
        const dates = Array.from(new Set([currentDateStr, targetDateStr]));
        await Promise.all(bookingIds.flatMap(bid =>
          dates.map(d =>
            supabase.rpc('recompute_booking_staff_for_day' as any, {
              p_booking_id: bid,
              p_date: d,
            }).then(() => {}, (err: any) => {
              console.warn('[useEventDragDrop] BSA recompute failed (non-fatal)', { bid, d, err });
            })
          )
        ));

        const targetDate = new Date(targetDateStr + 'T12:00:00Z');
        toast.success('Projektdag flyttad', {
          description: `${eventData.title} → ${format(targetDate, 'EEE d MMM')}`,
        });
        if (refreshEvents) void refreshEvents();
        return;
      }

      if (currentDateStr === targetDateStr && teamChanged) {
        const realEventId = await resolveCalendarEventId({
          rawId: eventData.id,
          bookingId: eventData.bookingId,
          eventType: eventData.eventType,
          sourceDate: currentDateStr,
        });

        if (!realEventId) {
          toast.error('Kunde inte hitta kalenderhändelsen att flytta');
          if (prevSnapshot && setEvents) setEvents(prevSnapshot);
          return;
        }

        await updateCalendarEvent(realEventId, { resourceId: targetTeamId });

        if (eventData.bookingId) {
          await supabase.rpc('recompute_booking_staff_for_day' as any, {
            p_booking_id: eventData.bookingId,
            p_date: currentDateStr,
          });
        }

        toast.success('Team uppdaterat');
        if (refreshEvents) void refreshEvents();
        return;
      }

      // ── Normal booking move (date change).
      const phaseFields: Record<string, { date: string; start: string; end: string }> = {
        rig: { date: 'rigdaydate', start: 'rig_start_time', end: 'rig_end_time' },
        event: { date: 'eventdate', start: 'event_start_time', end: 'event_end_time' },
        rigDown: { date: 'rigdowndate', start: 'rigdown_start_time', end: 'rigdown_end_time' },
      };
      const fields = eventData.eventType ? phaseFields[eventData.eventType] : undefined;

      if (!eventData.bookingId || !fields) {
        toast.error('Kunde inte flytta — saknar bokningsreferens.');
        if (prevSnapshot && setEvents) setEvents(prevSnapshot);
        return;
      }

      // Parallellisera resolve + bookings-fetch (oberoende av varandra).
      const [realEventId, bkRes] = await Promise.all([
        resolveCalendarEventId({
          rawId: eventData.id,
          bookingId: eventData.bookingId,
          eventType: eventData.eventType,
          sourceDate: currentDateStr,
        }),
        supabase
          .from('bookings')
          .select(`${fields.date}`)
          .eq('id', eventData.bookingId)
          .maybeSingle(),
      ]);

      if (!realEventId) {
        toast.error('Kunde inte hitta kalenderhändelsen att flytta', {
          description: `Bokning ${eventData.bookingId} (${eventData.eventType} ${currentDateStr}) saknar rad i calendar_events. Kör backfill.`,
        });
        if (prevSnapshot && setEvents) setEvents(prevSnapshot);
        return;
      }

      const primaryDate = (bkRes.data as any)?.[fields.date];
      const isPrimaryDay = primaryDate && primaryDate === currentDateStr;

      // 1. Update the calendar_events row in place.
      // PERSONALKALENDER-REGEL: vid datumflytt MÅSTE resource_id alltid
      // sparas tillsammans med start/end (team är dagsspecifikt — samma
      // teamkolumn på ny dag är en ny dag-team-koppling).
      try {
        const updatePayload: any = { start: newStartISO, end: newEndISO, resourceId: targetTeamId };
        if (import.meta.env.DEV) {
          console.info('[calendar-team-change] normal booking (drag)', {
            eventId: eventData.id,
            realEventId,
            bookingId: eventData.bookingId,
            largeProjectId: eventData.largeProjectId,
            phase: eventData.eventType,
            sourceDate: currentDateStr,
            targetDate: targetDateStr,
            oldTeamId: eventData.resourceId,
            newTeamId: targetTeamId,
            teamChanged,
            updatedEventIds: [realEventId],
            ranRecompute: true,
          });
        }
        await updateCalendarEvent(realEventId, updatePayload);
      } catch (err) {
        console.error('[useEventDragDrop] calendar_events update failed', err);
        throw err;
      }

      // 2. Mirror canonical date/time onto bookings — only for primary day.
      // 3. BSA-recompute för båda dagarna.
      // Allt detta körs parallellt — de är oberoende av varandra.
      const tasks: Promise<unknown>[] = [];
      if (isPrimaryDay) {
        tasks.push(
          Promise.resolve(
            supabase
              .from('bookings')
              .update({
                [fields.date]: targetDateStr,
                [fields.start]: newStartISO,
                [fields.end]: newEndISO,
              })
              .eq('id', eventData.bookingId)
          ).then(({ error: bkErr }: any) => {
            if (bkErr) {
              console.error('[useEventDragDrop] bookings update failed', bkErr);
              throw new Error(`Kunde inte uppdatera bokningen: ${bkErr.message}`);
            }
          })
        );
      } else {
        console.log('[useEventDragDrop] Skipping bookings mirror — not primary day', {
          bookingId: eventData.bookingId, phase: eventData.eventType,
          primaryDate, movedFrom: currentDateStr,
        });
      }

      tasks.push(
        Promise.resolve(
          supabase.rpc('recompute_booking_staff_for_day' as any, {
            p_booking_id: eventData.bookingId,
            p_date: currentDateStr,
          })
        ).then(() => {}, (rpcErr: any) => {
          console.warn('[useEventDragDrop] BSA recompute (source) failed (non-fatal)', rpcErr);
        }),
        Promise.resolve(
          supabase.rpc('recompute_booking_staff_for_day' as any, {
            p_booking_id: eventData.bookingId,
            p_date: targetDateStr,
          })
        ).then(() => {}, (rpcErr: any) => {
          console.warn('[useEventDragDrop] BSA recompute (target) failed (non-fatal)', rpcErr);
        }),
      );

      await Promise.all(tasks);

      const targetDate = new Date(targetDateStr + 'T12:00:00Z');
      toast.success('Riggdag flyttad', {
        description: `${eventData.title} → ${format(targetDate, 'EEE d MMM')}`,
      });

      // Refresh i bakgrunden — UI är redan synkat optimistiskt.
      if (refreshEvents) void refreshEvents();
    } catch (error: any) {
      console.error('Error moving event via drag:', error);
      // Rollback optimistic update
      if (prevSnapshot && setEvents) setEvents(prevSnapshot);
      const detail = error?.message || error?.error_description || error?.hint || (typeof error === 'string' ? error : '');
      toast.error('Kunde inte flytta eventet', {
        description: detail ? `Detaljer: ${detail}` : 'Försök igen — om felet kvarstår, skicka mig texten i konsolen.',
      });
      if (refreshEvents) void refreshEvents();
    } finally {
      setIsMoving(false);
    }
  }, [refreshEvents, setEvents]);

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
