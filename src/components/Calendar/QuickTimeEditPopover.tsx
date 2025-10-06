import React, { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/calendarService';
import { supabase } from '@/integrations/supabase/client';
import { format, parse, isAfter } from 'date-fns';
import { Clock, Calendar as CalendarIcon } from 'lucide-react';

// Generate time options in 30-minute intervals
const generateTimeOptions = (): string[] => {
  const options: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const hourStr = hour.toString().padStart(2, '0');
      const minuteStr = minute.toString().padStart(2, '0');
      options.push(`${hourStr}:${minuteStr}`);
    }
  }
  return options;
};

const timeOptions = generateTimeOptions();

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
      // Extract time directly from ISO string to avoid timezone conversion
      const startStr = typeof event.start === 'string' ? event.start : event.start.toISOString();
      const endStr = typeof event.end === 'string' ? event.end : event.end.toISOString();
      
      // Extract HH:mm from "YYYY-MM-DDTHH:mm:ssZ" format
      const extractTime = (isoString: string) => {
        const timePart = isoString.split('T')[1]; // Get "HH:mm:ssZ"
        return timePart.substring(0, 5); // Get "HH:mm"
      };
      
      setStartTime(extractTime(startStr));
      setEndTime(extractTime(endStr));
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

      // Create UTC Date objects (Z = UTC, no timezone conversion)
      const newStart = new Date(`${eventDate}T${startTime}:00Z`);
      const newEnd = new Date(`${eventDate}T${endTime}:00Z`);

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
        <div onContextMenu={handleContextMenu} style={{ width: '100%', height: '100%' }}>
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
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Välj tid" />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map(time => (
                    <SelectItem key={`start-${time}`} value={time}>{time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="quick-end" className="text-xs">End</Label>
              <Select value={endTime} onValueChange={setEndTime}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Välj tid" />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map(time => (
                    <SelectItem key={`end-${time}`} value={time}>{time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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