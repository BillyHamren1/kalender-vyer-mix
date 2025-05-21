
import React from 'react';
import { format, addDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { CalendarContext } from '@/App';
import { useContext } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface DayNavigationProps {
  currentDate: Date;
}

const DayNavigation: React.FC<DayNavigationProps> = ({ currentDate }) => {
  const { setLastViewedDate } = useContext(CalendarContext);
  const navigate = useNavigate();
  
  // Generate dates for the week (7 days)
  const generateDates = () => {
    // Start from 3 days before and show 3 days after
    const dates = [];
    for (let i = -3; i <= 3; i++) {
      dates.push(addDays(currentDate, i));
    }
    return dates;
  };
  
  // Navigate to a specific date
  const goToDate = (date: Date) => {
    setLastViewedDate(date);
    sessionStorage.setItem('calendarDate', date.toISOString());
    
    // Refresh the current page
    navigate(0);
  };
  
  // Check if date is the current selected date
  const isCurrentDate = (date: Date) => {
    return format(date, 'yyyy-MM-dd') === format(currentDate, 'yyyy-MM-dd');
  };
  
  // Format the day name in English (Mon, Tue, Wed, etc.)
  const formatDayName = (date: Date) => {
    return format(date, 'EEE').toLowerCase();
  };
  
  // Format the day number (12/5, 13/5, etc.)
  const formatDayNumber = (date: Date) => {
    return format(date, 'd/M');
  };
  
  const dates = generateDates();
  const currentDateStr = format(currentDate, 'yyyy-MM-dd');
  
  return (
    <div className="w-full bg-gray-50 rounded-md mb-3 overflow-hidden">
      <div className="flex justify-between">
        {dates.map((date, index) => {
          const dateStr = format(date, 'yyyy-MM-dd');
          const isActive = isCurrentDate(date);
          
          return (
            <div 
              key={index}
              className={`flex-1 flex flex-col items-center py-2 ${
                isActive ? 'bg-blue-100' : 'hover:bg-gray-100'
              }`}
            >
              <div 
                className="w-full flex flex-col items-center cursor-pointer"
                onClick={() => goToDate(date)}
              >
                <div className={`text-xs font-medium ${isActive ? 'text-blue-600' : ''}`}>
                  {formatDayName(date)}
                </div>
                <div className={`text-xs ${isActive ? 'text-blue-600' : ''}`}>
                  {formatDayNumber(date)}
                </div>
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
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DayNavigation;
