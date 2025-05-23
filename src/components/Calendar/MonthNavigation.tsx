
import React, { useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, addMonths, startOfMonth } from 'date-fns';

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

  const goToCurrentMonth = useCallback(() => {
    const today = new Date();
    const startOfCurrentMonth = startOfMonth(today);
    setCurrentMonthStart(startOfCurrentMonth);
  }, [setCurrentMonthStart]);

  // Format the month for display
  const monthText = format(currentMonthStart, 'MMMM yyyy');

  return (
    <div className="flex flex-col items-center space-y-6 mb-6 w-full">
      {/* Main navigation with proper centering */}
      <div className="flex items-center justify-between w-full max-w-2xl px-8">
        <Button 
          variant="outline" 
          size="lg"
          onClick={goToPreviousMonth}
          className="flex items-center justify-center w-12 h-12 rounded-full border-2 border-gray-300 hover:border-primary hover:bg-primary/10 transition-all duration-200 shadow-sm hover:shadow-md"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
        
        <div className="text-3xl font-bold text-center text-gray-800 tracking-wide">
          {monthText}
        </div>
        
        <Button 
          variant="outline" 
          size="lg"
          onClick={goToNextMonth}
          className="flex items-center justify-center w-12 h-12 rounded-full border-2 border-gray-300 hover:border-primary hover:bg-primary/10 transition-all duration-200 shadow-sm hover:shadow-md"
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      </div>
      
      {/* Current Month button with enhanced styling */}
      <Button 
        variant="outline" 
        size="sm"
        onClick={goToCurrentMonth}
        className="flex items-center gap-2 px-6 py-2 bg-white border border-gray-300 hover:bg-gray-50 hover:border-primary transition-all duration-200 shadow-sm hover:shadow-md rounded-full"
      >
        <Calendar className="h-4 w-4" />
        <span className="font-medium">Today</span>
      </Button>
    </div>
  );
};

export default MonthNavigation;
