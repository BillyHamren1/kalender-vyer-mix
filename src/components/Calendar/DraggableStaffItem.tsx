
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

interface DraggableStaffItemProps {
  staff: StaffMember;
  onRemove: () => void;
  currentDate: Date;
  teamName?: string;
}

const DraggableStaffItem: React.FC<DraggableStaffItemProps> = ({ 
  staff, 
  onRemove, 
  currentDate,
  teamName = "this team"
}) => {
  // State for confirmation dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Configure drag functionality with proper drag image and cursor
  const [{ isDragging }, drag, dragPreview] = useDrag({
    type: 'STAFF',
    item: () => {
      console.log('Starting drag for staff:', staff);
      return { 
        id: staff.id, 
        name: staff.name,
        ...staff 
      };
    },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
    canDrag: true,
    end: (item, monitor) => {
      const didDrop = monitor.didDrop();
      console.log('Drag ended for staff:', staff.name, 'didDrop:', didDrop);
      if (!didDrop) {
        console.log('Drag cancelled - item was not dropped on a valid target');
      }
    }
  });

  // Handle double click on staff item
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Double click detected for staff:', staff.name);
    setDialogOpen(true);
  };
  
  // Handle confirmation of removal
  const handleConfirmRemove = () => {
    console.log('Confirming removal of staff:', staff.name);
    onRemove();
    setDialogOpen(false);
  };

  return (
    <>
      <div
        ref={(node) => {
          drag(node);
          dragPreview(node);
        }}
        className={`p-1 bg-white border border-gray-200 rounded-md mb-1 cursor-move flex items-center w-full transition-opacity duration-200 hover:shadow-sm active:cursor-grabbing ${
          isDragging ? 'opacity-50 transform rotate-2' : 'opacity-100'
        }`}
        style={{ 
          height: "24px", 
          maxWidth: "100%",
          userSelect: 'none',
          WebkitUserSelect: 'none'
        }}
        onDoubleClick={handleDoubleClick}
        draggable="true" // Set to true to allow native drag behavior
      >
        <div className="flex items-center gap-1 w-full pointer-events-none">
          <Avatar className="h-4 w-4 bg-purple-100 flex-shrink-0">
            <AvatarFallback className="text-[10px] text-purple-700">
              {getInitials(staff.name)}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis">
            {getFirstName(staff.name)}
          </span>
        </div>
      </div>
      
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
    </>
  );
};

export default DraggableStaffItem;
