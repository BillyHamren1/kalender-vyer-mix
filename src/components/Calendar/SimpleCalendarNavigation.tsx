
import React from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
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
  const getDisplayText = () => {
    return format(currentDate, 'MMMM yyyy');
  };

  return (
    <div className="flex items-center justify-between bg-white p-4 border-b border-gray-200">
      {/* Left side - Navigation */}
      <div className="flex items-center space-x-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onNavigate('prev')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <h2 className="text-xl font-semibold text-gray-900 min-w-[200px]">
          {getDisplayText()}
        </h2>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onNavigate('next')}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onToday}
          className="flex items-center"
        >
          <Calendar className="h-4 w-4 mr-2" />
          Today
        </Button>
      </div>
      
      {/* Right side - View modes */}
      <div className="flex items-center space-x-1">
        {(['day', 'week', 'month'] as const).map(mode => (
          <Button
            key={mode}
            variant={viewMode === mode ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewModeChange(mode)}
            className="capitalize"
          >
            {mode}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default SimpleCalendarNavigation;
