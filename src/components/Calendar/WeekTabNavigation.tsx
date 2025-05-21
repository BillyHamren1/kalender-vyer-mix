
import React, { useState, useEffect } from 'react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface WeekTabNavigationProps {
  currentDate: Date;
  onDayChange: (date: Date) => void;
  events: any[];
}

const WeekTabNavigation: React.FC<WeekTabNavigationProps> = ({
  currentDate,
  onDayChange,
  events
}) => {
  const [weekDays, setWeekDays] = useState<Date[]>([]);
  
  useEffect(() => {
    // Generate array of days for current week
    const startDay = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday as week start
    const days = Array.from({ length: 7 }, (_, i) => addDays(startDay, i));
    setWeekDays(days);
  }, [currentDate]);

  // Check if a day has events
  const hasEvents = (day: Date) => {
    return events.some(event => {
      const eventStart = new Date(event.start);
      return isSameDay(eventStart, day);
    });
  };

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium text-gray-700">Week Navigation</h3>
      </div>
      
      <Tabs defaultValue={format(currentDate, 'EEE-dd-MM', { locale: sv })} className="w-full">
        <TabsList className="w-full">
          {weekDays.map((day) => {
            const dayHasEvents = hasEvents(day);
            const isActive = isSameDay(day, currentDate);
            
            return (
              <TabsTrigger
                key={format(day, 'EEE-dd-MM', { locale: sv })}
                value={format(day, 'EEE-dd-MM', { locale: sv })}
                onClick={() => onDayChange(day)}
                className="flex-1 flex flex-col items-center pb-1"
              >
                <div className="flex flex-col items-center">
                  <span>{format(day, 'EEE', { locale: sv })}</span>
                  <span className={`text-xs ${isActive ? 'text-[#9b87f5]' : ''}`}>
                    {format(day, 'd/M')}
                  </span>
                </div>
                
                <div className="mt-1 w-full">
                  <ToggleGroup type="single" value={isActive ? "morning" : undefined} className="flex justify-center space-x-1">
                    <ToggleGroupItem 
                      value="morning" 
                      size="sm"
                      className="h-5 w-5 rounded-sm text-[9px]"
                    >
                      F
                    </ToggleGroupItem>
                    <ToggleGroupItem 
                      value="afternoon" 
                      size="sm"
                      className="h-5 w-5 rounded-sm text-[9px]"
                    >
                      E
                    </ToggleGroupItem>
                    <ToggleGroupItem 
                      value="evening" 
                      size="sm"
                      className="h-5 w-5 rounded-sm text-[9px]"
                    >
                      M
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
                
                {dayHasEvents && (
                  <span className="w-1.5 h-1.5 bg-[#9b87f5] rounded-full mt-1" />
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </div>
  );
};

export default WeekTabNavigation;
