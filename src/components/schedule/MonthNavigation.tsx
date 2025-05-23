
import React from 'react';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addMonths, subMonths } from 'date-fns';

interface MonthNavigationProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

const MonthNavigation: React.FC<MonthNavigationProps> = ({ 
  currentDate, 
  onDateChange 
}) => {
  const handlePreviousMonth = () => {
    onDateChange(subMonths(currentDate, 1));
  };

  const handleNextMonth = () => {
    onDateChange(addMonths(currentDate, 1));
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center space-x-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePreviousMonth}
          className="flex items-center"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        
        <h1 className="text-2xl font-bold">
          {format(currentDate, 'MMMM yyyy')}
        </h1>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleNextMonth}
          className="flex items-center"
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
      
      <Button
        variant="outline"
        size="sm"
        onClick={handleToday}
      >
        Today
      </Button>
    </div>
  );
};

export default MonthNavigation;
