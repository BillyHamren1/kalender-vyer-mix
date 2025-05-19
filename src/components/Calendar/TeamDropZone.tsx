
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
  // Make the entire column a drop zone
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

  // Determine visual styles based on drop state
  const dropZoneStyle = isOver 
    ? 'border-2 border-dashed border-blue-400 bg-blue-50' 
    : canDrop 
      ? 'border-2 border-dashed border-gray-300'
      : 'border border-gray-200';

  return (
    <div 
      ref={drop}
      className={`h-full flex flex-col ${dropZoneStyle} transition-all duration-200 rounded-md overflow-hidden`}
    >
      {/* Team header */}
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
      
      {/* Staff members list section with drop indicator when empty */}
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
          <div className={`
            flex-1 flex flex-col items-center justify-center p-3 
            text-xs text-gray-500 min-h-[100px]
            ${isOver ? 'bg-blue-50' : ''}
          `}>
            <MoveDown className="h-5 w-5 mb-1 animate-bounce" />
            <p>Drop staff here</p>
          </div>
        )}
      </div>
      
      {/* Visual indicator that appears while dragging */}
      {isOver && (
        <div className="absolute inset-0 bg-blue-100 bg-opacity-30 pointer-events-none z-10 flex items-center justify-center">
          <div className="bg-white px-2 py-1 rounded-md text-xs font-medium text-blue-600 shadow-sm">
            Drop to assign
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamDropZone;
