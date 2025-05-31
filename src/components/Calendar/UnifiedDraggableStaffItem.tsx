
import React, { useState } from 'react';
import { useDrag } from 'react-dnd';
import { StaffMember } from './StaffTypes';
import ConfirmationDialog from '@/components/ConfirmationDialog';

const getFirstName = (fullName: string): string => {
  return fullName.trim().split(' ')[0];
};

const getInitials = (fullName: string): string => {
  return fullName.trim().split(' ').map(name => name.charAt(0).toUpperCase()).join('').slice(0, 2);
};

interface UnifiedDraggableStaffItemProps {
  staff: StaffMember & { assignedTeam?: string | null };
  onRemove?: () => void;
  currentDate: Date;
  teamName?: string;
  variant?: 'assigned' | 'available' | 'compact';
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
  const [dialogOpen, setDialogOpen] = useState(false);
  
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

  const handleDoubleClick = (e: React.MouseEvent) => {
    if ((variant === 'assigned' || variant === 'compact') && onRemove && showRemoveDialog) {
      e.preventDefault();
      e.stopPropagation();
      console.log('Double click detected for staff:', staff.name);
      setDialogOpen(true);
    }
  };
  
  const handleConfirmRemove = () => {
    console.log('Confirming removal of staff:', staff.name);
    if (onRemove) {
      onRemove();
    }
    setDialogOpen(false);
  };

  const isAssigned = variant === 'available' && !!staff.assignedTeam;
  
  if (variant === 'available' && isAssigned) {
    return null;
  }

  // Compact variant for horizontal stacking
  if (variant === 'compact') {
    const dragClasses = isDragging 
      ? 'opacity-30 transform rotate-1 scale-110 shadow-lg bg-blue-50 border-blue-300' 
      : 'opacity-100';

    return (
      <>
        <div
          ref={(node) => {
            drag(node);
            dragPreview(node);
          }}
          className={`w-[16px] h-[18px] bg-white border border-gray-200 rounded text-[8px] font-medium cursor-move hover:shadow-sm transition-all duration-150 flex items-center justify-center relative group ${dragClasses}`}
          style={{ 
            userSelect: 'none',
            WebkitUserSelect: 'none',
            transition: isDragging ? 'all 0.1s ease-out' : 'all 0.15s ease-in-out'
          }}
          onDoubleClick={handleDoubleClick}
          draggable="true"
          title={staff.name}
        >
          <span className={`text-[8px] font-bold leading-none ${
            isDragging ? 'text-blue-700 font-semibold' : ''
          }`}>
            {getInitials(staff.name)}
          </span>
          {showRemoveDialog && onRemove && (
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full text-white text-[6px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                 onClick={(e) => {
                   e.stopPropagation();
                   handleConfirmRemove();
                 }}>
              ×
            </div>
          )}
        </div>
        
        {showRemoveDialog && onRemove && (
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
  }
  
  // Standard vertical variant
  const baseClasses = `p-1 border border-gray-200 rounded-md mb-1 cursor-move flex items-center w-full transition-all duration-150 hover:shadow-sm active:cursor-grabbing`;
  const variantClasses = variant === 'available' 
    ? 'bg-white shadow-sm'
    : 'bg-white';
  
  const dragClasses = isDragging 
    ? 'opacity-30 transform rotate-1 scale-110 shadow-lg bg-blue-50 border-blue-300' 
    : 'opacity-100';

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
          WebkitUserSelect: 'none',
          transition: isDragging ? 'all 0.1s ease-out' : 'all 0.15s ease-in-out'
        }}
        onDoubleClick={handleDoubleClick}
        draggable="true"
      >
        <div className="flex items-center w-full pointer-events-none">
          <span className={`text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis ${
            isDragging ? 'text-blue-700 font-semibold' : ''
          }`}>
            {getFirstName(staff.name)}
          </span>
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
