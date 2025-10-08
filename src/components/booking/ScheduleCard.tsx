
import React from 'react';
import { CalendarIcon, RefreshCcw } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DatesSection } from './DatesSection';
import { Button } from '@/components/ui/button';
import { syncSingleBookingToCalendar } from '@/services/bookingCalendarService';

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
    await syncSingleBookingToCalendar(bookingId);
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <CalendarIcon className="h-4 w-4" />
          <span>Schedule</span>
        </CardTitle>
        <div className="flex items-center space-x-2">
          <Switch
            id="auto-sync"
            checked={autoSync}
            onCheckedChange={onAutoSyncChange}
            className="h-4 w-7"
          />
          <Label
            htmlFor="auto-sync"
            className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Auto sync
          </Label>
        </div>
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
      {!autoSync && (
        <div className="px-4 pb-3 flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            Changes won't appear in calendar until synced
          </span>
          <Button size="sm" variant="outline" onClick={handleManualResync} className="gap-1 h-7 text-xs">
            <RefreshCcw className="h-3 w-3" />
            Sync Calendar
          </Button>
        </div>
      )}
    </Card>
  );
};
