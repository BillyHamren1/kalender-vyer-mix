
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

interface SimpleCalendarNavigationProps {
  currentDate: Date;
  onNavigate: (direction: 'prev' | 'next') => void;
  onToday: () => void;
  viewMode: 'day' | 'week' | 'month';
  onViewModeChange: (mode: 'day' | 'week' | 'month') => void;
}

const SimpleCalendarNavigation: React.FC<SimpleCalendarNavigationProps> = ({
  currentDate,
  onNavigate,
  onToday,
  viewMode,
  onViewModeChange
}) => {
  const formatDateForView = (date: Date, mode: 'day' | 'week' | 'month') => {
    switch (mode) {
      case 'day':
        return format(date, 'EEEE, MMMM d, yyyy');
      case 'week':
        return `Week of ${format(date, 'MMMM d, yyyy')}`;
      case 'month':
        return format(date, 'MMMM yyyy');
      default:
        return format(date, 'MMMM yyyy');
    }
  };

  return (
    <div className="flex items-center justify-between py-4">
      {/* Left side - Date display and navigation */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('prev')}
            className="border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onToday}
            className="border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 font-medium px-4 transition-all duration-200"
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('next')}
            className="border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="text-xl font-semibold text-gray-900">
          {formatDateForView(currentDate, viewMode)}
        </div>
      </div>

      {/* Right side - View mode selector */}
      <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
        {(['day', 'week', 'month'] as const).map((mode) => (
          <Button
            key={mode}
            variant={viewMode === mode ? "default" : "ghost"}
            size="sm"
            onClick={() => onViewModeChange(mode)}
            className={`
              px-3 py-1.5 text-xs font-medium capitalize transition-all duration-200
              ${viewMode === mode 
                ? 'bg-white text-gray-900 shadow-sm border border-gray-200' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }
            `}
          >
            {mode}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default SimpleCalendarNavigation;
