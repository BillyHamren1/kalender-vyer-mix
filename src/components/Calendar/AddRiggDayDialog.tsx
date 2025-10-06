import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { createCalendarEvent } from '@/services/eventService';
import { format, parse } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

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

interface AddRiggDayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: {
    id: string;
    title: string;
    start: string | Date;
    end: string | Date;
    bookingId?: string;
    resourceId?: string;
  };
  defaultStartTime: string;
  defaultEndTime: string;
  onUpdate?: () => void;
}

const AddRiggDayDialog: React.FC<AddRiggDayDialogProps> = ({
  open,
  onOpenChange,
  event,
  defaultStartTime,
  defaultEndTime,
  onUpdate
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [eventType, setEventType] = useState<'rig' | 'event' | 'rigDown'>('rig');
  const [isCreating, setIsCreating] = useState(false);
  const [rigDates, setRigDates] = useState<Date[]>([]);
  const [eventDates, setEventDates] = useState<Date[]>([]);
  const [rigDownDates, setRigDownDates] = useState<Date[]>([]);
  const [defaultMonth, setDefaultMonth] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);

  // Update times when props change
  useEffect(() => {
    setStartTime(defaultStartTime);
    setEndTime(defaultEndTime);
  }, [defaultStartTime, defaultEndTime]);

  // Fetch all dates for this booking when dialog opens
  useEffect(() => {
    if (open && event.bookingId) {
      const fetchBookingDates = async () => {
        const { data, error } = await supabase
          .from('calendar_events')
          .select('start_time, event_type')
          .eq('booking_id', event.bookingId);

        if (!error && data) {
          const rigs: Date[] = [];
          const events: Date[] = [];
          const rigDowns: Date[] = [];

          data.forEach(e => {
            const date = new Date(e.start_time);
            if (e.event_type === 'rig') {
              rigs.push(date);
            } else if (e.event_type === 'event') {
              events.push(date);
            } else if (e.event_type === 'rigDown') {
              rigDowns.push(date);
            }
          });

          setRigDates(rigs);
          setEventDates(events);
          setRigDownDates(rigDowns);
        }
      };

      fetchBookingDates();

      // Set default month to the clicked event's date
      const eventDate = typeof event.start === 'string' ? new Date(event.start) : event.start;
      setDefaultMonth(eventDate);
    }
  }, [open, event.bookingId, event.start]);

  const handleCreate = async () => {
    if (!selectedDate) {
      toast.error('Please select a date');
      return;
    }

    if (!event.bookingId || !event.resourceId) {
      toast.error('Missing booking or resource information');
      return;
    }

    setIsCreating(true);

    try {
      // Format date as YYYY-MM-DD
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      // Create UTC datetime strings
      const startDateTime = `${dateStr}T${startTime}:00Z`;
      const endDateTime = `${dateStr}T${endTime}:00Z`;

      await createCalendarEvent({
        title: event.title,
        start: startDateTime,
        end: endDateTime,
        resourceId: event.resourceId,
        bookingId: event.bookingId,
        eventType: eventType
      });

      toast.success('Rigg day added');
      onOpenChange(false);
      
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error creating rigg day:', error);
      toast.error('Failed to add rigg day');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Rigg Day</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Booking</Label>
            <div className="text-sm text-muted-foreground">{event.title}</div>
          </div>

          <div className="space-y-2">
            <Label>Event Type</Label>
            <Select value={eventType} onValueChange={(value: any) => setEventType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rig">Rig Day</SelectItem>
                <SelectItem value="event">Event Day</SelectItem>
                <SelectItem value="rigDown">Rig Down</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Date</Label>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              month={defaultMonth}
              onMonthChange={setDefaultMonth}
              className={cn("rounded-md border pointer-events-auto")}
              modifiers={{
                rigDay: rigDates,
                eventDay: eventDates,
                rigDownDay: rigDownDates,
              }}
              modifiersStyles={{
                rigDay: {
                  backgroundColor: '#F2FCE2',
                  fontWeight: 'bold',
                  border: '2px solid #86C232',
                },
                eventDay: {
                  backgroundColor: '#FEF7CD',
                  fontWeight: 'bold',
                  border: '2px solid #F4C430',
                },
                rigDownDay: {
                  backgroundColor: '#FEE2E2',
                  fontWeight: 'bold',
                  border: '2px solid #F87171',
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Time</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="start-time" className="text-xs text-muted-foreground">Start</Label>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger id="start-time">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.map(time => (
                      <SelectItem key={`start-${time}`} value={time}>{time}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="end-time" className="text-xs text-muted-foreground">End</Label>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger id="end-time">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.map(time => (
                      <SelectItem key={`end-${time}`} value={time}>{time}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !selectedDate}>
            {isCreating ? 'Adding...' : 'Add'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddRiggDayDialog;
