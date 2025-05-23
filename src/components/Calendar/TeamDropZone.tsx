
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

  // Set up drop target for staff reassignment with better validation
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: 'STAFF',
    drop: (item: StaffMember, monitor) => {
      console.log('Staff dropped onto team:', item.name, 'to team:', resource.title);
      console.log('Drop item details:', item);
      
      // Prevent dropping staff onto the same team they're already assigned to
      const isAlreadyAssigned = teamStaff.some(staff => staff.id === item.id);
      if (isAlreadyAssigned) {
        console.log('Staff is already assigned to this team, skipping drop');
        return;
      }
      
      onDrop(item.id, resource.id);
    },
    canDrop: (item: StaffMember) => {
      // Check if staff is already assigned to this team
      const isAlreadyAssigned = teamStaff.some(staff => staff.id === item.id);
      return !isAlreadyAssigned;
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  });

  // Handler for staff selection
  const handleSelectStaff = () => {
    console.log('TeamDropZone: handleSelectStaff clicked for', resource.id, resource.title);
    onSelectStaff(resource.id, resource.title);
  }

  // Handle staff removal from team
  const handleStaffRemoval = (staffId: string) => {
    console.log('Removing staff from team:', staffId, 'from team:', resource.title);
    onDrop(staffId, null);
  };

  // Create placeholder staff slots to ensure consistent height
  const emptySlots = 5 - teamStaff.length;
  const placeholders = Array(emptySlots > 0 ? emptySlots : 0).fill(null);

  // Determine drop zone styling
  const dropZoneClass = `h-full flex flex-col border border-gray-200 rounded-md overflow-hidden transition-colors duration-200 ${
    isOver && canDrop ? 'bg-purple-50 border-purple-300' : 
    isOver && !canDrop ? 'bg-red-50 border-red-300' : ''
  }`;

  return (
    <div 
      ref={drop}
      className={dropZoneClass}
    >
      {/* Team header with icon button in right corner */}
      <div className="bg-gray-100 p-2 border-b border-gray-200">
        <div className="text-sm font-medium mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>{resource.title}</span>
          </div>
          <button 
            className="assign-button-icon hover:bg-gray-200 p-1 rounded transition-colors"
            onClick={handleSelectStaff}
            title="Assign staff"
          >
            <UserPlus className="h-3 w-3" />
          </button>
        </div>
        
        {/* New staff button only */}
        <div className="flex justify-end mb-1">
          <button 
            className="text-xs py-1 px-2 border border-dashed border-gray-300 text-gray-500 hover:bg-gray-100 rounded transition-colors"
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
                onRemove={() => handleStaffRemoval(staff.id)}
                currentDate={currentDate}
                teamName={resource.title}
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
        
        {/* Drop indicator */}
        {isOver && canDrop && (
          <div className="absolute inset-0 bg-purple-100 border-2 border-dashed border-purple-400 rounded-md flex items-center justify-center pointer-events-none">
            <span className="text-purple-600 text-xs font-medium">Drop staff here</span>
          </div>
        )}
        
        {isOver && !canDrop && (
          <div className="absolute inset-0 bg-red-100 border-2 border-dashed border-red-400 rounded-md flex items-center justify-center pointer-events-none">
            <span className="text-red-600 text-xs font-medium">Already assigned</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamDropZone;
