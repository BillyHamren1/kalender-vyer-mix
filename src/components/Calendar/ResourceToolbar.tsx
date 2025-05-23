
import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCcw, Users } from 'lucide-react';
import DayNavigation from '@/components/Calendar/DayNavigation';
import AddTaskButton from '@/components/Calendar/AddTaskButton';
import { Resource, CalendarEvent } from './ResourceData';
import { useIsMobile } from '@/hooks/use-mobile';

interface ResourceToolbarProps {
  isLoading: boolean;
  currentDate: Date;
  resources: Resource[];
  onRefresh: () => Promise<void | CalendarEvent[]>;
  onAddTask: (event: Omit<CalendarEvent, 'id'>) => Promise<string>;
  onShowStaffCurtain?: () => void;
}

/**
 * Component for the toolbar with refresh, add task, and navigation controls
 */
const ResourceToolbar: React.FC<ResourceToolbarProps> = ({
  isLoading,
  currentDate,
  resources,
  onRefresh,
  onAddTask,
  onShowStaffCurtain
}) => {
  const isMobile = useIsMobile();

  return (
    <div className="flex items-center mb-4">
      <Button 
        onClick={onRefresh} 
        variant="outline" 
        size="sm"
        disabled={isLoading}
        className="flex items-center gap-1 mr-3"
      >
        <RefreshCcw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
        {isMobile ? '' : 'Update'}
      </Button>
      
      {/* Show Staff Button */}
      {onShowStaffCurtain && (
        <Button
          onClick={onShowStaffCurtain}
          variant="outline"
          size="sm"
          className="flex items-center gap-1 mr-3"
        >
          <Users className="h-4 w-4" />
          {isMobile ? '' : 'Available Staff'}
        </Button>
      )}
      
      {/* Add Task Button */}
      <AddTaskButton 
        resources={resources}
        onTaskAdd={onAddTask}
        currentDate={currentDate}
      />
      
      <div className="flex-grow">
        <DayNavigation currentDate={currentDate} />
      </div>
    </div>
  );
};

export default ResourceToolbar;
