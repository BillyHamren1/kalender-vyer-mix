/**
 * InlineTodoDateEditor
 * --------------------------------------------------------------------------
 * Klickbar datum-chip på en todo-rad i Gantt-vyn. Öppnar en popover med
 * single-day-kalender. Uppdaterar plan_date via updateLargeProjectPlannerItem.
 */
import { useState } from 'react';
import { parseISO, format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { updateLargeProjectPlannerItem } from './largeProjectPlannerService';

interface Props {
  itemId: string;
  currentDate: string; // yyyy-MM-dd, kan vara utanför projektets datum
  label: string;
  inherited?: boolean; // true om ärvd (ingen egen plan_date i vyn)
  className?: string;
  title?: string;
}

export default function InlineTodoDateEditor({
  itemId,
  currentDate,
  label,
  inherited,
  className,
  title,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (d: Date | undefined) => {
    if (!d) return;
    const iso = format(d, 'yyyy-MM-dd');
    if (iso === currentDate) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await updateLargeProjectPlannerItem(itemId, { plan_date: iso });
      toast.success(`Flyttad till ${format(d, 'EEE d MMM', { locale: sv })}`);
      await qc.invalidateQueries({ queryKey: ['large-project-planner'] });
      setOpen(false);
    } catch (e: any) {
      toast.error(`Kunde inte flytta: ${e?.message ?? 'okänt fel'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={
            className ??
            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium hover:bg-white/70 transition-colors'
          }
          title={title ? `${title} · ${label}${inherited ? ' (ärvd – klicka för att sätta eget datum)' : ''}` : label}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarIcon className="h-3 w-3 opacity-70" />}
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Calendar
          mode="single"
          selected={parseISO(currentDate)}
          onSelect={handleSelect}
          initialFocus
          weekStartsOn={1}
        />
      </PopoverContent>
    </Popover>
  );
}
