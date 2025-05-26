
import React, { useState } from 'react';
import { useDrag } from 'react-dnd';
import { StaffMember } from './StaffTypes';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import ConfirmationDialog from '@/components/ConfirmationDialog';

// Helper function to get initials for avatar
const getInitials = (name: string): string => {
  const nameParts = name.trim().split(' ');
  if (nameParts.length === 1) return nameParts[0].substring(0, 2).toUpperCase();
  return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
};

// Helper function to get first name only
const getFirstName = (fullName: string): string => {
  return fullName.trim().split(' ')[0];
};

interface UnifiedDraggableStaffItemProps {
  staff: StaffMember & { assignedTeam?: string | null };
  onRemove?: () => void;
  currentDate: Date;
  teamName?: string;
  variant?: 'assigned' | 'available';
  showRemoveDialog?: boolean;
}

const UnifiedDraggableStaffItem: React.FC<UnifiedDraggableStaffItemProps> = ({ 
  staff, 
  onRemove, 
  currentDate,
  teamName = "this team",
  variant = 'assigned',
  showRemoveDialog = true
}) => {
  // State for confirmation dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Configure drag functionality with enhanced logging
  const [{ isDragging }, drag, dragPreview] = useDrag({
    type: 'STAFF',
    item: () => {
      console.log('UnifiedDraggableStaffItem: Starting drag for staff:', {
        id: staff.id,
        name: staff.name,
        assignedTeam: staff.assignedTeam,
        variant
      });
      return { 
        id: staff.id, 
        name: staff.name,
        assignedTeam: staff.assignedTeam,
        ...staff 
      };
    },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
    canDrag: true,
    end: (item, monitor) => {
      const didDrop = monitor.didDrop();
      const dropResult = monitor.getDropResult();
      console.log('UnifiedDraggableStaffItem: Drag ended for staff:', staff.name, {
        didDrop,
        dropResult,
        variant
      });
      if (!didDrop) {
        console.log('Drag cancelled - item was not dropped on a valid target');
      }
    }
  });

  // Handle double click on staff item (only for assigned staff)
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (variant === 'assigned' && onRemove && showRemoveDialog) {
      e.preventDefault();
      e.stopPropagation();
      console.log('Double click detected for staff:', staff.name);
      setDialogOpen(true);
    }
  };
  
  // Handle confirmation of removal
  const handleConfirmRemove = () => {
    console.log('Confirming removal of staff:', staff.name);
    if (onRemove) {
      onRemove();
    }
    setDialogOpen(false);
  };

  // Determine styling based on variant and assignment status
  const isAssigned = variant === 'available' && !!staff.assignedTeam;
  const baseClasses = `p-1 border border-gray-200 rounded-md mb-1 cursor-move flex items-center w-full transition-all duration-200 hover:shadow-sm active:cursor-grabbing`;
  const variantClasses = variant === 'available' 
    ? `${isAssigned ? 'bg-gray-100 opacity-60' : 'bg-white shadow-sm'}`
    : 'bg-white';
  const dragClasses = isDragging ? 'opacity-50 transform rotate-2 scale-105' : 'opacity-100';

  return (
    <>
      <div
        ref={(node) => {
          drag(node);
          dragPreview(node);
        }}
        className={`${baseClasses} ${variantClasses} ${dragClasses}`}
        style={{ 
          height: variant === 'available' ? "28px" : "24px", 
          maxWidth: "100%",
          userSelect: 'none',
          WebkitUserSelect: 'none'
        }}
        onDoubleClick={handleDoubleClick}
        draggable="true"
        title={variant === 'available' && isAssigned ? `Assigned to team` : undefined}
      >
        <div className="flex items-center gap-1 w-full pointer-events-none">
          <Avatar className={`h-4 w-4 flex-shrink-0 ${
            variant === 'available' && isAssigned ? 'bg-gray-200' : 'bg-purple-100'
          }`}>
            <AvatarFallback className={`text-[10px] ${
              variant === 'available' && isAssigned ? 'text-gray-500' : 'text-purple-700'
            }`}>
              {getInitials(staff.name)}
            </AvatarFallback>
          </Avatar>
          <span className={`text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis ${
            variant === 'available' && isAssigned ? 'text-gray-500' : ''
          }`}>
            {getFirstName(staff.name)}
          </span>
          {variant === 'available' && isAssigned && (
            <span className="text-xs text-gray-400 ml-auto mr-1">
              &#10003;
            </span>
          )}
        </div>
      </div>
      
      {showRemoveDialog && variant === 'assigned' && (
        <ConfirmationDialog
          title="Unassign Staff?"
          description={`Are you sure you want to unassign ${staff.name} from ${teamName}?`}
          confirmLabel="Unassign"
          cancelLabel="Cancel"
          onConfirm={handleConfirmRemove}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        >
          <span style={{ display: 'none' }}></span>
        </ConfirmationDialog>
      )}
    </>
  );
};

export default UnifiedDraggableStaffItem;
