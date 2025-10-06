import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { createCalendarEvent } from '@/services/eventService';
import { format } from 'date-fns';

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
      const startDateTime = `${dateStr}T${defaultStartTime}:00Z`;
      const endDateTime = `${dateStr}T${defaultEndTime}:00Z`;

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
              className="rounded-md border"
            />
          </div>

          <div className="space-y-2">
            <Label>Time</Label>
            <div className="text-sm text-muted-foreground">
              {defaultStartTime} - {defaultEndTime}
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
