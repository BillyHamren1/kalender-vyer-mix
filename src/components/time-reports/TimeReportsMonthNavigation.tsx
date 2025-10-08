
import React from 'react';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { format, addMonths, subMonths } from 'date-fns';

interface TimeReportsMonthNavigationProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
  lastUpdated?: Date;
}

const TimeReportsMonthNavigation: React.FC<TimeReportsMonthNavigationProps> = ({ 
  currentDate, 
  onDateChange,
  onRefresh,
  isLoading = false,
  lastUpdated
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
    <div className="flex items-center justify-between mb-6 bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center space-x-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePreviousMonth}
          className="flex items-center"
          disabled={isLoading}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        
        <h2 className="text-2xl font-bold text-gray-900">
          {format(currentDate, 'MMMM yyyy')}
        </h2>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleNextMonth}
          className="flex items-center"
          disabled={isLoading}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
      
      <div className="flex items-center space-x-3">
        {lastUpdated && (
          <span className="text-sm text-gray-500">
            Last updated: {format(lastUpdated, 'HH:mm')}
          </span>
        )}
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleToday}
          disabled={isLoading}
        >
          Today
        </Button>

        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        )}
      </div>
    </div>
  );
};

export default TimeReportsMonthNavigation;
