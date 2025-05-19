
import React from 'react';
import { useDrop } from 'react-dnd';
import { Resource } from './ResourceData';
import { StaffMember, StaffAssignment } from './StaffAssignmentRow';
import DraggableStaffItem from './DraggableStaffItem';
import { Users, UserPlus } from 'lucide-react';

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
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'STAFF',
    drop: (item: StaffMember) => onDrop(item.id, resource.id),
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
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
    <div className="border-r border-gray-200 h-full bg-gray-50">
      {/* Header and drop zone section */}
      <div 
        ref={drop}
        className={`p-2 border-b border-gray-200 ${isOver ? 'bg-blue-50' : ''}`}
      >
        {/* Team header */}
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
      
      {/* Staff members list */}
      <div className="p-2">
        {teamStaff.map(staff => (
          <DraggableStaffItem 
            key={staff.id} 
            staff={staff}
            onRemove={() => onDrop(staff.id, null)}
            currentDate={currentDate}
          />
        ))}
      </div>
    </div>
  );
};

export default TeamDropZone;
