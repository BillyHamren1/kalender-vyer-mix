
import React, { useEffect, useState } from 'react';
import { useDrop, useDrag } from 'react-dnd';
import { Resource } from './ResourceData';
import { StaffMember } from './StaffTypes';
import { User, Users } from 'lucide-react';
import { fetchStaffAssignments } from '@/services/staffService';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import StaffDropdownMenu from './StaffDropdownMenu';
import { supabase } from '@/integrations/supabase/client';

interface ResourceHeaderDropZoneProps {
  resource: Resource;
  currentDate?: Date;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  forceRefresh?: boolean; // Add this prop to force refresh
}

// Generate a unique color based on staff ID
const getStaffColor = (staffId: string): { bg: string, border: string, text: string } => {
  // Create a simple hash from the staff ID
  let hash = 0;
  for (let i = 0; i < staffId.length; i++) {
    hash = staffId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // List of pleasant pastel background colors
  const bgColors = [
    'bg-purple-100', 'bg-blue-100', 'bg-green-100', 
    'bg-yellow-100', 'bg-pink-100', 'bg-indigo-100', 
    'bg-red-100', 'bg-orange-100', 'bg-teal-100', 
    'bg-cyan-100'
  ];
  
  // Matching border colors
  const borderColors = [
    'border-purple-300', 'border-blue-300', 'border-green-300', 
    'border-yellow-300', 'border-pink-300', 'border-indigo-300', 
    'border-red-300', 'border-orange-300', 'border-teal-300', 
    'border-cyan-300'
  ];

  // Text colors that work well on each background
  const textColors = [
    'text-purple-800', 'text-blue-800', 'text-green-800', 
    'text-yellow-800', 'text-pink-800', 'text-indigo-800', 
    'text-red-800', 'text-orange-800', 'text-teal-800', 
    'text-cyan-800'
  ];
  
  // Use the hash to select a color
  const index = Math.abs(hash) % bgColors.length;
  
  return {
    bg: bgColors[index],
    border: borderColors[index],
    text: textColors[index]
  };
};

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

  // Get color for this staff member
  const staffColor = getStaffColor(staff.id);

  // Helper function to get initials for avatar
  const getInitials = (name: string): string => {
    const nameParts = name.trim().split(' ');
    if (nameParts.length === 1) return nameParts[0].substring(0, 2).toUpperCase();
    return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
  };

  return (
    <div 
      ref={drag}
      className={`${isDragging ? 'opacity-50' : 'opacity-100'} flex justify-center`}
    >
      <Badge 
        key={staff.id}
        variant="outline"
        className={`staff-badge flex items-center ${staffColor.bg} bg-white border ${staffColor.border} text-xs rounded-md px-1.5 py-0.5 z-20 shadow-sm cursor-move`}
        title={staff.name}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <Avatar className={`h-4 w-4 mr-1 ${staffColor.bg}`}>
          <AvatarFallback className={`text-[8px] ${staffColor.text}`}>
            {getInitials(staff.name)}
          </AvatarFallback>
        </Avatar>
        <span className={`truncate max-w-[50px] font-medium text-gray-800`}>{staff.name.split(' ')[0]}</span>
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
  
  // Create a drop zone specifically for the calendar resource header (for dragging between teams)
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
  
  // Fetch assigned staff with better error handling and performance
  useEffect(() => {
    const loadAssignedStaff = async () => {
      if (!currentDate) return;
      
      try {
        setIsLoading(true);
        
        // Get staff assigned to this specific team on this date
        const staffAssignments = await fetchStaffAssignments(currentDate, resource.id);
        
        // Transform assignments to staff members
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

  // Handle staff assignment from dropdown with improved performance
  const handleAssignStaff = async (staffId: string, resourceId: string) => {
    if (onStaffDrop) {
      try {
        await onStaffDrop(staffId, resourceId);
        
        // Update local state for immediate feedback
        const staffInfo = await getStaffInfo(staffId);
        if (staffInfo) {
          setAssignedStaff(prev => [...prev, { 
            ...staffInfo,
            assignedTeam: resourceId
          }]);
        }
        
        return Promise.resolve();
      } catch (error) {
        console.error('Error in handleAssignStaff:', error);
        return Promise.reject(error);
      }
    }
    return Promise.resolve();
  };

  // Helper function to get staff info
  const getStaffInfo = async (staffId: string): Promise<StaffMember | null> => {
    try {
      const { data, error } = await supabase
        .from('staff_members')
        .select('id, name, email, phone')
        .eq('id', staffId)
        .single();
        
      if (error || !data) {
        console.error('Error fetching staff info:', error);
        return null;
      }
      
      return data as StaffMember;
    } catch (error) {
      console.error('Error in getStaffInfo:', error);
      return null;
    }
  };

  return (
    <div 
      ref={drop}
      className="resource-header-wrapper"
    >
      {/* Team title - centered with improved styling */}
      <div className="resource-title-area">
        {resource.title}
      </div>
      
      {/* Assigned staff area - centered with fixed height */}
      <div className="assigned-staff-area">
        {assignedStaff.map((staff) => (
          <DraggableStaffBadge 
            key={staff.id} 
            staff={staff} 
            onRemove={() => handleRemoveStaff(staff.id)} 
          />
        ))}
      </div>
      
      {/* StaffDropdownMenu - centered and consistent width */}
      <div className="resource-dropdown-zone">
        <StaffDropdownMenu
          resourceId={resource.id}
          resourceTitle={resource.title}
          currentDate={currentDate}
          assignedStaff={assignedStaff}
          onAssignStaff={handleAssignStaff}
        />
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
