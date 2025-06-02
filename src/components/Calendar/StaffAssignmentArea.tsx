
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
  onOpenStaffSelection?: (resourceId: string, resourceTitle: string, targetDate: Date) => void;
  timeSlots?: TimeSlot[];
}

const StaffAssignmentArea: React.FC<StaffAssignmentAreaProps> = ({
  day,
  resource,
  events,
  onStaffDrop,
  onOpenStaffSelection,
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
    <div className="staff-assignment-area-aligned">
      {/* Time Slot Background Grid - matches time labels exactly */}
      <div className="time-slot-grid-aligned">
        {timeSlots.map((slot) => (
          <div key={slot.time} className="time-slot-aligned" />
        ))}
      </div>

      {/* Staff Assignment Drop Zone - overlays the time grid */}
      <div
        ref={drop}
        className={`staff-drop-zone-aligned ${isOver ? 'drop-over' : ''}`}
      >
        {/* Drop instruction or staff count */}
        <div className="drop-info-aligned">
          {assignedStaff.length === 0 ? 'Drop staff here' : `${assignedStaff.length} staff assigned`}
        </div>
        
        {/* Assigned Staff List - positioned within time slots */}
        <div className="assigned-staff-list-aligned">
          {assignedStaff.map((staff, index) => (
            <div key={staff.id} className="staff-item-positioned" style={{ top: `${index * 30}px` }}>
              <UnifiedDraggableStaffItem
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StaffAssignmentArea;
