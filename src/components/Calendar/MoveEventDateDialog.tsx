import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/calendarService';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { extractUTCTime, extractUTCDate, buildUTCDateTime } from '@/utils/dateUtils';

interface MoveEventDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: {
    id: string;
    title: string;
    start: string | Date;
    end: string | Date;
    bookingId?: string;
    eventType?: string;
  };
  onUpdate?: () => void;
}

const MoveEventDateDialog: React.FC<MoveEventDateDialogProps> = ({
  open,
  onOpenChange,
  event,
  onUpdate
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize date when dialog opens
  useEffect(() => {
    if (open && event) {
      const eventStart = typeof event.start === 'string' ? new Date(event.start) : event.start;
      setSelectedDate(eventStart);
    }
  }, [open, event]);

  const handleMove = async () => {
    if (!selectedDate) {
      toast.error('Please select a date');
      return;
    }

    setIsSubmitting(true);

    try {
      // Extract original times in UTC to preserve them
      const startTimeStr = extractUTCTime(event.start);
      const endTimeStr = extractUTCTime(event.end);

      // Build new date string from selected calendar date (YYYY-MM-DD)
      const newDateStr = format(selectedDate, 'yyyy-MM-dd');

      // Build new UTC ISO strings preserving original times
      const newStartISO = buildUTCDateTime(newDateStr, startTimeStr);
      const newEndISO = buildUTCDateTime(newDateStr, endTimeStr);

      // Update calendar event in database
      await updateCalendarEvent(event.id, {
        start: newStartISO,
        end: newEndISO
      });

      // CRITICAL: Also update the booking date/time fields to keep data in sync
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

      toast.success('Event moved', {
        description: `${event.title} moved to ${format(selectedDate, 'MMM d, yyyy')}`
      });

      onOpenChange(false);
      
      // Trigger refresh
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error moving event:', error);
      toast.error('Failed to move event', {
        description: 'Please try again'
      });
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
            Move Event to Date
          </DialogTitle>
          <DialogDescription>
            Select a new date for this event. The time will remain the same.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">{event.title}</div>
            <div className="text-xs text-muted-foreground">
              Current date: {format(typeof event.start === 'string' ? new Date(event.start) : event.start, 'MMM d, yyyy')}
            </div>
            <div className="text-xs text-muted-foreground">
              Time: {extractUTCTime(event.start)} - {extractUTCTime(event.end)}
            </div>
          </div>

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
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={isSubmitting || !selectedDate}
          >
            {isSubmitting ? 'Moving...' : 'Move Event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MoveEventDateDialog;
