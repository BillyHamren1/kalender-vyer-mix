
import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import StaffItem from './StaffItem';

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
  isHeaderRow?: boolean;
  weeklyStaffOperations?: {
    getStaffForTeamAndDate: (teamId: string, date: Date) => Array<{id: string, name: string, color?: string}>;
  };
}

const StaffAssignmentArea: React.FC<StaffAssignmentAreaProps> = ({
  day,
  resource,
  events,
  onStaffDrop,
  onOpenStaffSelection,
  timeSlots = [],
  isHeaderRow = false,
  weeklyStaffOperations
}) => {
  // Drag-and-drop removed - staff assignment now via click

  // Get assigned staff for this team on this specific day using weekly operations
  const assignedStaffRaw = weeklyStaffOperations 
    ? weeklyStaffOperations.getStaffForTeamAndDate(resource.id, day)
    : [];
  const assignedStaff = Array.isArray(assignedStaffRaw) ? assignedStaffRaw : [];

  const handleRemoveStaff = (staffId: string) => {
    if (onStaffDrop) {
      onStaffDrop(staffId, null, day);
    }
  };

  // Render header row version (above time slots)
  if (isHeaderRow) {
    return (
      <div className="staff-header-assignment-area">
        {/* Staff count info */}
        <div className="staff-count-info">
          {assignedStaff.length === 0 ? 'Click + to assign' : `${assignedStaff.length} staff`}
        </div>
        
        {/* Assigned Staff List - compact header version */}
        <div className="assigned-staff-header-list">
          {assignedStaff.map((staff) => (
            <StaffItem
              key={staff.id}
              staff={{
                id: staff.id,
                name: staff.name,
                color: staff.color,
                assignedTeam: resource.id
              }}
              onRemove={() => handleRemoveStaff(staff.id)}
              currentDate={day}
              teamName={resource.title}
              variant="compact"
              showRemoveDialog={true}
            />
          ))}
        </div>
      </div>
    );
  }

  // Original version for time slot alignment (not used in this layout)
  return (
    <div className="staff-assignment-area-aligned">
      {/* Time Slot Background Grid */}
      <div className="time-slot-grid-aligned">
        {timeSlots.map((slot) => (
          <div key={slot.time} className="time-slot-aligned" />
        ))}
      </div>

      {/* Staff Assignment Area */}
      <div className="staff-drop-zone-aligned">
        <div className="drop-info-aligned">
          {assignedStaff.length === 0 ? 'Click + to assign' : `${assignedStaff.length} staff assigned`}
        </div>
        
        <div className="assigned-staff-list-aligned">
          {assignedStaff.map((staff, index) => (
            <div key={staff.id} className="staff-item-positioned" style={{ top: `${index * 30}px` }}>
              <StaffItem
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
