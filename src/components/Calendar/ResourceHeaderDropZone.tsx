
import React, { useEffect, useState } from 'react';
import { Resource } from './ResourceData';
import { StaffMember } from './StaffTypes';
import { UserPlus } from 'lucide-react';
import { fetchStaffAssignments } from '@/services/staffService';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface ResourceHeaderDropZoneProps {
  resource: Resource;
  currentDate?: Date;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  onSelectStaff?: (resourceId: string, resourceTitle: string) => void;
  forceRefresh?: boolean;
}

export const ResourceHeaderDropZone: React.FC<ResourceHeaderDropZoneProps> = ({ 
  resource,
  currentDate = new Date(),
  onStaffDrop,
  onSelectStaff,
  forceRefresh
}) => {
  const [assignedStaff, setAssignedStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Helper function to get initials for avatar
  const getInitials = (name: string): string => {
    const nameParts = name.trim().split(' ');
    if (nameParts.length === 1) return nameParts[0].substring(0, 2).toUpperCase();
    return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
  };
  
  // Fetch assigned staff when component mounts or when resource/date changes
  useEffect(() => {
    const loadAssignedStaff = async () => {
      if (!currentDate) return;
      
      try {
        setIsLoading(true);
        
        // Get staff assigned to this specific team on this date
        const staffAssignments = await fetchStaffAssignments(currentDate, resource.id);
        
        // Now staffAssignments only contains assignments for this resource
        setAssignedStaff(staffAssignments.map(assignment => ({
          id: assignment.staff_id,
          name: assignment.staff_members?.name || 'Unknown',
          email: assignment.staff_members?.email,
          phone: assignment.staff_members?.phone,
          assignedTeam: resource.id
        })));
      } catch (error) {
        console.error('Error loading assigned staff:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadAssignedStaff();
  }, [resource.id, currentDate, forceRefresh]);

  // Handle opening the staff selector
  const handleSelectStaff = () => {
    console.log('ResourceHeaderDropZone: handleSelectStaff clicked for', resource.id, resource.title);
    if (onSelectStaff) {
      onSelectStaff(resource.id, resource.title);
    } else {
      console.error('ResourceHeaderDropZone: onSelectStaff prop is not defined');
    }
  };

  return (
    <div className="resource-header-wrapper flex flex-col h-full w-full">
      {/* Team title */}
      <div className="resource-title-area font-medium text-sm mb-1 sticky top-0 z-10">
        {resource.title}
      </div>
      
      {/* Assigned staff area */}
      <div className="assigned-staff-area flex flex-wrap gap-1 mb-1 overflow-visible min-h-[24px]">
        {assignedStaff.map((staff) => (
          <Badge 
            key={staff.id}
            variant="outline"
            className="staff-badge flex items-center bg-purple-100 text-purple-800 text-xs rounded-md px-1.5 py-0.5 z-20 shadow-sm"
          >
            <Avatar className="h-4 w-4 mr-1 bg-purple-200">
              <AvatarFallback className="text-[8px] text-purple-800">
                {getInitials(staff.name)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate max-w-[50px] font-medium">{staff.name.split(' ')[0]}</span>
          </Badge>
        ))}
      </div>
      
      {/* Staff select button */}
      <button 
        onClick={handleSelectStaff}
        className="text-xs flex items-center justify-center border border-dashed p-1 rounded-md mt-auto
                   border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors duration-200 z-10"
        style={{ minHeight: "22px" }}
      >
        <div className="flex items-center gap-1">
          <UserPlus className="h-3 w-3" />
          <span className="text-xs font-medium">Assign</span>
        </div>
      </button>
    </div>
  );
};
