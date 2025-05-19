
import React, { useEffect, useState } from 'react';
import { useDrop } from 'react-dnd';
import { Resource } from './ResourceData';
import { StaffMember } from './StaffTypes';
import { ArrowDown, User, Users } from 'lucide-react';
import { fetchStaffAssignments } from '@/services/staffService';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface ResourceHeaderDropZoneProps {
  resource: Resource;
  currentDate?: Date;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
}

export const ResourceHeaderDropZone: React.FC<ResourceHeaderDropZoneProps> = ({ 
  resource,
  currentDate = new Date(),
  onStaffDrop
}) => {
  const [assignedStaff, setAssignedStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Create a drop zone specifically for the calendar resource header
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: 'STAFF',
    drop: (item: StaffMember) => {
      if (onStaffDrop) {
        onStaffDrop(item.id, resource.id);
      }
      return { resourceId: resource.id };
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  }), [resource.id, onStaffDrop]);
  
  // Fetch assigned staff when component mounts or when resource/date changes
  useEffect(() => {
    const loadAssignedStaff = async () => {
      if (!currentDate) return;
      
      try {
        setIsLoading(true);
        const formattedDate = currentDate.toISOString().split('T')[0];
        
        // Get staff assigned to this team on this date
        const staffAssignments = await fetchStaffAssignments(resource.id, formattedDate);
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
  }, [resource.id, currentDate]);
  
  // Helper function to get initials for avatar
  const getInitials = (name: string): string => {
    const nameParts = name.trim().split(' ');
    if (nameParts.length === 1) return nameParts[0].substring(0, 2).toUpperCase();
    return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
  };

  return (
    <div className="resource-header-wrapper flex flex-col h-full w-full">
      {/* Team title */}
      <div className="resource-title-area font-medium text-sm mb-1">
        {resource.title}
      </div>
      
      {/* Assigned staff area */}
      {assignedStaff.length > 0 && (
        <div className="assigned-staff-area mb-1 flex flex-wrap gap-1">
          {assignedStaff.map((staff) => (
            <div 
              key={staff.id}
              className="staff-badge flex items-center bg-purple-100 text-purple-800 text-xs rounded px-1 py-0.5"
              title={staff.name}
            >
              <Avatar className="h-3 w-3 mr-1 bg-purple-200">
                <AvatarFallback className="text-[8px] text-purple-800">
                  {getInitials(staff.name)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate max-w-[50px]">{staff.name.split(' ')[0]}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Drop zone area */}
      <div 
        ref={drop}
        className={`
          resource-drop-zone text-xs flex items-center justify-center
          border-y border-dashed p-1 rounded-sm
          ${isOver ? 'bg-blue-100 border-blue-400 text-blue-800' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}
          transition-colors duration-200
        `}
        style={{ minHeight: '24px' }}
      >
        <div className="flex items-center gap-1">
          {assignedStaff.length > 0 ? (
            <>
              <ArrowDown className="h-3 w-3" />
              <span className="text-xs">Add more</span>
            </>
          ) : (
            <>
              <ArrowDown className="h-3 w-3" />
              <span className="text-xs">Drop staff</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
