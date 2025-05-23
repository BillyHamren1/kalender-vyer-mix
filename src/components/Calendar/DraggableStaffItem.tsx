
import React, { useState } from 'react';
import { useDrag } from 'react-dnd';
import { StaffMember } from './StaffTypes';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import ConfirmationDialog from '@/components/ConfirmationDialog';

// Helper function to format staff name
const formatStaffName = (fullName: string): string => {
  const nameParts = fullName.trim().split(' ');
  if (nameParts.length === 1) return nameParts[0];
  
  const firstName = nameParts[0];
  const lastNameInitial = nameParts[nameParts.length - 1][0];
  
  return `${firstName} ${lastNameInitial}`;
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
  
  // Configure drag functionality with enhanced logging
  const [{ isDragging }, drag] = useDrag({
    type: 'STAFF',
    item: () => {
      console.log('Starting drag for staff:', staff);
      return staff;
    },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
    end: (item, monitor) => {
      const didDrop = monitor.didDrop();
      console.log('Drag ended, was item dropped?', didDrop);
    }
  });

  // Handle double click on staff item
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDialogOpen(true);
  };
  
  // Handle confirmation of removal
  const handleConfirmRemove = () => {
    onRemove();
    setDialogOpen(false);
  };

  // Get the initials for avatar
  const getInitials = (name: string): string => {
    const nameParts = name.trim().split(' ');
    if (nameParts.length === 1) return nameParts[0].substring(0, 2).toUpperCase();
    return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
  };

  // Format the name for display
  const displayName = formatStaffName(staff.name);

  return (
    <>
      <div
        ref={drag}
        className={`p-1 bg-white border border-gray-200 rounded-md mb-1 cursor-move flex items-center w-full ${
          isDragging ? 'opacity-50' : 'opacity-100'
        }`}
        style={{ height: "24px", maxWidth: "100%" }}
        onDoubleClick={handleDoubleClick}
      >
        <div className="flex items-center gap-1 w-full">
          <Avatar className="h-4 w-4 bg-purple-100 flex-shrink-0">
            <AvatarFallback className="text-[10px] text-purple-700">
              {getInitials(staff.name)}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs font-medium truncate">{displayName}</span>
        </div>
      </div>
      
      <ConfirmationDialog
        title="Unassign Staff?"
        description={`Are you sure you want to unassign ${staff.name} from ${teamName}?`}
        confirmLabel="Unassign"
        cancelLabel="Cancel"
        onConfirm={handleConfirmRemove}
      >
        <span style={{ display: 'none' }}></span>
      </ConfirmationDialog>
    </>
  );
};

export default DraggableStaffItem;
