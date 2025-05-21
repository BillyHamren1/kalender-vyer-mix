
import React from 'react';
import { format, addDays } from 'date-fns';
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
  
  const dates = generateDates();
  
  return (
    <div className="w-full bg-gray-50 rounded-md mb-3">
      <div className="grid grid-cols-7 w-full">
        {dates.map((date, index) => {
          const isActive = isCurrentDate(date);
          
          return (
            <div 
              key={index}
              onClick={() => goToDate(date)}
              className={`text-center py-2 cursor-pointer ${
                isActive ? 'bg-blue-100' : 'hover:bg-gray-100'
              }`}
            >
              <div className={`text-xs font-medium ${isActive ? 'text-blue-600' : ''}`}>
                {formatDayName(date)}
              </div>
              <div className={`text-xs ${isActive ? 'text-blue-600' : ''}`}>
                {formatDayNumber(date)}
              </div>
              
              {isActive && (
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-1 mx-auto" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DayNavigation;
