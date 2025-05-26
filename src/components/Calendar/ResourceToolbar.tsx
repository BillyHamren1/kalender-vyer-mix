
import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Plus, Users } from 'lucide-react';
import AddTaskButton from './AddTaskButton';
import ClearCalendarButton from './ClearCalendarButton';
import { Resource } from './ResourceData';

interface ResourceToolbarProps {
  isLoading: boolean;
  currentDate: Date;
  resources: Resource[];
  onRefresh: () => Promise<void>;
  onAddTask: (taskData: any) => void;
  onShowStaffCurtain?: () => void;
}

const ResourceToolbar: React.FC<ResourceToolbarProps> = ({
  isLoading,
  currentDate,
  resources,
  onRefresh,
  onAddTask,
  onShowStaffCurtain
}) => {
  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={onRefresh}
        disabled={isLoading}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        {isLoading ? 'Updating...' : 'Update'}
      </Button>
      
      <ClearCalendarButton onRefresh={onRefresh} />
      
      <AddTaskButton
        currentDate={currentDate}
        resources={resources}
        onAddTask={onAddTask}
      />
      
      {onShowStaffCurtain && (
        <Button
          onClick={onShowStaffCurtain}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Users className="h-4 w-4" />
          Staff
        </Button>
      )}
    </div>
  );
};

export default ResourceToolbar;
