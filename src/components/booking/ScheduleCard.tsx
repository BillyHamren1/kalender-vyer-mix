
import React from 'react';
import { CalendarIcon } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { DatesSection } from './DatesSection';
import { Booking } from '@/types/booking';

interface ScheduleCardProps {
  bookingId: string;
  rigDates: string[];
  eventDates: string[];
  rigDownDates: string[];
  onAddDate: (date: Date, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
  onRemoveDate: (date: string, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
  onEditDate: (oldDate: string, newDate: string, startTime: string, endTime: string, eventType: 'rig' | 'event' | 'rigDown') => void;
  booking: Booking;
}

export const ScheduleCard = ({
  bookingId,
  rigDates,
  eventDates,
  rigDownDates,
  onAddDate,
  onRemoveDate,
  onEditDate,
  booking
}: ScheduleCardProps) => {
  const autoSync = true;

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <CalendarIcon className="h-4 w-4" />
          <span>Schema</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 pt-1 px-4 pb-3">
        <DatesSection 
          title="Rig Days" 
          dates={rigDates} 
          eventType="rig" 
          autoSync={autoSync}
          onAddDate={onAddDate}
          onRemoveDate={onRemoveDate}
          onEditDate={onEditDate}
          startTime={booking.rigStartTime || ''}
          endTime={booking.rigEndTime || ''}
        />
        
        <DatesSection 
          title="Event Dates" 
          dates={eventDates} 
          eventType="event" 
          autoSync={autoSync}
          onAddDate={onAddDate}
          onRemoveDate={onRemoveDate}
          onEditDate={onEditDate}
          startTime={booking.eventStartTime || ''}
          endTime={booking.eventEndTime || ''}
        />
        
        <DatesSection 
          title="Rig Down Dates" 
          dates={rigDownDates} 
          eventType="rigDown" 
          autoSync={autoSync}
          onAddDate={onAddDate}
          onRemoveDate={onRemoveDate}
          onEditDate={onEditDate}
          startTime={booking.rigDownStartTime || ''}
          endTime={booking.rigDownEndTime || ''}
        />
      </CardContent>
    </Card>
  );
};
