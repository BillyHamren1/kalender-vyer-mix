import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ArrowLeftRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useQueryClient } from '@tanstack/react-query';
import type { CalendarEvent } from './ResourceData';

interface Props {
  event: CalendarEvent;
}

/**
 * Liten "⇄ Flytta team"-knapp på event:et.
 * Två lägen: "Flytta denna dag" eller "Flytta alla dagar i projektet".
 *
 * - Denna dag → uppdaterar bara denna calendar_events-rad (resource_id) och
 *   triggar recompute_booking_staff_for_day så BSA speglas korrekt.
 * - Alla dagar → hämtar alla calendar_events för samma booking (eller alla
 *   syskonbokningar i large_project) och flyttar var och en till valt team
 *   per dag.
 */
export const MoveDayPopover: React.FC<Props> = ({ event }) => {
  const { teamResources } = useTeamResources();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const teams = teamResources.filter((r: any) =>
    r.id !== 'team-11' && r.id !== 'transport' && r.id !== event.resourceId
  );

  const recompute = async (bookingId: string, sourceDate: string) => {
    try {
      await supabase.rpc('recompute_booking_staff_for_day' as any, {
        p_booking_id: bookingId,
        p_assignment_date: sourceDate,
      });
    } catch (e) {
      // RPC kan saknas i vissa miljöer — då räcker resource_id-uppdateringen.
      console.warn('[MoveDayPopover] recompute_booking_staff_for_day failed (continuing):', e);
    }
  };

  const moveOneDay = async (newTeamId: string) => {
    setBusy(true);
    try {
      const sourceDate = (event as any).source_date || event.start.split('T')[0];
      const { error } = await supabase
        .from('calendar_events')
        .update({ resource_id: newTeamId })
        .eq('id', event.id);
      if (error) throw error;
      if (event.bookingId) await recompute(event.bookingId, sourceDate);
      toast.success('Dagen flyttad');
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte flytta dagen');
    } finally {
      setBusy(false);
    }
  };

  const moveAllDays = async (newTeamId: string) => {
    if (!event.bookingId) {
      toast.error('Saknar booking-koppling');
      return;
    }
    setBusy(true);
    try {
      // Hitta alla bokningar i samma "projekt" (large_project_id eller bara bokningen själv)
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
        bookingIds = (siblings || []).map(s => s.id);
      }

      // Hämta alla calendar_events för dessa bokningar (rig + rigDown)
      const { data: events } = await supabase
        .from('calendar_events')
        .select('id, booking_id, source_date, start_time')
        .in('booking_id', bookingIds)
        .neq('event_type', 'activity');

      const targetIds = (events || []).map(e => e.id);
      if (targetIds.length === 0) {
        toast.info('Inga events att flytta');
        return;
      }

      const { error } = await supabase
        .from('calendar_events')
        .update({ resource_id: newTeamId })
        .in('id', targetIds);
      if (error) throw error;

      // Recompute BSA per (booking, date)
      const seen = new Set<string>();
      for (const ev of events || []) {
        const key = `${ev.booking_id}|${ev.source_date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        await recompute(ev.booking_id, ev.source_date || (ev.start_time?.split('T')[0] ?? ''));
      }

      toast.success(`Flyttade ${targetIds.length} dag${targetIds.length === 1 ? '' : 'ar'}`);
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte flytta alla dagar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          className="absolute bottom-0.5 right-0.5 p-0.5 rounded bg-white/70 hover:bg-primary/20 z-20"
          title="Flytta team"
        >
          <ArrowLeftRight className="h-3 w-3 text-primary" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-56 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        {busy ? (
          <div className="flex items-center gap-2 py-2 justify-center text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Flyttar…
          </div>
        ) : (
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-2 py-1">
              Flytta till
            </div>
            {teams.map((t: any) => (
              <div key={t.id} className="rounded-md border border-border/50 p-1.5 space-y-1">
                <div className="text-xs font-medium px-1">{t.title}</div>
                <div className="grid grid-cols-2 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] justify-center"
                    onClick={() => moveOneDay(t.id)}
                  >
                    Denna dag
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] justify-center"
                    onClick={() => moveAllDays(t.id)}
                  >
                    Alla dagar
                  </Button>
                </div>
              </div>
            ))}
            {teams.length === 0 && (
              <div className="text-xs text-muted-foreground px-2 py-2">Inga andra team</div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
