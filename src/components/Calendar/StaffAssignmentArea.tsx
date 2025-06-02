
import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import { useDrop } from 'react-dnd';
import { useEnhancedStaffOperations } from '@/hooks/useEnhancedStaffOperations';
import DraggableStaffItem from './DraggableStaffItem';

interface StaffAssignmentAreaProps {
  day: Date;
  resource: Resource;
  timeSlots: string[];
  events: CalendarEvent[];
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
}

const StaffAssignmentArea: React.FC<StaffAssignmentAreaProps> = ({
  day,
  resource,
  timeSlots,
  events,
  onStaffDrop
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
      {/* Staff Drop Zone */}
      <div
        ref={drop}
        className={`staff-drop-zone ${isOver ? 'drop-over' : ''}`}
      >
        <div className="drop-zone-header">
          <div className="team-name" style={{ color: resource.eventColor }}>
            {resource.title}
          </div>
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

      {/* Time Grid Background */}
      <div className="time-grid-background">
        {timeSlots.map((time, index) => (
          <div
            key={time}
            className="time-slot-background"
            style={{
              height: '60px',
              borderBottom: '1px solid #f3f4f6',
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default StaffAssignmentArea;
