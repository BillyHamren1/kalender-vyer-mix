
import React, { useState, useEffect } from 'react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { sv } from 'date-fns/locale';

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
    <div className="mb-4 w-full">
      <div className="grid grid-cols-7 w-full bg-gray-50 rounded-md">
        {weekDays.map((day) => {
          const dayHasEvents = hasEvents(day);
          const isActive = isSameDay(day, currentDate);
          const dayName = format(day, 'EEE', { locale: sv }).toLowerCase();
          const dayDate = format(day, 'd/M');
          
          return (
            <div
              key={format(day, 'EEE-dd-MM', { locale: sv })}
              onClick={() => onDayChange(day)}
              className={`text-center py-2 cursor-pointer ${
                isActive ? 'bg-blue-100' : 'hover:bg-gray-100'
              }`}
            >
              <div className="flex flex-col items-center">
                <span className={`text-xs font-medium ${isActive ? 'text-blue-600' : ''}`}>
                  {dayName}
                </span>
                <span className={`text-xs ${isActive ? 'text-blue-600' : ''}`}>
                  {dayDate}
                </span>
              </div>
              
              {dayHasEvents && (
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-1 mx-auto" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WeekTabNavigation;
