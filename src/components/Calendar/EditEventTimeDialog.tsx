import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/calendarService';
import { format, parse, isAfter } from 'date-fns';
import { Clock } from 'lucide-react';

interface EditEventTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: {
    id: string;
    title: string;
    start: string | Date;
    end: string | Date;
  };
  onUpdate?: () => void;
}

const EditEventTimeDialog: React.FC<EditEventTimeDialogProps> = ({
  open,
  onOpenChange,
  event,
  onUpdate
}) => {
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize times when dialog opens
  useEffect(() => {
    if (open && event) {
      const eventStart = typeof event.start === 'string' ? new Date(event.start) : event.start;
      const eventEnd = typeof event.end === 'string' ? new Date(event.end) : event.end;
      setStartTime(format(eventStart, 'HH:mm'));
      setEndTime(format(eventEnd, 'HH:mm'));
    }
  }, [open, event]);

  const handleSave = async () => {
    const eventStart = typeof event.start === 'string' ? new Date(event.start) : event.start;
    const eventEnd = typeof event.end === 'string' ? new Date(event.end) : event.end;
    
    // Validate times
    const startDate = parse(startTime, 'HH:mm', eventStart);
    const endDate = parse(endTime, 'HH:mm', eventStart);

    if (!isAfter(endDate, startDate)) {
      toast.error('Invalid time selection', {
        description: 'End time must be after start time'
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Create new dates with updated times
      const newStart = new Date(typeof event.start === 'string' ? event.start : event.start);
      const [startHours, startMinutes] = startTime.split(':').map(Number);
      newStart.setHours(startHours, startMinutes, 0, 0);

      const newEnd = new Date(typeof event.end === 'string' ? event.end : event.end);
      const [endHours, endMinutes] = endTime.split(':').map(Number);
      newEnd.setHours(endHours, endMinutes, 0, 0);

      // Update event in database
      await updateCalendarEvent(event.id, {
        start: newStart.toISOString(),
        end: newEnd.toISOString()
      });

      toast.success('Event time updated', {
        description: `${event.title} has been rescheduled`
      });

      onOpenChange(false);
      
      // Trigger refresh
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error updating event time:', error);
      toast.error('Failed to update event', {
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
            <Clock className="h-5 w-5" />
            Edit Event Time
          </DialogTitle>
          <DialogDescription>
            Adjust the start and end times for this event
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">{event.title}</div>
            <div className="text-xs text-muted-foreground">
              Current: {format(typeof event.start === 'string' ? new Date(event.start) : event.start, 'HH:mm')} - {format(typeof event.end === 'string' ? new Date(event.end) : event.end, 'HH:mm')}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="start-time">Start Time</Label>
              <input
                id="start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end-time">End Time</Label>
              <input
                id="end-time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
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
            onClick={handleSave}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditEventTimeDialog;
