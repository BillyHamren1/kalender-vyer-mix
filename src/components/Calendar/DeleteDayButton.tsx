import React, { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
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
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { deleteCalendarEvent } from '@/services/eventService';
import type { CalendarEvent } from './ResourceData';

interface Props {
  event: CalendarEvent;
  setEvents?: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  onUpdate?: () => Promise<void> | void;
}

/**
 * Trash-knapp i nedre högra hörnet — radera en enskild rigg-/event-/rigDown-dag
 * från calendar_events. Bekräftelsedialog innan radering.
 *
 * Skyddar mot att radera den sista raden av en eventtyp för bokningen
 * (då skulle reconciler-loopen återskapa den ändå — använd booking-redigering
 * istället för att helt ta bort en enda dag).
 */
export const DeleteDayButton: React.FC<Props> = ({ event, setEvents, onUpdate }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    if (!event.id) return;
    setBusy(true);
    let snapshot: CalendarEvent[] | null = null;

    try {
      // Optimistic remove
      if (setEvents) {
        setEvents((prev) => {
          snapshot = prev;
          return prev.filter((ev) => ev.id !== event.id);
        });
      }

      // Safety check: count remaining sibling rows of the same event_type for this booking.
      // If this is the LAST one, the import-bookings reconciler will likely recreate it
      // from booking dates. Warn but still proceed (user chose to delete).
      if (event.bookingId && event.eventType) {
        const { count } = await supabase
          .from('calendar_events')
          .select('id', { count: 'exact', head: true })
          .eq('booking_id', event.bookingId)
          .eq('event_type', event.eventType);

        if ((count ?? 0) <= 1) {
          toast.warning(
            'Detta är sista dagen av denna typ — den kan återskapas av synken om bokningens datum inte rensas.'
          );
        }
      }

      await deleteCalendarEvent(event.id);
      toast.success('Dagen borttagen');
      setOpen(false);
      if (onUpdate) await onUpdate();
    } catch (e: any) {
      console.error('[DeleteDayButton] delete failed:', e);
      if (snapshot && setEvents) setEvents(snapshot);
      toast.error(e?.message || 'Kunde inte ta bort dagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
        className="event-hover-action absolute bottom-0.5 left-0.5 p-0.5 rounded bg-white/70 hover:bg-destructive/20 z-20"
        title="Ta bort dag"
      >
        <Trash2 className="h-3 w-3 text-destructive" />
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort dag?</AlertDialogTitle>
            <AlertDialogDescription>
              Vill du ta bort denna dag från kalendern? Bokningen finns kvar — bara
              denna kalenderrad raderas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ta bort'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default DeleteDayButton;
