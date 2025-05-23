
import React, { useEffect, useState } from 'react';
import { Resource } from './ResourceData';
import { StaffMember } from './StaffTypes';
import { UserPlus } from 'lucide-react';
import { fetchStaffAssignments } from '@/services/staffService';
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
  
  // Fetch assigned staff when component mounts or when resource/date changes
  useEffect(() => {
    const loadAssignedStaff = async () => {
      if (!currentDate) return;
      
      try {
        setIsLoading(true);
        
        // Get staff assigned to this specific team on this date
        const staffAssignments = await fetchStaffAssignments(currentDate, resource.id);
        console.log(`Loaded ${staffAssignments.length} staff assignments for resource ${resource.id} on ${currentDate.toISOString().split('T')[0]}`);
        
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

  // Create placeholder staff slots to ensure consistent height
  const emptySlots = 5 - assignedStaff.length;
  const placeholders = Array(emptySlots > 0 ? emptySlots : 0).fill(null);

  // Handle staff item removal
  const handleRemoveStaff = (staffId: string) => {
    if (onStaffDrop) {
      onStaffDrop(staffId, null);
    }
  };

  return (
    <div 
      ref={drop} 
      className={`resource-header-wrapper flex flex-col h-full w-full ${isOver ? 'bg-purple-50' : ''}`}
    >
      {/* Team title with icon button in right corner */}
      <div className="resource-title-area font-medium text-sm mb-1 sticky top-0 z-10 flex justify-between items-center">
        <span>{resource.title}</span>
        <button 
          onClick={handleSelectStaff}
          className="assign-button-icon"
          title="Assign staff"
        >
          <UserPlus className="h-3 w-3" strokeWidth={2.5} />
        </button>
      </div>
      
      {/* Assigned staff area - fixed height to accommodate 5 staff members */}
      <div className="assigned-staff-area flex flex-col gap-1 mb-1 overflow-visible min-h-[130px]">
        {assignedStaff.map((staff) => (
          <DraggableStaffItem
            key={staff.id}
            staff={staff}
            onRemove={() => handleRemoveStaff(staff.id)}
            currentDate={currentDate}
            teamName={resource.title}
          />
        ))}
        
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
