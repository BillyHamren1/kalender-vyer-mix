
import React from 'react';
import { format, addDays, subDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { CalendarContext } from '@/App';
import { useContext } from 'react';

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
  
  return (
    <div className="w-full bg-gray-50 rounded-md mb-3 overflow-hidden">
      <div className="flex justify-between">
        {generateDates().map((date, index) => (
          <div 
            key={index}
            className={`flex-1 text-center py-2 cursor-pointer transition-colors ${
              isCurrentDate(date) ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'
            }`}
            onClick={() => goToDate(date)}
          >
            <div className="text-xs font-medium">{formatDayName(date)}</div>
            <div className="text-xs">{formatDayNumber(date)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DayNavigation;
