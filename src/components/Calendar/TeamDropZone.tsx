
import React from 'react';
import { useDrop } from 'react-dnd';
import { Resource } from './ResourceData';
import { StaffMember, StaffAssignment } from './StaffAssignmentRow';
import DraggableStaffItem from './DraggableStaffItem';
import { Users } from 'lucide-react';
import StaffDropdownMenu from './StaffDropdownMenu';

interface TeamDropZoneProps {
  resource: Resource;
  staffMembers: StaffMember[];
  assignments: StaffAssignment[];
  onDrop: (staffId: string, resourceId: string | null) => void;
  onAddStaff: (resourceId: string) => void;
  onSelectStaff: (resourceId: string, resourceTitle: string) => void;
  currentDate: Date;
}

const TeamDropZone: React.FC<TeamDropZoneProps> = ({ 
  resource, 
  staffMembers, 
  assignments, 
  onDrop, 
  onAddStaff, 
  onSelectStaff,
  currentDate 
}) => {
  // Create a drop zone specifically for the area below the header
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: 'STAFF',
    drop: (item: StaffMember) => onDrop(item.id, resource.id),
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  }));

  // Find staff members assigned to this team
  const teamAssignments = assignments.filter(assignment => assignment.team_id === resource.id);
  const teamStaff = teamAssignments.map(assignment => {
    const staffMember = staffMembers.find(staff => staff.id === assignment.staff_id);
    return staffMember ? {
      ...staffMember,
      assignedTeam: resource.id
    } : null;
  }).filter(Boolean) as StaffMember[];

  // Handle staff assignment from dropdown
  const handleAssignStaff = async (staffId: string, resourceId: string) => {
    onDrop(staffId, resourceId);
    return Promise.resolve();
  };

  return (
    <div className="h-full flex flex-col border border-gray-200 rounded-md overflow-hidden">
      {/* Team header - not a drop zone */}
      <div className="bg-gray-100 p-2 border-b border-gray-200">
        <div className="text-sm font-medium mb-2 flex items-center gap-1">
          <Users className="h-4 w-4" />
          <span>{resource.title}</span>
        </div>
        
        {/* Compact staff controls - now just showing the "New" button */}
        <div className="flex gap-1 mb-1">
          <button 
            className="flex-1 text-xs py-1 px-1 border border-dashed border-gray-300 text-gray-500 hover:bg-gray-100 rounded"
            onClick={() => onAddStaff(resource.id)}
            style={{ height: '22px' }}
          >
            + New
          </button>
        </div>
      </div>
      
      {/* Replace the old drop zone with our new StaffDropdownMenu */}
      <div className="p-2 border-b border-gray-200 bg-gray-50">
        <StaffDropdownMenu
          resourceId={resource.id}
          resourceTitle={resource.title}
          currentDate={currentDate}
          assignedStaff={teamStaff}
          onAssignStaff={handleAssignStaff}
        />
      </div>
      
      {/* Staff members list section - still a drop zone for dragging between teams */}
      <div 
        ref={drop}
        className={`p-2 flex-1 flex flex-col bg-white ${
          isOver ? 'bg-blue-50' : ''
        } transition-colors duration-200`}
      >
        {teamStaff.length > 0 ? (
          teamStaff.map(staff => (
            <DraggableStaffItem 
              key={staff.id} 
              staff={staff}
              onRemove={() => onDrop(staff.id, null)}
              currentDate={currentDate}
            />
          ))
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-3 text-xs text-gray-400 min-h-[60px]">
            <p>No staff assigned</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamDropZone;
