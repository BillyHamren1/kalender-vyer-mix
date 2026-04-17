import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
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
    eventType?: string;
  };
  defaultStartTime: string;
  defaultEndTime: string;
  onUpdate?: () => void;
}

const WAREHOUSE_TYPES = ['packing', 'return', 'delivery', 'inventory', 'unpacking'] as const;
type WarehouseType = typeof WAREHOUSE_TYPES[number];

const AddRiggDayDialog: React.FC<AddRiggDayDialogProps> = ({
  open,
  onOpenChange,
  event,
  defaultStartTime,
  defaultEndTime,
  onUpdate
}) => {
  const isWarehouseSource = !!event.eventType && (WAREHOUSE_TYPES as readonly string[]).includes(event.eventType);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [eventType, setEventType] = useState<'rig' | 'event' | 'rigDown' | WarehouseType>(
    isWarehouseSource ? (event.eventType as WarehouseType) : 'rig'
  );
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
      toast.error('Välj ett datum');
      return;
    }

    if (!event.bookingId || !event.resourceId) {
      toast.error('Bokning eller resurs saknas');
      return;
    }

    setIsCreating(true);

    try {
      // Format date as YYYY-MM-DD
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      // Create UTC datetime strings
      const startDateTime = `${dateStr}T${startTime}:00Z`;
      const endDateTime = `${dateStr}T${endTime}:00Z`;

      // Fetch booking to get organization_id and booking_number
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('organization_id, booking_number, deliveryaddress, delivery_city')
        .eq('id', event.bookingId)
        .single();

      if (bookingError || !booking) {
        throw new Error('Kunde inte hämta bokningsdata');
      }

      const sourceDate = startDateTime.split('T')[0];
      
      const { error: insertError } = await supabase
        .from('calendar_events')
        .insert({
          title: event.title,
          start_time: startDateTime,
          end_time: endDateTime,
          resource_id: event.resourceId,
          booking_id: event.bookingId,
          event_type: eventType,
          organization_id: booking.organization_id,
          booking_number: booking.booking_number,
          delivery_address: [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || null,
          source_date: sourceDate
        });

      if (insertError) {
        throw insertError;
      }

      // Also update the booking date fields so sync doesn't delete the event
      const bookingFieldMap = {
        'rig': { date: 'rigdaydate', start: 'rig_start_time', end: 'rig_end_time' },
        'event': { date: 'eventdate', start: 'event_start_time', end: 'event_end_time' },
        'rigDown': { date: 'rigdowndate', start: 'rigdown_start_time', end: 'rigdown_end_time' }
      };

      const fields = bookingFieldMap[eventType];
      if (fields) {
        await supabase
          .from('bookings')
          .update({
            [fields.date]: dateStr,
            [fields.start]: startDateTime,
            [fields.end]: endDateTime
          })
          .eq('id', event.bookingId);
      }

      const typeLabels = { rig: 'Riggdag', event: 'Eventdag', rigDown: 'Rivdag' };
      toast.success(`${typeLabels[eventType]} tillagd`);
      onOpenChange(false);
      
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error creating event day:', error);
      toast.error('Kunde inte lägga till dagen');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Lägg till händelse</DialogTitle>
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
                <SelectItem value="rig">Riggdag</SelectItem>
                <SelectItem value="event">Eventdag</SelectItem>
                <SelectItem value="rigDown">Rivdag</SelectItem>
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
            Avbryt
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !selectedDate}>
            {isCreating ? 'Lägger till...' : 'Lägg till'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddRiggDayDialog;
