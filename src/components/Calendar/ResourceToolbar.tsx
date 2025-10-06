
import React from 'react';
import { Plus, Users } from 'lucide-react';
import AddTaskButton from './AddTaskButton';
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
    <div className="flex items-center gap-1.5">
      <AddTaskButton
        currentDate={currentDate}
        resources={resources}
        onAddTask={onAddTask}
      />
      
      {onShowStaffCurtain && (
        <button
          onClick={onShowStaffCurtain}
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 rounded-md px-2"
        >
          <Users className="h-3.5 w-3.5" />
          Staff
        </button>
      )}
    </div>
  );
};

export default ResourceToolbar;
