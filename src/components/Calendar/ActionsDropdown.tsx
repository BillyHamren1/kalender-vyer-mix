
import React, { useState } from 'react';
import { Menu, Edit, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import TeamEditDialog from './TeamEditDialog';
import AddTaskButton from './AddTaskButton';
import { Resource } from './ResourceData';

interface ActionsDropdownProps {
  // Team management props
  teamResources: Resource[];
  teamCount: number;
  onAddTeam: (teamName: string) => void;
  onRemoveTeam: (teamId: string) => void;
  currentWeekStart: Date;
  onCopyFromPreviousWeek?: () => Promise<void>;
  
  // Add task props
  currentDate: Date;
  resources: Resource[];
  onAddTask: (taskData: any) => void;
  
  // Staff curtain props
  onShowStaffCurtain?: () => void;
  
  // Loading state
  isLoading?: boolean;
}

const ActionsDropdown: React.FC<ActionsDropdownProps> = ({
  teamResources,
  teamCount,
  onAddTeam,
  onRemoveTeam,
  currentWeekStart,
  onCopyFromPreviousWeek,
  currentDate,
  resources,
  onAddTask,
  onShowStaffCurtain,
  isLoading = false
}) => {
  const [teamEditDialogOpen, setTeamEditDialogOpen] = useState(false);
  const [addTaskDialogOpen, setAddTaskDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            size="sm"
            className="bg-white hover:bg-gray-50 border-gray-300"
            disabled={isLoading}
          >
            <Menu className="h-4 w-4" />
            <span className="ml-2">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          align="end" 
          className="w-48 bg-white border border-gray-200 shadow-lg z-50"
        >
          <DropdownMenuItem 
            onClick={() => setTeamEditDialogOpen(true)}
            className="cursor-pointer"
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit Teams
          </DropdownMenuItem>
          
          <DropdownMenuItem 
            onClick={() => setAddTaskDialogOpen(true)}
            className="cursor-pointer"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Task
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          {onShowStaffCurtain && (
            <DropdownMenuItem 
              onClick={onShowStaffCurtain}
              className="cursor-pointer"
            >
              <Users className="mr-2 h-4 w-4" />
              Staff
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Team Edit Dialog */}
      <TeamEditDialog
        teamResources={teamResources}
        teamCount={teamCount}
        onAddTeam={onAddTeam}
        onRemoveTeam={onRemoveTeam}
        currentWeekStart={currentWeekStart}
        onCopyFromPreviousWeek={onCopyFromPreviousWeek}
        dialogOpen={teamEditDialogOpen}
        setDialogOpen={setTeamEditDialogOpen}
      />

      {/* Add Task Dialog */}
      {addTaskDialogOpen && (
        <div className="hidden">
          <AddTaskButton
            currentDate={currentDate}
            resources={resources}
            onAddTask={(taskData) => {
              onAddTask(taskData);
              setAddTaskDialogOpen(false);
            }}
          />
        </div>
      )}
    </>
  );
};

export default ActionsDropdown;
