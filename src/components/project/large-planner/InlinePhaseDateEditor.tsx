/**
 * InlinePhaseDateEditor
 * --------------------------------------------------------------------------
 * Klickbar datum-chip på Gantt-stapeln. Öppnar en popover med
 * multi-day-kalender. Vid Spara:
 *   1) raderar calendar_events-rader för fasen vars datum tagits bort
 *   2) anropar savePhaseDays för den nya datum-mängden (skapar/uppdaterar)
 *   3) invaliderar large-project-planner-querien
 *
 * Tider ärvs från befintlig första item (start_time/end_time). Saknas det
 * faller vi tillbaka på 08:00–17:00.
 */
import { useMemo, useState } from 'react';
import { parseISO, format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { savePhaseDays, type PhaseEventType } from '@/lib/calendar/phaseDaysWriter';

interface Props {
  bookingId: string | null;
  largeProjectId?: string | null;
  phase: 'rig' | 'event' | 'rigDown' | 'other';
  currentDates: string[];           // YYYY-MM-DD[]
  startTime?: string | null;        // HH:mm:ss
  endTime?: string | null;
  label: string;                    // visningstext
  className?: string;
  title?: string;                   // bokningsnamn för effektivTitle
}

function hhmm(t: string | null | undefined, fallback: string): string {
  if (!t) return fallback;
  return t.slice(0, 5);
}

export default function InlinePhaseDateEditor({
  bookingId,
  largeProjectId,
  phase,
  currentDates,
  startTime,
  endTime,
  label,
  className,
  title,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const initial = useMemo(
    () => currentDates.map((d) => parseISO(d)).sort((a, b) => a.getTime() - b.getTime()),
    [currentDates],
  );
  const [selected, setSelected] = useState<Date[]>(initial);
  const [busy, setBusy] = useState(false);

  // "other" och saknad booking_id går ej att skriva tillbaka via savePhaseDays
  const canEdit = !!bookingId && (phase === 'rig' || phase === 'event' || phase === 'rigDown');

  if (!canEdit) {
    return (
      <span className={className} title="Endast bokningsfaser går att redigera här">
        {label}
      </span>
    );
  }

  const eventType = phase as PhaseEventType;

  const handleSave = async () => {
    setBusy(true);
    try {
      const isoDates = selected.map((d) => format(d, 'yyyy-MM-dd')).sort();
      const orig = new Set(currentDates);
      const next = new Set(isoDates);
      const removed = currentDates.filter((d) => !next.has(d));

      // 1) Radera bort-tagna dagar (calendar_events). bookings.<phase>date
      //    rensas EJ — om hela fasen tas bort lämnar vi primärdatumet kvar
      //    och låter användaren hantera det manuellt.
      if (removed.length > 0) {
        const { data: bk } = await supabase
          .from('bookings').select('organization_id').eq('id', bookingId!).single();
        const orgId = bk?.organization_id;
        if (orgId) {
          await supabase
            .from('calendar_events')
            .delete()
            .eq('booking_id', bookingId!)
            .eq('organization_id', orgId)
            .eq('event_type', eventType)
            .in('source_date', removed);
        }
      }

      // 2) Skapa/uppdatera kvarvarande + nya
      if (isoDates.length > 0) {
        const result = await savePhaseDays({
          bookingId: bookingId!,
          largeProjectId: largeProjectId ?? null,
          eventType,
          dates: isoDates,
          startTime: hhmm(startTime, '08:00'),
          endTime: hhmm(endTime, '17:00'),
          title: title ?? null,
        });
        if (result.failures.length > 0) {
          toast.error(`Sparat ${result.successCount}/${result.totalDays} dagar`, {
            description: result.failures[0],
          });
        } else {
          toast.success(`Datum uppdaterat (${result.successCount} dag${result.successCount === 1 ? '' : 'ar'})`);
        }
      } else {
        toast.success('Datum borttagna');
      }

      // 3) Invalidera planner + relaterade query-nycklar
      qc.invalidateQueries({ queryKey: ['large-project-planner'] });
      qc.invalidateQueries({ queryKey: ['large-project-detail'] });
      qc.invalidateQueries({ queryKey: ['large-projects'] });
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      setOpen(false);
    } catch (err: any) {
      toast.error('Kunde inte uppdatera datum', { description: err?.message ?? String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSelected(initial);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={
            className ??
            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium hover:bg-black/5'
          }
          title="Klicka för att ändra datum"
        >
          <CalendarIcon className="h-3 w-3 opacity-70" />
          <span>{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 space-y-2">
          <div className="text-[11px] text-muted-foreground font-medium">
            Välj datum för {phase === 'rig' ? 'uppmontering' : phase === 'rigDown' ? 'nedmontering' : 'event'}
          </div>
          <Calendar
            mode="multiple"
            selected={selected}
            onSelect={(d) => setSelected(d ?? [])}
            locale={sv}
            weekStartsOn={1}
            className="rounded-md border-0"
          />
          <div className="flex items-center justify-between gap-2 pt-1 border-t">
            <span className="text-[10.5px] text-muted-foreground tabular-nums">
              {selected.length} dag{selected.length === 1 ? '' : 'ar'} valda
            </span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Avbryt
              </Button>
              <Button size="sm" onClick={handleSave} disabled={busy}>
                {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Spara
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
