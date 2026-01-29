
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

interface StaffItemProps {
  staff: StaffMember & { assignedTeam?: string | null };
  onRemove?: () => void;
  currentDate: Date;
  teamName?: string;
  variant?: 'assigned' | 'available' | 'compact';
  showRemoveDialog?: boolean;
}

const StaffItem: React.FC<StaffItemProps> = ({ 
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

  // Compact variant - modern minimal pill design
  if (variant === 'compact') {
    return (
      <>
        <div
          className="relative group cursor-pointer"
          style={{ 
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
          onDoubleClick={handleDoubleClick}
          title={staff.name}
        >
          <div 
            className="px-2.5 py-0.5 rounded-full text-[11px] font-medium shadow-sm transition-all duration-200 hover:shadow-md hover:scale-105"
            style={{ 
              backgroundColor: staffColor,
              color: textColor,
            }}
          >
            {getFirstName(staff.name)}
          </div>
          {showRemoveDialog && onRemove && (
            <button 
              className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 hover:bg-red-600 rounded-full text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-sm"
              onClick={(e) => {
                e.stopPropagation();
                handleConfirmRemove();
              }}
            >
              ×
            </button>
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

export default StaffItem;
