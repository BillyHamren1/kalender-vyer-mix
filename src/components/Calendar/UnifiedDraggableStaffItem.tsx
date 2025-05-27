
import React, { useState } from 'react';
import { useDrag } from 'react-dnd';
import { StaffMember } from './StaffTypes';
import ConfirmationDialog from '@/components/ConfirmationDialog';

// Helper function to get display name - first name only
const getDisplayName = (fullName: string, variant: 'assigned' | 'available'): string => {
  return fullName.trim().split(' ')[0]; // First name only
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
  
  // Configure drag functionality with immediate feedback
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
  
  // Ultra-compact, zoom-responsive styling
  const baseClasses = `
    cursor-move inline-flex items-center justify-center
    transition-all duration-150 active:cursor-grabbing
    px-1.5 py-0.5 text-xs font-medium rounded
    border border-gray-300 bg-white
    hover:shadow-sm hover:border-gray-400
    zoom-responsive-badge
  `.trim().replace(/\s+/g, ' ');
  
  // Assignment-based styling
  const variantClasses = isAssigned 
    ? 'opacity-60 bg-gray-50 text-gray-500' 
    : 'text-gray-700 hover:bg-gray-50';
  
  // Enhanced drag feedback
  const dragClasses = isDragging 
    ? 'opacity-30 transform scale-105 shadow-lg bg-blue-50 border-blue-300 text-blue-700' 
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
          userSelect: 'none',
          WebkitUserSelect: 'none',
          transition: isDragging ? 'all 0.1s ease-out' : 'all 0.15s ease-in-out',
          fontSize: 'calc(10px * var(--zoom-level, 1))',
          minHeight: 'calc(18px * var(--zoom-level, 1))',
          lineHeight: 1
        }}
        onDoubleClick={handleDoubleClick}
        draggable="true"
        title={variant === 'available' && isAssigned ? `Assigned to team` : undefined}
      >
        <span className={`leading-none ${isDragging ? 'font-semibold' : ''}`}>
          {getDisplayName(staff.name, variant)}
        </span>
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
