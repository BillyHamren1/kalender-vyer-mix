import React, { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/calendarService';
import { supabase } from '@/integrations/supabase/client';
import { format, parse, isAfter } from 'date-fns';
import { Clock, Calendar as CalendarIcon } from 'lucide-react';

interface QuickTimeEditPopoverProps {
  event: {
    id: string;
    title: string;
    start: string | Date;
    end: string | Date;
    bookingId?: string;
    eventType?: 'rig' | 'event' | 'rigDown';
  };
  children: React.ReactNode;
  onUpdate?: () => void;
  onMoveDate?: () => void;
}

const QuickTimeEditPopover: React.FC<QuickTimeEditPopoverProps> = ({
  event,
  children,
  onUpdate,
  onMoveDate
}) => {
  const [open, setOpen] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize times when popover opens
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
    
    // Validate times
    const startDate = parse(startTime, 'HH:mm', eventStart);
    const endDate = parse(endTime, 'HH:mm', eventStart);

    if (!isAfter(endDate, startDate)) {
      toast.error('End time must be after start time');
      return;
    }

    setIsSubmitting(true);

    try {
      // Extract date part only (YYYY-MM-DD)
      const eventDate = typeof event.start === 'string' 
        ? event.start.split('T')[0] 
        : event.start.toISOString().split('T')[0];

      // Create NEW Date objects directly from local time strings
      const newStart = new Date(`${eventDate}T${startTime}:00`);
      const newEnd = new Date(`${eventDate}T${endTime}:00`);

      // Update calendar event in database
      await updateCalendarEvent(event.id, {
        start: newStart.toISOString(),
        end: newEnd.toISOString()
      });

      // CRITICAL: Also update the booking time fields
      if (event.bookingId && event.eventType) {
        const bookingTimeField = {
          'rig': { start: 'rig_start_time', end: 'rig_end_time' },
          'event': { start: 'event_start_time', end: 'event_end_time' },
          'rigDown': { start: 'rigdown_start_time', end: 'rigdown_end_time' }
        }[event.eventType];

        if (bookingTimeField) {
          await supabase
            .from('bookings')
            .update({
              [bookingTimeField.start]: newStart.toISOString(),
              [bookingTimeField.end]: newEnd.toISOString()
            })
            .eq('id', event.bookingId);
        }
      }

      toast.success('Time updated');
      setOpen(false);
      
      // Trigger refresh
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error updating event time:', error);
      toast.error('Failed to update');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setOpen(true);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div onContextMenu={handleContextMenu}>
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b">
            <Clock className="h-4 w-4" />
            <div className="text-sm font-medium truncate">{event.title}</div>
          </div>

          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="quick-start" className="text-xs">Start</Label>
              <Input
                id="quick-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="quick-end" className="text-xs">End</Label>
              <Input
                id="quick-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button 
              size="sm" 
              className="flex-1 h-8 text-xs"
              onClick={handleSave}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </Button>
            {onMoveDate && (
              <Button 
                size="sm" 
                variant="outline"
                className="h-8 px-2"
                onClick={() => {
                  setOpen(false);
                  onMoveDate();
                }}
              >
                <CalendarIcon className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default QuickTimeEditPopover;