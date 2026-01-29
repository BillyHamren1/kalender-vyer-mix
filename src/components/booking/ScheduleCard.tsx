
import React from 'react';
import { CalendarIcon } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { DatesSection } from './DatesSection';

interface ScheduleCardProps {
  bookingId: string;
  rigDates: string[];
  eventDates: string[];
  rigDownDates: string[];
  onAddDate: (date: Date, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
  onRemoveDate: (date: string, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
}

export const ScheduleCard = ({
  bookingId,
  rigDates,
  eventDates,
  rigDownDates,
  onAddDate,
  onRemoveDate
}: ScheduleCardProps) => {
  // Always auto-sync - no toggle needed
  const autoSync = true;

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <CalendarIcon className="h-4 w-4" />
          <span>Schedule</span>
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
        />
        
        <DatesSection 
          title="Event Dates" 
          dates={eventDates} 
          eventType="event" 
          autoSync={autoSync}
          onAddDate={onAddDate}
          onRemoveDate={onRemoveDate}
        />
        
        <DatesSection 
          title="Rig Down Dates" 
          dates={rigDownDates} 
          eventType="rigDown" 
          autoSync={autoSync}
          onAddDate={onAddDate}
          onRemoveDate={onRemoveDate}
        />
      </CardContent>
    </Card>
  );
};
