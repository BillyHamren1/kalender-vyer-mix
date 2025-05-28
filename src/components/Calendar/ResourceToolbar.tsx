
import React from 'react';
import { Plus, Users } from 'lucide-react';
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
      <AddTaskButton
        currentDate={currentDate}
        resources={resources}
        onAddTask={onAddTask}
      />
      
      <ClearCalendarButton
        onRefresh={onRefresh}
      />
      
      {onShowStaffCurtain && (
        <button
          onClick={onShowStaffCurtain}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3"
        >
          <Users className="h-4 w-4" />
          Staff
        </button>
      )}
    </div>
  );
};

export default ResourceToolbar;
