
import React, { useState } from 'react';
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
  isHeaderRow?: boolean;
}

const StaffAssignmentArea: React.FC<StaffAssignmentAreaProps> = ({
  day,
  resource,
  events,
  onStaffDrop,
  onOpenStaffSelection,
  timeSlots = [],
  isHeaderRow = false
}) => {
  const { getStaffForTeam } = useReliableStaffOperations(day);
  const [isDragOver, setIsDragOver] = useState(false);
  const [canDropHere, setCanDropHere] = useState(false);
  
  const [{ isOver }, drop] = useDrop({
    accept: ['STAFF'],
    drop: async (item: any) => {
      console.log('StaffAssignmentArea: Item dropped', item, 'on', format(day, 'yyyy-MM-dd'), resource.id);
      setIsDragOver(false);
      setCanDropHere(false);
      
      if (item.id && onStaffDrop) {
        try {
          await onStaffDrop(item.id, resource.id, day);
        } catch (error) {
          console.error('Error handling staff drop:', error);
        }
      }
    },
    hover: (item: any) => {
      const assignedStaff = getStaffForTeam(resource.id);
      const isAlreadyAssigned = assignedStaff.some(staff => staff.id === item.id);
      setCanDropHere(!isAlreadyAssigned);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  // Update drag state
  React.useEffect(() => {
    setIsDragOver(isOver);
    if (!isOver) {
      setCanDropHere(false);
    }
  }, [isOver]);

  // Get assigned staff for this team on this specific day
  const assignedStaff = getStaffForTeam(resource.id);

  const handleRemoveStaff = async (staffId: string) => {
    if (onStaffDrop) {
      try {
        await onStaffDrop(staffId, null, day);
      } catch (error) {
        console.error('Error removing staff:', error);
      }
    }
  };

  // Render header row version (above time slots)
  if (isHeaderRow) {
    return (
      <div
        ref={drop}
        className={`staff-header-assignment-area ${
          isDragOver ? (canDropHere ? 'drop-over-valid' : 'drop-over-invalid') : ''
        }`}
      >
        {/* Staff count or drop instruction with visual feedback */}
        <div className={`staff-count-info ${isDragOver ? 'drag-active' : ''}`}>
          {isDragOver 
            ? (canDropHere ? `Drop for ${format(day, 'MMM d')}` : 'Already assigned')
            : (assignedStaff.length === 0 ? 'Drop staff here' : `${assignedStaff.length} staff`)
          }
        </div>
        
        {/* Assigned Staff List - compact header version */}
        <div className="assigned-staff-header-list">
          {assignedStaff.map((staff, index) => (
            <div key={staff.id} className="staff-header-item">
              <UnifiedDraggableStaffItem
                staff={{
                  id: staff.id,
                  name: staff.name,
                  color: staff.color || '#E3F2FD',
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

        {/* Visual drop indicator */}
        {isDragOver && (
          <div className={`drop-indicator ${canDropHere ? 'valid' : 'invalid'}`}>
            <div className="drop-indicator-content">
              {canDropHere ? '+ Drop Here' : '⚠ Already Assigned'}
            </div>
          </div>
        )}
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

      {/* Staff Assignment Drop Zone */}
      <div
        ref={drop}
        className={`staff-drop-zone-aligned ${
          isDragOver ? (canDropHere ? 'drop-over-valid' : 'drop-over-invalid') : ''
        }`}
      >
        <div className="drop-info-aligned">
          {assignedStaff.length === 0 ? 'Drop staff here' : `${assignedStaff.length} staff assigned`}
        </div>
        
        <div className="assigned-staff-list-aligned">
          {assignedStaff.map((staff, index) => (
            <div key={staff.id} className="staff-item-positioned" style={{ top: `${index * 30}px` }}>
              <UnifiedDraggableStaffItem
                staff={{
                  id: staff.id,
                  name: staff.name,
                  color: staff.color || '#E3F2FD',
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
