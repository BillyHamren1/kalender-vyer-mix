
import React, { useEffect, useState } from 'react';
import { Resource } from './ResourceData';
import { StaffMember } from './StaffTypes';
import { UserPlus } from 'lucide-react';
import { fetchStaffAssignments } from '@/services/staffService';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useDrop } from 'react-dnd';

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
      {/* Team title */}
      <div className="resource-title-area font-medium text-sm mb-1 sticky top-0 z-10">
        {resource.title}
      </div>
      
      {/* Assigned staff area - fixed height to accommodate 5 staff members */}
      <div className="assigned-staff-area flex flex-col gap-1 mb-1 overflow-visible min-h-[130px]">
        {assignedStaff.map((staff) => (
          <Badge 
            key={staff.id}
            variant="outline"
            className="staff-badge flex items-center bg-purple-100 text-purple-800 text-xs rounded-md px-1.5 py-0.5 z-20 shadow-sm cursor-move"
            draggable="true"
            onDragStart={(e) => {
              // Set drag data
              e.dataTransfer.setData('application/json', JSON.stringify(staff));
              e.dataTransfer.effectAllowed = 'move';
              // Add the drag source class
              e.currentTarget.classList.add('dragging');
            }}
            onDragEnd={(e) => {
              // Remove the drag source class
              e.currentTarget.classList.remove('dragging');
            }}
          >
            <Avatar className="h-4 w-4 mr-1 bg-purple-200">
              <AvatarFallback className="text-[8px] text-purple-800">
                {getInitials(staff.name)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate max-w-[50px] font-medium">{staff.name.split(' ')[0]}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveStaff(staff.id);
              }}
              className="ml-1 text-purple-400 hover:text-red-500 text-xs"
              aria-label="Remove assignment"
            >
              &times;
            </button>
          </Badge>
        ))}
        
        {/* Empty placeholder slots to maintain consistent height */}
        {placeholders.map((_, index) => (
          <div 
            key={`placeholder-${index}`}
            className="staff-placeholder h-[22px] w-full opacity-0"
          />
        ))}
      </div>
      
      {/* Staff select button - positioned at bottom */}
      <div className="assign-button-container mt-auto">
        <button 
          onClick={handleSelectStaff}
          className="assign-button text-xs flex items-center justify-center border border-dashed p-1 rounded-md
                     border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors duration-200 z-10 w-full"
          style={{ height: "22px" }}
        >
          <div className="flex items-center gap-1">
            <UserPlus className="h-3 w-3" />
            <span className="text-xs font-medium">Assign</span>
          </div>
        </button>
      </div>
    </div>
  );
};
