
import React from 'react';
import { Badge } from "@/components/ui/badge";
import { StaffAssignment } from "@/services/monthlyScheduleService";

interface StaffAssignmentDisplayProps {
  staff: StaffAssignment[];
  maxDisplay?: number;
}

const StaffAssignmentDisplay: React.FC<StaffAssignmentDisplayProps> = ({ 
  staff, 
  maxDisplay = 3 
}) => {
  if (!staff || staff.length === 0) {
    return <span className="text-gray-400 text-sm">No staff assigned</span>;
  }

  const displayStaff = staff.slice(0, maxDisplay);
  const remainingCount = staff.length - maxDisplay;

  return (
    <div className="flex flex-wrap gap-1">
      {displayStaff.map((member, index) => (
        <Badge 
          key={`${member.staffId}-${index}`} 
          variant="secondary" 
          className="text-xs"
        >
          {member.staffName}
        </Badge>
      ))}
      {remainingCount > 0 && (
        <Badge variant="outline" className="text-xs">
          +{remainingCount} more
        </Badge>
      )}
    </div>
  );
};

export default StaffAssignmentDisplay;
