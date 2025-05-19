
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
    <div 
      ref={drop}
      className={`p-2 border-r border-gray-200 h-full ${isOver ? 'bg-blue-50' : 'bg-gray-50'}`}
    >
      <div className="text-sm font-medium mb-2 flex items-center gap-1">
        <Users className="h-4 w-4" />
        <span>{resource.title}</span>
      </div>
      
      {teamStaff.map(staff => (
        <DraggableStaffItem 
          key={staff.id} 
          staff={staff}
          onRemove={() => onDrop(staff.id, null)}
          currentDate={currentDate}
        />
      ))}
      
      <div className="flex flex-col gap-1 mt-2">
        <button 
          className="w-full text-xs py-1 border border-dashed border-gray-300 text-gray-500 hover:bg-gray-100 rounded flex items-center justify-center gap-1"
          onClick={() => onSelectStaff(resource.id, resource.title)}
        >
          <UserPlus className="h-3 w-3" />
          <span>Select Staff</span>
        </button>
        <button 
          className="w-full text-xs py-1 border border-dashed border-gray-300 text-gray-500 hover:bg-gray-100 rounded"
          onClick={() => onAddStaff(resource.id)}
        >
          + Add New Staff
        </button>
      </div>
    </div>
  );
};

export default TeamDropZone;
