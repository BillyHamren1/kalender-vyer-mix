import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTeamResources } from '@/hooks/useTeamResources';
import type { CalendarEvent } from './ResourceData';

interface Props {
  event: CalendarEvent;
  setEvents?: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  onUpdate?: () => Promise<void>;
}

/**
 * Två pilar (← →) i nedre högra hörnet av eventet — flyttar till föregående
 * eller nästa team i listan. Klick öppnar en dialog där användaren väljer:
 *   - "Endast denna dag" → uppdaterar bara denna calendar_events-rad
 *   - "Hela serien" → flyttar alla calendar_events för bookingen (eller alla
 *     syskonbokningar i large_project) till valt team
 */
export const MoveDayPopover: React.FC<Props> = ({ event, setEvents, onUpdate }) => {
  const { teamResources } = useTeamResources();
  const [busy, setBusy] = useState(false);
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
  const [pendingTeamTitle, setPendingTeamTitle] = useState<string>('');

  // Sortera ut bara riktiga team-kolumner (inte transport/lager-bryggan eller team-11)
  const teams = teamResources.filter(
    (r: any) => r.id !== 'team-11' && r.id !== 'transport'
  );

  const currentIdx = teams.findIndex((t: any) => t.id === event.resourceId);
  const prevTeam = currentIdx > 0 ? teams[currentIdx - 1] : null;
  const nextTeam =
    currentIdx >= 0 && currentIdx < teams.length - 1 ? teams[currentIdx + 1] : null;

  const recompute = async (bookingId: string, sourceDate: string) => {
    try {
      await supabase.rpc('recompute_booking_staff_for_day' as any, {
        p_booking_id: bookingId,
        p_assignment_date: sourceDate,
      });
    } catch (e) {
      console.warn('[MoveDayPopover] recompute_booking_staff_for_day failed (continuing):', e);
    }
  };

  const moveOneDay = async (newTeamId: string) => {
    setBusy(true);
    let prevSnapshot: CalendarEvent[] | null = null;
    try {
      const sourceDate = (event as any).source_date || event.start.split('T')[0];

      if (setEvents) {
        setEvents((prev) => {
          prevSnapshot = prev;
          return prev.map((ev) => {
            const sameLargeProjectDay =
              (ev.extendedProps as any)?.largeProjectId &&
              (ev.extendedProps as any)?.largeProjectId === (event.extendedProps as any)?.largeProjectId &&
              ev.eventType === event.eventType &&
              (typeof ev.start === 'string' ? ev.start : new Date(ev.start as any).toISOString()).split('T')[0] === sourceDate;

            if (sameLargeProjectDay || ev.id === event.id) {
              return { ...ev, resourceId: newTeamId };
            }
            return ev;
          });
        });
      }

      const { error } = await supabase
        .from('calendar_events')
        .update({ resource_id: newTeamId })
        .eq('id', event.id);
      if (error) throw error;
      if (event.bookingId) await recompute(event.bookingId, sourceDate);
      toast.success('Dagen flyttad');
      if (onUpdate) void onUpdate();
    } catch (e: any) {
      if (prevSnapshot && setEvents) setEvents(prevSnapshot);
      toast.error(e?.message || 'Kunde inte flytta dagen');
    } finally {
      setBusy(false);
      setPendingTeamId(null);
    }
  };

  const moveAllDays = async (newTeamId: string) => {
    if (!event.bookingId) {
      toast.error('Saknar booking-koppling');
      setPendingTeamId(null);
      return;
    }
    setBusy(true);
    let prevSnapshot: CalendarEvent[] | null = null;
    try {
      if (setEvents) {
        setEvents((prev) => {
          prevSnapshot = prev;
          return prev.map((ev) => {
            const sameLargeProject =
              (ev.extendedProps as any)?.largeProjectId &&
              (ev.extendedProps as any)?.largeProjectId === (event.extendedProps as any)?.largeProjectId &&
              ev.eventType !== 'activity';
            const sameBookingSeries = ev.bookingId === event.bookingId && ev.eventType !== 'activity';

            if (sameLargeProject || sameBookingSeries) {
              return { ...ev, resourceId: newTeamId };
            }
            return ev;
          });
        });
      }

      const { data: thisBooking } = await supabase
        .from('bookings')
        .select('id, large_project_id')
        .eq('id', event.bookingId)
        .single();

      let bookingIds: string[] = [event.bookingId];
      if (thisBooking?.large_project_id) {
        const { data: siblings } = await supabase
          .from('bookings')
          .select('id')
          .eq('large_project_id', thisBooking.large_project_id);
        bookingIds = (siblings || []).map((s) => s.id);
      }

      const { data: events } = await supabase
        .from('calendar_events')
        .select('id, booking_id, source_date, start_time')
        .in('booking_id', bookingIds)
        .neq('event_type', 'activity');

      const targetIds = (events || []).map((e) => e.id);
      if (targetIds.length === 0) {
        toast.info('Inga events att flytta');
        return;
      }

      const { error } = await supabase
        .from('calendar_events')
        .update({ resource_id: newTeamId })
        .in('id', targetIds);
      if (error) throw error;

      const seen = new Set<string>();
      for (const ev of events || []) {
        const key = `${ev.booking_id}|${ev.source_date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        await recompute(ev.booking_id, ev.source_date || (ev.start_time?.split('T')[0] ?? ''));
      }

      toast.success(`Flyttade ${targetIds.length} dag${targetIds.length === 1 ? '' : 'ar'}`);
      if (onUpdate) void onUpdate();
    } catch (e: any) {
      if (prevSnapshot && setEvents) setEvents(prevSnapshot);
      toast.error(e?.message || 'Kunde inte flytta hela serien');
    } finally {
      setBusy(false);
      setPendingTeamId(null);
    }
  };

  /**
   * Räkna hur många calendar_events som finns i SAMMA fas (rig/event/rigDown)
   * för bookingen — eller, om bookingen tillhör ett large_project, för alla
   * syskonbokningar. Om bara 1 → ingen serie att fråga om, flytta direkt.
   */
  const countSeriesEventsInPhase = async (): Promise<number> => {
    if (!event.bookingId || !event.eventType) return 0;
    try {
      const { data: thisBooking } = await supabase
        .from('bookings')
        .select('id, large_project_id')
        .eq('id', event.bookingId)
        .single();

      let bookingIds: string[] = [event.bookingId];
      if (thisBooking?.large_project_id) {
        const { data: siblings } = await supabase
          .from('bookings')
          .select('id')
          .eq('large_project_id', thisBooking.large_project_id);
        bookingIds = (siblings || []).map((s) => s.id);
      }

      const { count } = await supabase
        .from('calendar_events')
        .select('id', { count: 'exact', head: true })
        .in('booking_id', bookingIds)
        .eq('event_type', event.eventType);

      return count || 0;
    } catch (err) {
      console.warn('[MoveDayPopover] countSeriesEventsInPhase failed:', err);
      return 0;
    }
  };

  const requestMove = (team: { id: string; title: string } | null) => async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!team || busy) return;

    // Om det bara finns ett event i denna fas för hela serien — flytta direkt utan dialog.
    setBusy(true);
    const seriesCount = await countSeriesEventsInPhase();
    setBusy(false);

    if (seriesCount <= 1) {
      void moveOneDay(team.id);
      return;
    }

    setPendingTeamId(team.id);
    setPendingTeamTitle(team.title);
  };

  return (
    <>
      {prevTeam && (
        <button
          type="button"
          onClick={requestMove(prevTeam)}
          disabled={busy}
          className="event-hover-action absolute bottom-0.5 left-0.5 p-0.5 rounded bg-white/70 hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed z-20"
          title={`Flytta till ${prevTeam.title}`}
        >
          <ChevronLeft className="h-3 w-3 text-primary" />
        </button>
      )}
      {nextTeam && (
        <button
          type="button"
          onClick={requestMove(nextTeam)}
          disabled={busy}
          className="event-hover-action absolute bottom-0.5 right-0.5 p-0.5 rounded bg-white/70 hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed z-20"
          title={`Flytta till ${nextTeam.title}`}
        >
          <ChevronRight className="h-3 w-3 text-primary" />
        </button>
      )}

      <AlertDialog
        open={pendingTeamId !== null}
        onOpenChange={(o) => !o && setPendingTeamId(null)}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Byta team till {pendingTeamTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              Vill du flytta endast denna dag, eller alla dagar i serien (samma projekt)?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={busy}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (pendingTeamId) moveOneDay(pendingTeamId);
              }}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Endast denna dag
            </AlertDialogAction>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (pendingTeamId) moveAllDays(pendingTeamId);
              }}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Hela serien
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
