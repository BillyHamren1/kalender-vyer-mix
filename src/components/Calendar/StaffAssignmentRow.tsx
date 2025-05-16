
import React, { useState } from 'react';
import { Resource } from './ResourceData';
import { useDrag, useDrop } from 'react-dnd';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// Interface for a staff member
interface StaffMember {
  id: string;
  name: string;
  assignedTeam: string | null;
}

// Props for the StaffAssignmentRow component
interface StaffAssignmentRowProps {
  resources: Resource[];
}

// Component for draggable staff item
const DraggableStaffItem: React.FC<{ staff: StaffMember; onRemove: () => void }> = ({ staff, onRemove }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'STAFF',
    item: staff,
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  return (
    <div
      ref={drag}
      className={`p-2 bg-white border border-gray-200 rounded mb-1 cursor-move flex justify-between items-center ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <span>{staff.name}</span>
      <button 
        onClick={onRemove}
        className="text-gray-500 hover:text-red-500"
      >
        &times;
      </button>
    </div>
  );
};

// Component for the team column drop target
const TeamDropZone: React.FC<{ 
  resource: Resource; 
  staffMembers: StaffMember[]; 
  onDrop: (staffId: string, resourceId: string | null) => void;
  onAddStaff: (resourceId: string) => void;
}> = ({ resource, staffMembers, onDrop, onAddStaff }) => {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'STAFF',
    drop: (item: StaffMember) => onDrop(item.id, resource.id),
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  }));

  // Filter staff members assigned to this team
  const teamStaff = staffMembers.filter(staff => staff.assignedTeam === resource.id);

  return (
    <div 
      ref={drop}
      className={`p-2 border-r border-gray-200 h-full ${isOver ? 'bg-blue-50' : 'bg-gray-50'}`}
    >
      <div className="text-sm font-medium mb-2">{resource.title}</div>
      
      {teamStaff.map(staff => (
        <DraggableStaffItem 
          key={staff.id} 
          staff={staff}
          onRemove={() => onDrop(staff.id, null)}
        />
      ))}
      
      <button 
        className="w-full mt-2 text-xs py-1 border border-dashed border-gray-300 text-gray-500 hover:bg-gray-100 rounded"
        onClick={() => onAddStaff(resource.id)}
      >
        + Add Staff
      </button>
    </div>
  );
};

// Main StaffAssignmentRow component
const StaffAssignmentRow: React.FC<StaffAssignmentRowProps> = ({ resources }) => {
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([
    { id: 'staff-1', name: 'John Doe', assignedTeam: 'team-1' },
    { id: 'staff-2', name: 'Jane Smith', assignedTeam: 'team-2' },
    { id: 'staff-3', name: 'Mike Johnson', assignedTeam: null },
  ]);

  // Handler for dropping a staff member into a team column
  const handleStaffDrop = (staffId: string, resourceId: string | null) => {
    setStaffMembers(prev => 
      prev.map(staff => 
        staff.id === staffId 
          ? { ...staff, assignedTeam: resourceId } 
          : staff
      )
    );
  };

  // Handler for adding a new staff member
  const handleAddStaff = (resourceId: string) => {
    const newStaffId = `staff-${staffMembers.length + 1}`;
    const newStaff: StaffMember = {
      id: newStaffId,
      name: `New Staff ${staffMembers.length + 1}`,
      assignedTeam: resourceId,
    };
    
    setStaffMembers(prev => [...prev, newStaff]);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="mt-4 border border-gray-200 rounded-md overflow-hidden">
        <div className="bg-gray-100 p-2 border-b border-gray-200">
          <h3 className="text-sm font-semibold">Assign Staff</h3>
        </div>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${resources.length}, 1fr)` }}>
          {resources.map(resource => (
            <TeamDropZone
              key={resource.id}
              resource={resource}
              staffMembers={staffMembers}
              onDrop={handleStaffDrop}
              onAddStaff={handleAddStaff}
            />
          ))}
        </div>
      </div>
    </DndProvider>
  );
};

export default StaffAssignmentRow;
