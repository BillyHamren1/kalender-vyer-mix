
import React from 'react';
import { CalendarIcon, RefreshCcw } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DatesSection } from './DatesSection';
import { Button } from '@/components/ui/button';
import { resyncBookingCalendarEvents } from '@/services/importService';

interface ScheduleCardProps {
  bookingId: string;
  rigDates: string[];
  eventDates: string[];
  rigDownDates: string[];
  autoSync: boolean;
  onAutoSyncChange: (value: boolean) => void;
  onAddDate: (date: Date, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
  onRemoveDate: (date: string, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
}

export const ScheduleCard = ({
  bookingId,
  rigDates,
  eventDates,
  rigDownDates,
  autoSync,
  onAutoSyncChange,
  onAddDate,
  onRemoveDate
}: ScheduleCardProps) => {
  // Function to handle manual resync to calendar
  const handleManualResync = async () => {
    await resyncBookingCalendarEvents(bookingId);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          <span>Schedule</span>
        </CardTitle>
        <div className="flex items-center space-x-2">
          <Switch
            id="auto-sync"
            checked={autoSync}
            onCheckedChange={onAutoSyncChange}
          />
          <Label
            htmlFor="auto-sync"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Auto sync to calendar
          </Label>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 pt-4">
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
      {!autoSync && (
        <div className="px-6 pb-4 flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            Changes to dates will not appear in the calendar until you sync
          </span>
          <Button size="sm" variant="outline" onClick={handleManualResync} className="gap-1">
            <RefreshCcw className="h-3.5 w-3.5" />
            Sync to Calendar
          </Button>
        </div>
      )}
    </Card>
  );
};
