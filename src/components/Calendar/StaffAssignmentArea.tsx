
import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import { useDrop } from 'react-dnd';
import { useReliableStaffOperations } from '@/hooks/useReliableStaffOperations';
import UnifiedDraggableStaffItem from './UnifiedDraggableStaffItem';

interface TimeSlot {
  time: string;
  displayTime: string;
}

interface StaffAssignmentAreaProps {
  day: Date;
  resource: Resource;
  events: CalendarEvent[];
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
  timeSlots?: TimeSlot[];
}

const StaffAssignmentArea: React.FC<StaffAssignmentAreaProps> = ({
  day,
  resource,
  events,
  onStaffDrop,
  timeSlots = []
}) => {
  const { getStaffForTeam } = useReliableStaffOperations(day);
  
  const [{ isOver }, drop] = useDrop({
    accept: ['STAFF'],
    drop: (item: any) => {
      console.log('StaffAssignmentArea: Item dropped', item, 'on', format(day, 'yyyy-MM-dd'), resource.id);
      if (item.id && onStaffDrop) {
        onStaffDrop(item.id, resource.id, day);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  // Get assigned staff for this team on this specific day
  const assignedStaff = getStaffForTeam(resource.id);

  const handleRemoveStaff = (staffId: string) => {
    if (onStaffDrop) {
      onStaffDrop(staffId, null, day);
    }
  };

  return (
    <div className="staff-assignment-area">
      {/* Time Slot Background Grid */}
      <div className="time-slot-grid">
        {timeSlots.map((slot) => (
          <div key={slot.time} className="time-slot" />
        ))}
      </div>

      {/* Staff Drop Zone */}
      <div
        ref={drop}
        className={`staff-drop-zone ${isOver ? 'drop-over' : ''}`}
        style={{ zIndex: 1 }}
      >
        <div className="drop-zone-header">
          <div className="drop-staff-text">
            {assignedStaff.length === 0 ? 'Drop staff' : `${assignedStaff.length} staff assigned`}
          </div>
        </div>
        
        {/* Assigned Staff List */}
        <div className="assigned-staff-list">
          {assignedStaff.map((staff) => (
            <UnifiedDraggableStaffItem
              key={staff.id}
              staff={{
                id: staff.id,
                name: staff.name,
                assignedTeam: resource.id
              }}
              onRemove={() => handleRemoveStaff(staff.id)}
              currentDate={day}
              teamName={resource.title}
              variant="assigned"
              showRemoveDialog={true}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default StaffAssignmentArea;
