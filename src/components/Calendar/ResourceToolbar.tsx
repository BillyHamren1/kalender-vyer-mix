
import React from 'react';
import { Resource, CalendarEvent } from './ResourceData';

interface ResourceToolbarProps {
  isLoading: boolean;
  currentDate: Date;
  resources: Resource[];
  onRefresh: () => Promise<void | CalendarEvent[]>;
  onAddTask: (event: Omit<CalendarEvent, 'id'>) => Promise<string>;
  onShowStaffCurtain?: () => void;
}

/**
 * Component for the toolbar with add task controls
 */
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
      {/* Toolbar is now empty - Add Task Button has been removed */}
    </div>
  );
};

export default ResourceToolbar;
