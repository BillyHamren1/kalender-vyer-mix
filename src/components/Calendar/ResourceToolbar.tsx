
import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
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
}

/**
 * Component for the toolbar with refresh, add task, and navigation controls
 */
const ResourceToolbar: React.FC<ResourceToolbarProps> = ({
  isLoading,
  currentDate,
  resources,
  onRefresh,
  onAddTask
}) => {
  const isMobile = useIsMobile();

  return (
    <div className="space-y-4 mb-4">
      <div className="flex items-center gap-3">
        <Button 
          onClick={onRefresh} 
          variant="outline" 
          size="sm"
          disabled={isLoading}
          className="flex items-center gap-1"
        >
          <RefreshCcw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          {isMobile ? '' : 'Update'}
        </Button>
        
        {/* Add Task Button */}
        <AddTaskButton 
          resources={resources}
          onTaskAdd={onAddTask}
          currentDate={currentDate}
        />
      </div>
      
      <div className="w-full">
        <DayNavigation currentDate={currentDate} />
      </div>
    </div>
  );
};

export default ResourceToolbar;
