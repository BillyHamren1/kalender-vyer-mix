import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/calendarService';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { CalendarIcon, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { extractUTCTime, buildUTCDateTime } from '@/utils/dateUtils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MoveEventDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: {
    id: string;
    title: string;
    start: string | Date;
    end: string | Date;
    resourceId?: string;
    bookingId?: string;
    eventType?: string;
  };
  resources?: Array<{ id: string; title: string }>;
  onUpdate?: () => void;
}

const MoveEventDateDialog: React.FC<MoveEventDateDialogProps> = ({
  open,
  onOpenChange,
  event,
  resources = [],
  onUpdate
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedResourceId, setSelectedResourceId] = useState<string | undefined>(undefined);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize when dialog opens
  useEffect(() => {
    if (open && event) {
      const eventStart = typeof event.start === 'string' ? new Date(event.start) : event.start;
      setSelectedDate(eventStart);
      setSelectedResourceId(event.resourceId || undefined);
      setStartTime(extractUTCTime(event.start));
      setEndTime(extractUTCTime(event.end));
    }
  }, [open, event]);

  const handleMove = async () => {
    if (!selectedDate) {
      toast.error('Välj ett datum');
      return;
    }

    setIsSubmitting(true);

    try {
      const startTimeStr = extractUTCTime(event.start);
      const endTimeStr = extractUTCTime(event.end);
      const newDateStr = format(selectedDate, 'yyyy-MM-dd');
      const newStartISO = buildUTCDateTime(newDateStr, startTimeStr);
      const newEndISO = buildUTCDateTime(newDateStr, endTimeStr);

      const updatePayload: any = {
        start: newStartISO,
        end: newEndISO
      };

      // Include resourceId change if different
      if (selectedResourceId && selectedResourceId !== event.resourceId) {
        updatePayload.resourceId = selectedResourceId;
      }

      await updateCalendarEvent(event.id, updatePayload);

      // Also update the booking date/time fields to keep data in sync
      if (event.bookingId && event.eventType) {
        const bookingFields = {
          'rig': { date: 'rigdaydate', start: 'rig_start_time', end: 'rig_end_time' },
          'event': { date: 'eventdate', start: 'event_start_time', end: 'event_end_time' },
          'rigDown': { date: 'rigdowndate', start: 'rigdown_start_time', end: 'rigdown_end_time' }
        }[event.eventType];

        if (bookingFields) {
          await supabase
            .from('bookings')
            .update({
              [bookingFields.date]: newDateStr,
              [bookingFields.start]: newStartISO,
              [bookingFields.end]: newEndISO
            })
            .eq('id', event.bookingId);
        }
      }

      const teamName = resources.find(r => r.id === selectedResourceId)?.title;
      const movedToTeam = selectedResourceId !== event.resourceId && teamName
        ? ` → ${teamName}`
        : '';

      toast.success('Händelse flyttad', {
        description: `${event.title} → ${format(selectedDate, 'd MMM yyyy')}${movedToTeam}`
      });

      onOpenChange(false);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error moving event:', error);
      toast.error('Kunde inte flytta händelsen');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Flytta händelse
          </DialogTitle>
          <DialogDescription>
            Välj ny dag och/eller team. Tiden behålls.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">{event.title}</div>
            <div className="text-xs text-muted-foreground">
              Nuvarande: {format(typeof event.start === 'string' ? new Date(event.start) : event.start, 'd MMM yyyy')} · {extractUTCTime(event.start)}–{extractUTCTime(event.end)}
            </div>
          </div>

          {/* Team selector */}
          {resources.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                Team
              </label>
              <Select value={selectedResourceId} onValueChange={setSelectedResourceId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Välj team" />
                </SelectTrigger>
                <SelectContent>
                  {resources.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              initialFocus
              className={cn("p-3 pointer-events-auto rounded-md border")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Avbryt
          </Button>
          <Button
            onClick={handleMove}
            disabled={isSubmitting || !selectedDate}
          >
            {isSubmitting ? 'Flyttar...' : 'Flytta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MoveEventDateDialog;
