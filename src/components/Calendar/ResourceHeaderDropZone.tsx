
import React, { useEffect, useState } from 'react';
import { useDrop } from 'react-dnd';
import { Resource } from './ResourceData';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';
import { fetchStaffAssignmentsForDate } from '@/services/staffAssignmentService';
import { fetchStaffMembers } from '@/services/staffService';
import { format } from 'date-fns';

interface ResourceHeaderDropZoneProps {
  resource: Resource;
  currentDate: Date;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  onSelectStaff?: (resourceId: string, resourceTitle: string) => void;
  forceRefresh?: boolean;
}

const ResourceHeaderDropZone: React.FC<ResourceHeaderDropZoneProps> = ({
  resource,
  currentDate,
  onStaffDrop,
  onSelectStaff,
  forceRefresh
}) => {
  const [assignedStaff, setAssignedStaff] = useState<Array<{id: string, name: string}>>([]);
  const [isLoading, setIsLoading] = useState(false);

  console.log(`ResourceHeaderDropZone: Rendering for ${resource.id} with forceRefresh=${forceRefresh}`);

  // Fetch assigned staff for this team on the current date
  const fetchAssignedStaff = async () => {
    if (!currentDate) return;
    
    try {
      setIsLoading(true);
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      console.log(`ResourceHeaderDropZone: Fetching staff assignments for ${resource.id} on ${dateStr}`);
      
      // Get assignments for this team on this date
      const assignments = await fetchStaffAssignmentsForDate(currentDate);
      const teamAssignments = assignments.filter(assignment => assignment.teamId === resource.id);
      
      // Get full staff details
      const allStaff = await fetchStaffMembers();
      const assignedStaffDetails = teamAssignments
        .map(assignment => {
          const staff = allStaff.find(s => s.id === assignment.staffId);
          return staff ? { id: staff.id, name: staff.name } : null;
        })
        .filter(Boolean);
      
      console.log(`ResourceHeaderDropZone: Found ${assignedStaffDetails.length} staff assigned to ${resource.id}`);
      setAssignedStaff(assignedStaffDetails);
    } catch (error) {
      console.error('Error fetching assigned staff:', error);
      setAssignedStaff([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch staff when component mounts or when date/team/forceRefresh changes
  useEffect(() => {
    fetchAssignedStaff();
  }, [resource.id, currentDate, forceRefresh]);

  const [{ isOver }, drop] = useDrop({
    accept: 'staff',
    drop: async (item: { id: string }) => {
      console.log(`ResourceHeaderDropZone: Staff ${item.id} dropped on team ${resource.id}`);
      if (onStaffDrop) {
        try {
          await onStaffDrop(item.id, resource.id);
          // Refresh the staff assignments after successful drop
          await fetchAssignedStaff();
        } catch (error) {
          console.error('Error handling staff drop:', error);
        }
      }
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  });

  const handleSelectStaff = () => {
    console.log(`ResourceHeaderDropZone: Select staff clicked for ${resource.id}`);
    if (onSelectStaff) {
      onSelectStaff(resource.id, resource.title);
    } else {
      console.error('ResourceHeaderDropZone: onSelectStaff is not defined');
    }
  };

  return (
    <div
      ref={drop}
      className={`resource-header-drop-zone p-2 h-full w-full flex flex-col justify-between min-h-[50px] relative ${
        isOver ? 'bg-blue-100 border-2 border-blue-300' : 'bg-gray-50'
      } transition-colors duration-200`}
      style={{ 
        width: '80px',
        minWidth: '80px', 
        maxWidth: '80px',
        overflow: 'visible',
        position: 'relative',
        zIndex: 10
      }}
    >
      {/* Team Title */}
      <div className="text-xs font-medium text-center mb-1 truncate" title={resource.title}>
        {resource.title}
      </div>
      
      {/* Staff Section - only show assigned staff names, no "No staff assigned" text */}
      <div className="staff-section flex-1 min-h-0">
        {isLoading ? (
          <div className="text-xs text-gray-400 text-center">Loading...</div>
        ) : assignedStaff.length > 0 ? (
          <div className="space-y-1">
            {assignedStaff.map((staff) => (
              <div
                key={staff.id}
                className="bg-blue-100 text-blue-800 text-xs px-1 py-0.5 rounded truncate"
                title={staff.name}
              >
                {staff.name}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      
      {/* Select Staff Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSelectStaff}
        className="h-6 w-full text-xs p-1 mt-1"
        title="Select staff for this team"
      >
        <Users className="h-3 w-3" />
      </Button>
    </div>
  );
};

export default ResourceHeaderDropZone;
