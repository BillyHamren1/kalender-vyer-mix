
import React from 'react';
import { Resource } from './ResourceData';
import { StaffMember, StaffAssignment } from './StaffAssignmentRow';
import DraggableStaffItem from './DraggableStaffItem';
import { Users, UserPlus } from 'lucide-react';
import { useDrop } from 'react-dnd';

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
  // Find staff members assigned to this team
  const teamAssignments = assignments.filter(assignment => assignment.team_id === resource.id);
  const teamStaff = teamAssignments.map(assignment => {
    const staffMember = staffMembers.find(staff => staff.id === assignment.staff_id);
    return staffMember ? {
      ...staffMember,
      assignedTeam: resource.id
    } : null;
  }).filter(Boolean) as StaffMember[];

  // Set up drop target for staff reassignment
  const [{ isOver }, drop] = useDrop({
    accept: 'STAFF',
    drop: (item: StaffMember) => {
      console.log('Dropping staff onto team:', item.id, resource.id);
      onDrop(item.id, resource.id);
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  });

  // Handler for staff selection
  const handleSelectStaff = () => {
    console.log('TeamDropZone: handleSelectStaff clicked for', resource.id, resource.title);
    onSelectStaff(resource.id, resource.title);
  }

  // Create placeholder staff slots to ensure consistent height
  const emptySlots = 5 - teamStaff.length;
  const placeholders = Array(emptySlots > 0 ? emptySlots : 0).fill(null);

  return (
    <div 
      ref={drop}
      className={`h-full flex flex-col border border-gray-200 rounded-md overflow-hidden ${
        isOver ? 'bg-purple-50' : ''
      }`}
    >
      {/* Team header - not a drop zone */}
      <div className="bg-gray-100 p-2 border-b border-gray-200">
        <div className="text-sm font-medium mb-2 flex items-center gap-1">
          <Users className="h-4 w-4" />
          <span>{resource.title}</span>
        </div>
        
        {/* Compact staff controls */}
        <div className="flex gap-1 mb-1">
          <button 
            className="flex-1 text-xs py-1 px-1 border border-dashed border-gray-300 text-gray-500 hover:bg-gray-100 rounded flex items-center justify-center gap-1"
            onClick={handleSelectStaff}
            style={{ height: "22px" }}
          >
            <UserPlus className="h-3 w-3" />
            <span>Assign</span>
          </button>
          <button 
            className="flex-1 text-xs py-1 px-1 border border-dashed border-gray-300 text-gray-500 hover:bg-gray-100 rounded"
            onClick={() => onAddStaff(resource.id)}
            style={{ height: "22px" }}
          >
            + New
          </button>
        </div>
      </div>
      
      {/* Staff members list section */}
      <div className="p-2 flex-1 flex flex-col bg-white">
        {teamStaff.length > 0 ? (
          <>
            {teamStaff.map(staff => (
              <DraggableStaffItem 
                key={staff.id} 
                staff={staff}
                onRemove={() => onDrop(staff.id, null)}
                currentDate={currentDate}
              />
            ))}
            
            {/* Empty placeholder slots to maintain consistent height */}
            {placeholders.map((_, index) => (
              <div 
                key={`placeholder-${index}`}
                className="staff-placeholder h-[24px] w-full opacity-0 my-1"
              />
            ))}
          </>
        ) : (
          <>
            <div className="flex items-center justify-center p-1 text-xs text-gray-400">
              <p>No staff assigned</p>
            </div>
            
            {/* Empty placeholder slots to maintain consistent height */}
            {placeholders.slice(1).map((_, index) => (
              <div 
                key={`placeholder-${index}`}
                className="staff-placeholder h-[24px] w-full opacity-0 my-1"
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default TeamDropZone;
