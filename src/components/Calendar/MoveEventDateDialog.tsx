import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/calendarService';
import { format, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

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
      const eventStart = typeof event.start === 'string' ? new Date(event.start) : event.start;
      const eventEnd = typeof event.end === 'string' ? new Date(event.end) : event.end;
      
      // Calculate duration
      const duration = eventEnd.getTime() - eventStart.getTime();

      // Create new start date with selected date but keeping original time
      let newStart = new Date(selectedDate);
      newStart = setHours(newStart, eventStart.getHours());
      newStart = setMinutes(newStart, eventStart.getMinutes());
      newStart = setSeconds(newStart, 0);
      newStart = setMilliseconds(newStart, 0);

      // Create new end date by adding duration
      const newEnd = new Date(newStart.getTime() + duration);

      // Update event in database
      await updateCalendarEvent(event.id, {
        start: newStart.toISOString(),
        end: newEnd.toISOString()
      });

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
              Time: {format(typeof event.start === 'string' ? new Date(event.start) : event.start, 'HH:mm')} - {format(typeof event.end === 'string' ? new Date(event.end) : event.end, 'HH:mm')}
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
