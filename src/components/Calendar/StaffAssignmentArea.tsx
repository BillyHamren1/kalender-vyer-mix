
import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import { useDrop } from 'react-dnd';
import { useEnhancedStaffOperations } from '@/hooks/useEnhancedStaffOperations';
import DraggableStaffItem from './DraggableStaffItem';

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
  const { getStaffForTeam } = useEnhancedStaffOperations(day);
  
  const [{ isOver }, drop] = useDrop({
    accept: ['staff', 'event'],
    drop: (item: any) => {
      console.log('StaffAssignmentArea: Item dropped', item, 'on', format(day, 'yyyy-MM-dd'), resource.id);
      if (item.type === 'staff' && onStaffDrop) {
        onStaffDrop(item.id, resource.id, day);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  // Get assigned staff for this team
  const assignedStaff = getStaffForTeam(resource.id);

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
            <DraggableStaffItem
              key={staff.id}
              staff={staff}
              onRemove={() => onStaffDrop && onStaffDrop(staff.id, null, day)}
              currentDate={day}
              teamName={resource.title}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default StaffAssignmentArea;
