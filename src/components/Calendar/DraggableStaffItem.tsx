
import React from 'react';
import { StaffMember } from './StaffTypes';
import UnifiedDraggableStaffItem from './UnifiedDraggableStaffItem';

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
  return (
    <UnifiedDraggableStaffItem
      staff={staff}
      onRemove={onRemove}
      currentDate={currentDate}
      teamName={teamName}
      variant="assigned"
      showRemoveDialog={true}
    />
  );
};

export default DraggableStaffItem;
