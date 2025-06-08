
import React, { useState, useEffect } from 'react';
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
  // Add fallback dates from booking record
  bookingRigDate?: string;
  bookingEventDate?: string;
  bookingRigDownDate?: string;
}

export const EventInformationCard = ({ 
  rigDates, 
  eventDates, 
  rigDownDates, 
  onAddDate, 
  onRemoveDate,
  autoSync = true,
  bookingRigDate,
  bookingEventDate,
  bookingRigDownDate
}: EventInformationCardProps) => {
  const [openPopover, setOpenPopover] = useState<string | null>(null);

  // Debug logging to see what data we receive
  useEffect(() => {
    console.log('EventInformationCard data:', {
      rigDates,
      eventDates,
      rigDownDates,
      bookingRigDate,
      bookingEventDate,
      bookingRigDownDate
    });
  }, [rigDates, eventDates, rigDownDates, bookingRigDate, bookingEventDate, bookingRigDownDate]);

  const handleDateSelect = (date: Date | undefined, eventType: 'rig' | 'event' | 'rigDown') => {
    if (date) {
      onAddDate(date, eventType, autoSync);
      setOpenPopover(null);
    }
  };

  const handleDateRemove = (dateStr: string, eventType: 'rig' | 'event' | 'rigDown') => {
    onRemoveDate(dateStr, eventType, autoSync);
  };

  // Helper function to combine calendar dates with fallback booking dates
  const getCombinedDates = (calendarDates: string[], bookingDate?: string) => {
    const allDates = [...calendarDates];
    
    // Add booking date if it exists and isn't already in calendar dates
    if (bookingDate && !calendarDates.includes(bookingDate)) {
      allDates.push(bookingDate);
    }
    
    return allDates.filter(Boolean).sort();
  };

  const DateSection = ({ 
    title, 
    dates, 
    eventType, 
    bgColor,
    fallbackDate
  }: { 
    title: string; 
    dates: string[]; 
    eventType: 'rig' | 'event' | 'rigDown';
    bgColor: string;
    fallbackDate?: string;
  }) => {
    const combinedDates = getCombinedDates(dates, fallbackDate);
    const hasCalendarDates = dates.length > 0;
    const hasFallbackOnly = combinedDates.length > 0 && !hasCalendarDates;

    return (
      <div className="w-full min-h-[120px] border border-gray-200 rounded-lg p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-gray-700">{title}</div>
          <Popover open={openPopover === `${eventType}-add`} onOpenChange={(open) => setOpenPopover(open ? `${eventType}-add` : null)}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-blue-600 hover:text-blue-800 h-auto px-2 py-1"
              >
                + Add
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
        
        {combinedDates.length > 0 ? (
          <div className="space-y-2">
            {combinedDates.map((date, index) => {
              const isFromCalendar = dates.includes(date);
              return (
                <div key={`${date}-${index}`} className="flex items-center justify-between">
                  <Popover open={openPopover === `${eventType}-${index}`} onOpenChange={(open) => setOpenPopover(open ? `${eventType}-${index}` : null)}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        className={cn(
                          "text-sm font-medium border px-3 py-2 rounded text-black h-auto flex-1 mr-2",
                          bgColor,
                          !isFromCalendar && "opacity-70 border-dashed"
                        )}
                      >
                        <div className="flex flex-col items-start">
                          <span>{new Date(date).toLocaleDateString()}</span>
                          {!isFromCalendar && (
                            <span className="text-xs text-gray-500">from booking</span>
                          )}
                        </div>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="center">
                      <CalendarComponent
                        mode="single"
                        selected={new Date(date)}
                        onSelect={(newDate) => {
                          if (newDate) {
                            // Remove old date and add new one
                            if (isFromCalendar) {
                              handleDateRemove(date, eventType);
                            }
                            handleDateSelect(newDate, eventType);
                          }
                        }}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  {(combinedDates.length > 1 || isFromCalendar) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                      onClick={() => isFromCalendar ? handleDateRemove(date, eventType) : null}
                      disabled={!isFromCalendar}
                    >
                      ×
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-gray-400 text-sm flex items-center justify-center h-16 border-2 border-dashed border-gray-200 rounded">
            No {title.toLowerCase()} scheduled
          </div>
        )}
        
        {hasFallbackOnly && (
          <div className="mt-2 text-xs text-blue-600 bg-blue-50 p-2 rounded">
            ℹ️ Showing date from booking record. Add to calendar to manage events.
          </div>
        )}
      </div>
    );
  };

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
            <p className="text-xs font-medium text-gray-500 mb-3">Event Schedule</p>
            <div className="space-y-3">
              <DateSection 
                title="Rig Up" 
                dates={rigDates} 
                eventType="rig" 
                bgColor="bg-green-100 border-green-200"
                fallbackDate={bookingRigDate}
              />
              <DateSection 
                title="Event" 
                dates={eventDates} 
                eventType="event" 
                bgColor="bg-yellow-100 border-yellow-200"
                fallbackDate={bookingEventDate}
              />
              <DateSection 
                title="Rig Down" 
                dates={rigDownDates} 
                eventType="rigDown" 
                bgColor="bg-red-100 border-red-200"
                fallbackDate={bookingRigDownDate}
              />
            </div>
          </div>
          
          <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
            📅 Calendar events: {rigDates.length + eventDates.length + rigDownDates.length} total
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
