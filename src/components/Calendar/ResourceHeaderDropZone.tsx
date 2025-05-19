
import React, { useEffect, useState } from 'react';
import { useDrop, useDrag } from 'react-dnd';
import { Resource } from './ResourceData';
import { StaffMember } from './StaffTypes';
import { ArrowDown, User, Users } from 'lucide-react';
import { fetchStaffAssignments } from '@/services/staffService';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import ConfirmationDialog from '@/components/ConfirmationDialog';

interface ResourceHeaderDropZoneProps {
  resource: Resource;
  currentDate?: Date;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  forceRefresh?: boolean; // Add this prop to force refresh
}

// DraggableStaffBadge component for the resource header
const DraggableStaffBadge: React.FC<{
  staff: StaffMember;
  onRemove: () => Promise<void>;
}> = ({ staff, onRemove }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'STAFF',
    item: staff,
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  // Helper function to get initials for avatar
  const getInitials = (name: string): string => {
    const nameParts = name.trim().split(' ');
    if (nameParts.length === 1) return nameParts[0].substring(0, 2).toUpperCase();
    return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
  };

  return (
    <div 
      ref={drag}
      className={`${isDragging ? 'opacity-50' : 'opacity-100'}`}
    >
      <Badge 
        key={staff.id}
        variant="outline"
        className="staff-badge flex items-center bg-purple-100 text-purple-800 text-xs rounded-md px-1.5 py-0.5 z-20 shadow-sm cursor-move"
        title={staff.name}
        onClick={(e) => {
          e.stopPropagation();
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
            onRemove();
          }}
          className="text-gray-400 hover:text-red-500 text-xs ml-1"
          aria-label="Remove assignment"
        >
          &times;
        </button>
      </Badge>
    </div>
  );
};

export const ResourceHeaderDropZone: React.FC<ResourceHeaderDropZoneProps> = ({ 
  resource,
  currentDate = new Date(),
  onStaffDrop,
  forceRefresh
}) => {
  const [assignedStaff, setAssignedStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [staffToReassign, setStaffToReassign] = useState<StaffMember | null>(null);
  
  // Create a drop zone specifically for the calendar resource header
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: 'STAFF',
    drop: (item: StaffMember & { assignedTeam?: string | null }) => {
      if (onStaffDrop) {
        // Check if staff is already assigned elsewhere
        if (item.assignedTeam && item.assignedTeam !== resource.id) {
          setStaffToReassign(item);
          setShowConfirmation(true);
        } else {
          onStaffDrop(item.id, resource.id);
        }
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
  }, [resource.id, currentDate, forceRefresh]); // Add forceRefresh to the dependency array
  
  // Handle staff removal
  const handleRemoveStaff = async (staffId: string) => {
    if (onStaffDrop) {
      await onStaffDrop(staffId, null);
      
      // Remove from local state immediately for responsive UI
      setAssignedStaff(prev => prev.filter(staff => staff.id !== staffId));
    }
  };

  // Handle confirmation of staff reassignment
  const handleConfirmReassign = async () => {
    if (staffToReassign && onStaffDrop) {
      await onStaffDrop(staffToReassign.id, resource.id);
      setShowConfirmation(false);
      setStaffToReassign(null);
    }
  };

  return (
    <div 
      ref={drop}
      className="resource-header-wrapper flex flex-col h-full w-full"
    >
      {/* Team title */}
      <div className="resource-title-area font-medium text-sm mb-1 sticky top-0 z-10">
        {resource.title}
      </div>
      
      {/* Assigned staff area - styled to match the reference image */}
      <div className="assigned-staff-area flex flex-wrap gap-1 mb-1 overflow-visible min-h-[24px]">
        {assignedStaff.map((staff) => (
          <DraggableStaffBadge 
            key={staff.id} 
            staff={staff} 
            onRemove={() => handleRemoveStaff(staff.id)} 
          />
        ))}
      </div>
      
      {/* Drop zone area - styled to match the reference image */}
      <div 
        className={`
          resource-drop-zone text-xs flex items-center justify-center 
          border border-dashed p-1.5 rounded-md mt-auto
          ${isOver ? 'bg-blue-50 border-blue-400 text-blue-800' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}
          transition-colors duration-200 z-10
        `}
        style={{ minHeight: "24px" }}
      >
        <div className="flex items-center gap-1">
          {assignedStaff.length > 0 ? (
            <>
              <ArrowDown className="h-3 w-3" />
              <span className="text-xs font-medium">Add more</span>
            </>
          ) : (
            <>
              <ArrowDown className="h-3 w-3" />
              <span className="text-xs font-medium">Drop staff</span>
            </>
          )}
        </div>
      </div>

      {/* Confirmation Dialog for reassigning staff */}
      {staffToReassign && (
        <ConfirmationDialog
          title="Staff Already Assigned"
          description={`${staffToReassign.name} is already assigned to a team for this day. Are you sure you want to reassign to ${resource.title}?`}
          confirmLabel="Yes, Reassign"
          cancelLabel="Cancel"
          onConfirm={handleConfirmReassign}
        >
          <span style={{ display: 'none' }}></span>
        </ConfirmationDialog>
      )}
    </div>
  );
};
