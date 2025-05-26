
import React, { useEffect, useState } from 'react';
import { Resource } from './ResourceData';
import { StaffMember } from './StaffTypes';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useDrop } from 'react-dnd';
import DraggableStaffItem from './DraggableStaffItem';

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
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Set up drop target for staff assignment
  const [{ isOver }, drop] = useDrop({
    accept: 'STAFF',
    drop: (item: StaffMember) => {
      console.log('Dropping staff onto resource header:', item.id, resource.id);
      if (onStaffDrop) {
        onStaffDrop(item.id, resource.id);
      }
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  });
  
  // Update refresh key when forceRefresh changes
  useEffect(() => {
    console.log(`ResourceHeaderDropZone: forceRefresh changed to ${forceRefresh} for resource ${resource.id}`);
    setRefreshKey(prev => prev + 1);
  }, [forceRefresh, resource.id]);
  
  // Fetch assigned staff when component mounts or when refresh key changes
  useEffect(() => {
    console.log(`ResourceHeaderDropZone: useEffect triggered for resource ${resource.id}, refreshKey=${refreshKey}, date=${currentDate.toISOString().split('T')[0]}`);
    
    const loadAssignedStaff = async () => {
      if (!currentDate) return;
      
      try {
        setIsLoading(true);
        console.log(`ResourceHeaderDropZone: Starting to fetch staff assignments for resource ${resource.id}`);
        
        // Get staff assigned to this specific team on this date
        const { fetchStaffAssignments } = await import('@/services/staffService');
        const staffAssignments = await fetchStaffAssignments(currentDate, resource.id);
        console.log(`ResourceHeaderDropZone: Raw staff assignments for resource ${resource.id}:`, staffAssignments);
        
        // Improved mapping with better error handling and data extraction
        const mappedStaff = staffAssignments.map(assignment => {
          console.log(`Processing assignment:`, assignment);
          
          // Handle both direct staff_members object and nested structure
          const staffMemberData = assignment.staff_members || assignment;
          const staffName = staffMemberData?.name || 
                           assignment.staff_name || 
                           assignment.name || 
                           'Unknown Staff';
          const staffEmail = staffMemberData?.email || assignment.email;
          const staffPhone = staffMemberData?.phone || assignment.phone;
          
          console.log(`Extracted staff data: name=${staffName}, email=${staffEmail}, id=${assignment.staff_id}`);
          
          return {
            id: assignment.staff_id,
            name: staffName,
            email: staffEmail,
            phone: staffPhone,
            assignedTeam: resource.id
          };
        });
        
        console.log(`ResourceHeaderDropZone: Final mapped staff for resource ${resource.id}:`, mappedStaff);
        setAssignedStaff(mappedStaff);
      } catch (error) {
        console.error('ResourceHeaderDropZone: Error loading assigned staff:', error);
        setAssignedStaff([]); // Clear staff on error
      } finally {
        setIsLoading(false);
      }
    };
    
    loadAssignedStaff();
  }, [resource.id, currentDate, refreshKey]);

  // Handle clicking on the team title to select staff
  const handleTeamTitleClick = () => {
    console.log('ResourceHeaderDropZone: Team title clicked for', resource.id, resource.title);
    if (onSelectStaff) {
      onSelectStaff(resource.id, resource.title);
    } else {
      console.error('ResourceHeaderDropZone: onSelectStaff prop is not defined');
    }
  };

  // Create placeholder staff slots to ensure consistent height
  const emptySlots = 5 - assignedStaff.length;
  const placeholders = Array(emptySlots > 0 ? emptySlots : 0).fill(null);

  // Handle staff item removal
  const handleRemoveStaff = (staffId: string) => {
    if (onStaffDrop) {
      onStaffDrop(staffId, null);
    }
  };

  console.log(`ResourceHeaderDropZone: Rendering ${assignedStaff.length} staff for resource ${resource.id}`, assignedStaff);

  return (
    <div 
      ref={drop} 
      className={`resource-header-wrapper flex flex-col h-full w-full ${isOver ? 'bg-purple-50' : ''}`}
    >
      {/* Team title - now fully clickable */}
      <button 
        onClick={handleTeamTitleClick}
        className="resource-title-area font-medium text-sm mb-1 sticky top-0 z-10 w-full text-left hover:bg-gray-50 active:bg-gray-100 transition-colors duration-200 cursor-pointer px-1 py-1 rounded"
        title="Click to assign staff"
      >
        {resource.title}
      </button>
      
      {/* Assigned staff area - fixed height to accommodate 5 staff members */}
      <div className="assigned-staff-area flex flex-col gap-1 mb-1 overflow-visible min-h-[130px]">
        {isLoading ? (
          <div className="text-xs text-gray-500">Loading staff...</div>
        ) : assignedStaff.length > 0 ? (
          assignedStaff.map((staff) => (
            <DraggableStaffItem
              key={staff.id}
              staff={staff}
              onRemove={() => handleRemoveStaff(staff.id)}
              currentDate={currentDate}
              teamName={resource.title}
            />
          ))
        ) : (
          <div className="text-xs text-gray-400">No staff assigned</div>
        )}
        
        {/* Empty placeholder slots to maintain consistent height */}
        {placeholders.map((_, index) => (
          <div 
            key={`placeholder-${index}`}
            className="staff-placeholder h-[22px] w-full opacity-0"
          />
        ))}
      </div>
    </div>
  );
};
