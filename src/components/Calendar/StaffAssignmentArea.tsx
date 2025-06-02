
import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import { useDrop } from 'react-dnd';
import { useReliableStaffOperations } from '@/hooks/useReliableStaffOperations';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  const handleAddStaff = () => {
    if (onOpenStaffSelection) {
      onOpenStaffSelection(resource.id, resource.title, day);
    }
  };

  return (
    <div className="unified-staff-assignment-area">
      {/* Time Slot Background Grid */}
      <div className="time-slot-grid">
        {timeSlots.map((slot) => (
          <div key={slot.time} className="time-slot" />
        ))}
      </div>

      {/* Unified Team Header + Staff Assignment */}
      <div
        ref={drop}
        className={`unified-team-area ${isOver ? 'drop-over' : ''}`}
      >
        {/* Team Header with controls */}
        <div 
          className="unified-team-header"
          style={{ borderLeft: `3px solid ${resource.eventColor}` }}
        >
          <div className="team-header-content">
            <div className="team-title">
              {resource.title}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="add-staff-button"
              onClick={handleAddStaff}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
        
        {/* Staff Assignment Content */}
        <div className="staff-assignment-content">
          <div className="drop-zone-info">
            <div className="drop-staff-text">
              {assignedStaff.length === 0 ? 'Drop staff here' : `${assignedStaff.length} staff assigned`}
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
    </div>
  );
};

export default StaffAssignmentArea;
