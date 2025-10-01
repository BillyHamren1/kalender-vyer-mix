
import React, { useState } from 'react';
import { StaffMember } from './StaffTypes';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import { getContrastTextColor, adjustColorOpacity } from '@/utils/staffColors';

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

  // Get staff color with fallback
  const staffColor = staff.color || '#E3F2FD';
  const textColor = getContrastTextColor(staffColor);

  // Compact variant for wrapping layout
  if (variant === 'compact') {
    return (
      <>
        <div
          className="min-w-[45px] max-w-[70px] h-[18px] cursor-pointer transition-all duration-150 flex items-center justify-center relative group border border-gray-200 rounded"
          style={{ 
            backgroundColor: staffColor,
            color: textColor,
            userSelect: 'none',
            WebkitUserSelect: 'none',
            padding: '2px 4px',
            marginBottom: '2px'
          }}
          onDoubleClick={handleDoubleClick}
          title={staff.name}
        >
          <span className="text-sm font-semibold leading-none truncate">
            {getFirstName(staff.name)}
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
  const baseClasses = `p-2 border border-gray-200 rounded-md cursor-pointer flex items-center w-full transition-all duration-150 hover:shadow-sm`;
  const variantClasses = variant === 'available' 
    ? 'shadow-sm mb-1'
    : 'mb-1';

  return (
    <>
      <div
        className={`${baseClasses} ${variantClasses}`}
        style={{ 
          backgroundColor: staffColor,
          color: textColor,
          height: variant === 'available' ? "28px" : "24px", 
          maxWidth: "100%",
          userSelect: 'none',
          WebkitUserSelect: 'none'
        }}
        onDoubleClick={handleDoubleClick}
      >
        <div className="flex items-center w-full pointer-events-none">
          <span className="text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">
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
