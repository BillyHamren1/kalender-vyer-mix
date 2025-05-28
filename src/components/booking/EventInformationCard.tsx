
import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

interface EventInformationCardProps {
  rigDates: string[];
  eventDates: string[];
  rigDownDates: string[];
  onAddDate: (date: Date, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
  onRemoveDate: (date: string, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
  autoSync?: boolean;
}

export const EventInformationCard = ({ 
  rigDates, 
  eventDates, 
  rigDownDates, 
  onAddDate, 
  onRemoveDate,
  autoSync = true 
}: EventInformationCardProps) => {
  const [openPopover, setOpenPopover] = useState<string | null>(null);

  const handleDateSelect = (date: Date | undefined, eventType: 'rig' | 'event' | 'rigDown') => {
    if (date) {
      onAddDate(date, eventType, autoSync);
      setOpenPopover(null);
    }
  };

  const handleDateRemove = (dateStr: string, eventType: 'rig' | 'event' | 'rigDown') => {
    onRemoveDate(dateStr, eventType, autoSync);
  };

  const DateSection = ({ 
    title, 
    dates, 
    eventType, 
    bgColor 
  }: { 
    title: string; 
    dates: string[]; 
    eventType: 'rig' | 'event' | 'rigDown';
    bgColor: string;
  }) => (
    <div className="w-full">
      <div className="text-sm font-medium text-gray-700 mb-2">{title}</div>
      {dates.length > 0 ? (
        <div className="space-y-2">
          {dates.map((date, index) => (
            <div key={index} className="flex items-center justify-between">
              <Popover open={openPopover === `${eventType}-${index}`} onOpenChange={(open) => setOpenPopover(open ? `${eventType}-${index}` : null)}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className={cn(
                      "text-sm font-medium border px-3 py-2 rounded text-black h-auto flex-1 mr-2",
                      bgColor
                    )}
                  >
                    {new Date(date).toLocaleDateString()}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <CalendarComponent
                    mode="single"
                    selected={new Date(date)}
                    onSelect={(newDate) => {
                      if (newDate) {
                        // Remove old date and add new one
                        handleDateRemove(date, eventType);
                        handleDateSelect(newDate, eventType);
                      }
                    }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {dates.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                  onClick={() => handleDateRemove(date, eventType)}
                >
                  ×
                </Button>
              )}
            </div>
          ))}
          <Popover open={openPopover === `${eventType}-add`} onOpenChange={(open) => setOpenPopover(open ? `${eventType}-add` : null)}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-sm text-gray-500 hover:text-gray-700 h-auto px-2 py-1 w-full"
              >
                + Add {title}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <CalendarComponent
                mode="single"
                onSelect={(date) => handleDateSelect(date, eventType)}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      ) : (
        <Popover open={openPopover === `${eventType}-empty`} onOpenChange={(open) => setOpenPopover(open ? `${eventType}-empty` : null)}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className="text-sm text-gray-400 hover:text-gray-600 h-auto px-2 py-1 w-full"
            >
              + Add {title}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <CalendarComponent
              mode="single"
              onSelect={(date) => handleDateSelect(date, eventType)}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );

  return (
    <Card className="shadow-sm h-full flex flex-col">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Calendar className="h-4 w-4" />
          <span>Event Information</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3 flex-1 flex flex-col">
        <div className="space-y-4 flex-1">
          <div>
            <p className="text-xs font-medium text-gray-500">Event Type</p>
            <p className="text-sm">Corporate Event</p>
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-500 mb-3">Event Dates</p>
            <div className="space-y-4">
              <DateSection 
                title="Rig Up" 
                dates={rigDates} 
                eventType="rig" 
                bgColor="bg-green-100 border-green-200"
              />
              <DateSection 
                title="Event" 
                dates={eventDates} 
                eventType="event" 
                bgColor="bg-yellow-100 border-yellow-200"
              />
              <DateSection 
                title="Rig Down" 
                dates={rigDownDates} 
                eventType="rigDown" 
                bgColor="bg-red-100 border-red-200"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
