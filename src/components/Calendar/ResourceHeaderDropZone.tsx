
import React, { useEffect, useState } from 'react';
import { useDrop } from 'react-dnd';
import { Resource } from './ResourceData';
import { StaffMember } from './StaffTypes';
import { ArrowDown } from 'lucide-react';
import { fetchStaffAssignments } from '@/services/staffService';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import ConfirmationDialog from '@/components/ConfirmationDialog';

interface ResourceHeaderDropZoneProps {
  resource: Resource;
  currentDate?: Date;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  forceRefresh?: boolean;
}

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
  // Now only accept staff that are already assigned to a team
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: 'STAFF',
    drop: (item: StaffMember & { assignedTeam?: string | null }) => {
      if (onStaffDrop) {
        // Check if staff is already assigned elsewhere
        if (item.assignedTeam && item.assignedTeam !== resource.id) {
          setStaffToReassign(item);
          setShowConfirmation(true);
        } else if (item.assignedTeam) {
          onStaffDrop(item.id, resource.id);
        }
      }
      return { resourceId: resource.id };
    },
    canDrop: (item: StaffMember & { assignedTeam?: string | null }) => {
      // Only allow drops if the staff is already assigned to a team
      return !!item.assignedTeam;
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
  
  // Handle confirmation of staff reassignment
  const handleConfirmReassign = async () => {
    if (staffToReassign && onStaffDrop) {
      await onStaffDrop(staffToReassign.id, resource.id);
      setShowConfirmation(false);
      setStaffToReassign(null);
    }
  };

  // Helper function to get initials for avatar
  const getInitials = (name: string): string => {
    const nameParts = name.trim().split(' ');
    if (nameParts.length === 1) return nameParts[0].substring(0, 2).toUpperCase();
    return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
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
      
      {/* Simple drop zone */}
      <div 
        className={`
          resource-drop-zone text-xs flex items-center justify-center 
          border border-dashed p-1.5 rounded-md mt-auto
          ${isOver && canDrop ? 'bg-blue-50 border-blue-400 text-blue-800' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}
          ${isOver && !canDrop ? 'bg-red-50 border-red-400 text-red-800' : ''}
          transition-colors duration-200 z-10
        `}
        style={{ minHeight: "24px" }}
      >
        <div className="flex items-center gap-1">
          <ArrowDown className="h-3 w-3" />
          <span className="text-xs font-medium">Drop assigned staff</span>
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
