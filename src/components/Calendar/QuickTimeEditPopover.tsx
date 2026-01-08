import React, { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/calendarService';
import { supabase } from '@/integrations/supabase/client';
import { parse, isAfter } from 'date-fns';
import { Clock, Calendar as CalendarIcon } from 'lucide-react';
import AddRiggDayDialog from './AddRiggDayDialog';


// Hours 06-22 for quick selection
const hourOptions = Array.from({ length: 17 }, (_, i) => (i + 6).toString().padStart(2, '0'));

// Minutes: 00, 30
const minuteOptions = ['00', '30'];

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
  onOpenChange?: (open: boolean) => void;
}

const QuickTimeEditPopover: React.FC<QuickTimeEditPopoverProps> = ({
  event,
  children,
  onUpdate,
  onMoveDate,
  onOpenChange
}) => {
  const [open, setOpen] = useState(false);
  const [startHour, setStartHour] = useState('08');
  const [startMinute, setStartMinute] = useState('00');
  const [endHour, setEndHour] = useState('16');
  const [endMinute, setEndMinute] = useState('00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddRiggDay, setShowAddRiggDay] = useState(false);

  // Notify parent about open state changes
  useEffect(() => {
    if (onOpenChange) {
      onOpenChange(open);
    }
  }, [open, onOpenChange]);

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
      
      const startTimeParts = extractTime(startStr).split(':');
      const endTimeParts = extractTime(endStr).split(':');
      
      setStartHour(startTimeParts[0]);
      setStartMinute(startTimeParts[1]);
      setEndHour(endTimeParts[0]);
      setEndMinute(endTimeParts[1]);
    }
  }, [open, event]);

  const startTime = `${startHour}:${startMinute}`;
  const endTime = `${endHour}:${endMinute}`;

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
      <PopoverContent className="w-auto p-2" align="start" side="bottom" sideOffset={4}>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 pb-1.5 border-b">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <div className="text-xs font-medium truncate max-w-[180px]">{event.title}</div>
          </div>

          <div className="flex gap-4">
            {/* START TIME */}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Start: {startHour}:{startMinute}</Label>
              <div className="flex gap-1">
                <div className="grid grid-cols-4 gap-0.5">
                  {hourOptions.map(hour => (
                    <button
                      key={`sh-${hour}`}
                      onClick={() => setStartHour(hour)}
                      className={`h-6 w-6 text-[10px] rounded transition-colors ${
                        startHour === hour 
                          ? 'bg-primary text-primary-foreground' 
                          : 'hover:bg-muted'
                      }`}
                    >
                      {hour}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-0.5">
                  {minuteOptions.map(min => (
                    <button
                      key={`sm-${min}`}
                      onClick={() => setStartMinute(min)}
                      className={`h-6 w-8 text-[10px] rounded border transition-colors ${
                        startMinute === min 
                          ? 'bg-primary text-primary-foreground border-primary' 
                          : 'hover:bg-muted border-border'
                      }`}
                    >
                      :{min}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* END TIME */}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">End: {endHour}:{endMinute}</Label>
              <div className="flex gap-1">
                <div className="grid grid-cols-4 gap-0.5">
                  {hourOptions.map(hour => (
                    <button
                      key={`eh-${hour}`}
                      onClick={() => setEndHour(hour)}
                      className={`h-6 w-6 text-[10px] rounded transition-colors ${
                        endHour === hour 
                          ? 'bg-primary text-primary-foreground' 
                          : 'hover:bg-muted'
                      }`}
                    >
                      {hour}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-0.5">
                  {minuteOptions.map(min => (
                    <button
                      key={`em-${min}`}
                      onClick={() => setEndMinute(min)}
                      className={`h-6 w-8 text-[10px] rounded border transition-colors ${
                        endMinute === min 
                          ? 'bg-primary text-primary-foreground border-primary' 
                          : 'hover:bg-muted border-border'
                      }`}
                    >
                      :{min}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button 
              size="sm" 
              className="h-8 px-3 text-xs"
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
            {event.bookingId && (
              <Button 
                size="sm" 
                variant="outline"
                className="h-8 px-3 text-xs ml-auto"
                onClick={() => {
                  setOpen(false);
                  setShowAddRiggDay(true);
                }}
              >
                Add rig day
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
      
      <AddRiggDayDialog
        open={showAddRiggDay}
        onOpenChange={setShowAddRiggDay}
        event={event}
        defaultStartTime={startTime}
        defaultEndTime={endTime}
        onUpdate={onUpdate}
      />
    </Popover>
  );
};

export default QuickTimeEditPopover;
