
import React from 'react';
import { format, addDays, subDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { CalendarContext } from '@/App';
import { useContext } from 'react';

interface DayNavigationProps {
  currentDate: Date;
}

const DayNavigation: React.FC<DayNavigationProps> = ({
  currentDate
}) => {
  const {
    setLastViewedDate
  } = useContext(CalendarContext);
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
    <div className="w-full mb-6 flex justify-center">
      <div className="bg-gradient-to-r from-white via-slate-50 to-white rounded-full shadow-2xl border-0 px-6 py-4 backdrop-blur-sm relative overflow-hidden">
        {/* Futuristic glow effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-blue-500/5 rounded-full"></div>
        <div className="absolute inset-[1px] bg-white/90 rounded-full backdrop-blur-sm"></div>
        
        {/* Content */}
        <div className="relative flex gap-2">
          {generateDates().map((date, index) => (
            <button
              key={index}
              onClick={() => goToDate(date)}
              className={`flex flex-col items-center justify-center px-4 py-3 rounded-2xl transition-all duration-300 backdrop-blur-sm border border-slate-200/50 ${
                isCurrentDate(date)
                  ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg scale-105 border-blue-400/50'
                  : 'hover:bg-gradient-to-r hover:from-blue-500/10 hover:to-purple-500/10 hover:scale-105 text-slate-600 hover:text-slate-900'
              }`}
            >
              <div className={`text-xs font-semibold uppercase tracking-wider ${
                isCurrentDate(date) ? 'text-white/90' : 'text-slate-500'
              }`}>
                {formatDayName(date)}
              </div>
              <div className={`text-lg font-bold ${
                isCurrentDate(date) ? 'text-white' : 'text-slate-800'
              }`}>
                {formatDayNumber(date)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DayNavigation;
