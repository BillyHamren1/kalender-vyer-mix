
import React from 'react';
import { useDrop } from 'react-dnd';
import { Resource } from './ResourceData';
import { StaffMember, StaffAssignment } from './StaffAssignmentRow';
import DraggableStaffItem from './DraggableStaffItem';
import { Users, UserPlus, MoveDown } from 'lucide-react';

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

  return (
    <div className="h-full flex flex-col border border-gray-200 rounded-md overflow-hidden">
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
            onClick={() => onSelectStaff(resource.id, resource.title)}
            style={{ height: '22px' }}
          >
            <UserPlus className="h-3 w-3" />
            <span>Select</span>
          </button>
          <button 
            className="flex-1 text-xs py-1 px-1 border border-dashed border-gray-300 text-gray-500 hover:bg-gray-100 rounded"
            onClick={() => onAddStaff(resource.id)}
            style={{ height: '22px' }}
          >
            + New
          </button>
        </div>
      </div>
      
      {/* Dedicated drop zone area directly under the header */}
      <div 
        ref={drop}
        className={`
          p-2 border-b border-gray-200 
          ${isOver ? 'bg-blue-50 border-dashed border-blue-400' : 'bg-gray-50 border-dashed border-gray-300'} 
          transition-all duration-200 flex items-center justify-center
        `}
        style={{ minHeight: '40px' }}
      >
        <div className="flex flex-col items-center justify-center text-xs text-gray-500">
          <MoveDown className="h-4 w-4 mb-1" />
          <p>Drop staff here</p>
        </div>
      </div>
      
      {/* Staff members list section - not a drop zone */}
      <div className="p-2 flex-1 flex flex-col bg-white">
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
