
import React, { useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, addMonths } from 'date-fns';

interface MonthNavigationProps {
  currentMonthStart: Date;
  setCurrentMonthStart: (date: Date) => void;
}

const MonthNavigation: React.FC<MonthNavigationProps> = ({
  currentMonthStart,
  setCurrentMonthStart
}) => {
  // Navigation functions
  const goToPreviousMonth = useCallback(() => {
    const prevMonth = addMonths(currentMonthStart, -1);
    setCurrentMonthStart(prevMonth);
  }, [currentMonthStart, setCurrentMonthStart]);

  const goToNextMonth = useCallback(() => {
    const nextMonth = addMonths(currentMonthStart, 1);
    setCurrentMonthStart(nextMonth);
  }, [currentMonthStart, setCurrentMonthStart]);

  // Format the month for display
  const monthText = format(currentMonthStart, 'MMMM yyyy');

  return (
    <div className="flex items-center justify-center mb-8 w-full">
      <div className="flex items-center bg-gradient-to-r from-white via-slate-50 to-white rounded-full shadow-2xl border-0 px-8 py-6 backdrop-blur-sm relative overflow-hidden">
        {/* Futuristic glow effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-blue-500/5 rounded-full"></div>
        <div className="absolute inset-[1px] bg-white/90 rounded-full backdrop-blur-sm"></div>
        
        {/* Content */}
        <div className="relative flex items-center">
          <Button 
            variant="ghost"
            size="sm"
            onClick={goToPreviousMonth}
            className="flex items-center justify-center w-16 h-16 rounded-full hover:bg-gradient-to-r hover:from-blue-500/10 hover:to-purple-500/10 hover:scale-110 transition-all duration-300 text-slate-600 hover:text-slate-900 border border-slate-200/50 backdrop-blur-sm"
          >
            <ChevronLeft className="h-10 w-10" strokeWidth={2.5} />
          </Button>
          
          <div className="text-4xl font-bold text-transparent bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 bg-clip-text px-16 py-4 min-w-[360px] text-center tracking-wider">
            {monthText}
          </div>
          
          <Button 
            variant="ghost"
            size="sm"
            onClick={goToNextMonth}
            className="flex items-center justify-center w-16 h-16 rounded-full hover:bg-gradient-to-r hover:from-blue-500/10 hover:to-purple-500/10 hover:scale-110 transition-all duration-300 text-slate-600 hover:text-slate-900 border border-slate-200/50 backdrop-blur-sm"
          >
            <ChevronRight className="h-10 w-10" strokeWidth={2.5} />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MonthNavigation;
