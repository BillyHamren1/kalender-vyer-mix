import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/calendarService';
import { moveLargeProjectDay } from '@/services/largeProjectPlannerService';
import { parse, isAfter } from 'date-fns';
import { Clock, AlertTriangle } from 'lucide-react';
import { extractUTCTime, extractUTCDate, buildUTCDateTime, normalizePlannerEventType } from '@/utils/dateUtils';

interface EditEventTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: {
    id: string;
    title: string;
    start: string | Date;
    end: string | Date;
    eventType?: string;
    extendedProps?: {
      largeProjectId?: string;
      phase?: string;
      eventType?: string;
      sourceDate?: string;
    };
  };
  onUpdate?: () => void;
  exactTimeNeeded?: boolean;
}

const EditEventTimeDialog: React.FC<EditEventTimeDialogProps> = ({
  open,
  onOpenChange,
  event,
  onUpdate,
  exactTimeNeeded = false
}) => {
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize times when dialog opens
  useEffect(() => {
    if (open && event) {
      setStartTime(extractUTCTime(event.start));
      setEndTime(extractUTCTime(event.end));
    }
  }, [open, event]);

  const handleSave = async () => {
    const eventStart = typeof event.start === 'string' ? new Date(event.start) : event.start;
    
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
      // Use UTC date extraction to stay consistent with QuickTimeEditPopover
      const datePart = extractUTCDate(event.start);
      const newStartISO = buildUTCDateTime(datePart, startTime);
      const newEndISO = buildUTCDateTime(datePart, endTime);

      // Large-project-safe write path: route grouped large-project days through
      // moveLargeProjectDay so all sibling bookings/calendar_events stay in sync.
      const largeProjectId = event.extendedProps?.largeProjectId;
      const phase = normalizePlannerEventType(
        event.extendedProps?.phase ?? event.extendedProps?.eventType ?? event.eventType
      );

      if (largeProjectId && (phase === 'rig' || phase === 'rigDown')) {
        const fromDate = event.extendedProps?.sourceDate || datePart;
        const result = await moveLargeProjectDay({
          largeProjectId,
          phase,
          fromDate,
          toDate: fromDate,
          newStartISO,
          newEndISO,
        });

        if (result.bookingsUpdated === 0 || result.calendarEventsUpdated === 0) {
          console.warn('Large project time update did not touch any rows', result);
          toast.warning(
            `Tid sparades men 0 ${result.bookingsUpdated === 0 ? 'bokningar' : 'kalenderhändelser'} uppdaterades`
          );
        } else {
          toast.success('Event time updated', {
            description: `${event.title} – ${result.bookingsUpdated} bokningar, ${result.calendarEventsUpdated} kalenderhändelser`
          });
        }
      } else {
        await updateCalendarEvent(event.id, {
          start: newStartISO,
          end: newEndISO,
        });

        toast.success('Event time updated', {
          description: `${event.title} has been rescheduled`
        });
      }

      onOpenChange(false);
      
      // Trigger refresh
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error updating event time:', error);
      toast.error('Kunde inte uppdatera händelsen', {
        description: 'Försök igen'
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

        {exactTimeNeeded && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-900">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              Denna bokning har bestämda tider. Är du säker att du vill ändra?
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">{event.title}</div>
            <div className="text-xs text-muted-foreground">
              Current: {extractUTCTime(event.start)} - {extractUTCTime(event.end)}
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
