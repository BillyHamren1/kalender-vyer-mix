
import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import StaffAssignmentArea from './StaffAssignmentArea';
import './TimeGrid.css';

interface TimeGridProps {
  day: Date;
  resources: Resource[];
  events: CalendarEvent[];
  getEventsForDayAndResource: (date: Date, resourceId: string) => CalendarEvent[];
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
  onOpenStaffSelection?: (resourceId: string, resourceTitle: string, targetDate: Date) => void;
  dayWidth?: number; // New prop for responsive width
}

const TimeGrid: React.FC<TimeGridProps> = ({
  day,
  resources,
  events,
  getEventsForDayAndResource,
  onStaffDrop,
  onOpenStaffSelection,
  dayWidth = 300
}) => {
  // Generate time slots from 05:00 to 23:00
  const generateTimeSlots = () => {
    const timeSlots = [];
    for (let hour = 5; hour <= 23; hour++) {
      const time = hour.toString().padStart(2, '0') + ':00';
      const displayTime = hour <= 12 ? `${hour}am` : `${hour - 12}pm`;
      if (hour === 12) {
        timeSlots.push({ time, displayTime: '12pm' });
      } else {
        timeSlots.push({ time, displayTime });
      }
    }
    return timeSlots;
  };

  const timeSlots = generateTimeSlots();

  // Calculate responsive column widths
  const timeColumnWidth = 80; // Fixed width for time column
  const availableWidth = dayWidth - timeColumnWidth;
  const teamColumnWidth = Math.max(120, Math.floor(availableWidth / resources.length)); // Minimum 120px per team

  return (
    <div 
      className="time-grid-with-staff-header"
      style={{
        gridTemplateColumns: `${timeColumnWidth}px repeat(${resources.length}, ${teamColumnWidth}px)`,
        gridTemplateRows: 'auto auto auto 1fr',
        width: `${dayWidth}px`
      }}
    >
      {/* Time Column Header */}
      <div className="time-column-header">
        <div className="time-title">Time</div>
      </div>

      {/* Day Header - spans team columns only */}
      <div className="day-header-teams" style={{ gridColumn: '2 / -1' }}>
        <div className="day-title">
          {format(day, 'EEE d')}
        </div>
      </div>

      {/* Empty cell for time column alignment with team headers */}
      <div className="time-empty-cell" style={{ gridRow: 2 }}></div>

      {/* Team Headers Row */}
      {resources.map((resource, index) => (
        <div 
          key={`header-${resource.id}`}
          className="team-header-cell"
          style={{ 
            gridColumn: index + 2,
            gridRow: 2,
            borderLeft: `3px solid ${resource.eventColor}`,
            width: `${teamColumnWidth}px`
          }}
        >
          <div className="team-header-content">
            <span className="team-title" title={resource.title}>{resource.title}</span>
            <button
              className="add-staff-button-header"
              onClick={() => onOpenStaffSelection?.(resource.id, resource.title, day)}
            >
              +
            </button>
          </div>
        </div>
      ))}

      {/* Empty cell for staff assignment row alignment */}
      <div className="staff-row-time-cell" style={{ gridRow: 3 }}></div>

      {/* Staff Assignment Row - dedicated space above time slots */}
      {resources.map((resource, index) => (
        <div 
          key={`staff-${resource.id}`}
          className="staff-assignment-header-row"
          style={{ 
            gridColumn: index + 2,
            gridRow: 3,
            width: `${teamColumnWidth}px`
          }}
        >
          <StaffAssignmentArea
            day={day}
            resource={resource}
            events={getEventsForDayAndResource(day, resource.id)}
            onStaffDrop={onStaffDrop}
            onOpenStaffSelection={onOpenStaffSelection}
            timeSlots={[]} // No time slots for header row
            isHeaderRow={true}
          />
        </div>
      ))}

      {/* Time Labels Column */}
      <div className="time-labels-column" style={{ gridRow: 4 }}>
        {timeSlots.map((slot) => (
          <div key={slot.time} className="time-label-slot">
            {slot.displayTime}
          </div>
        ))}
      </div>

      {/* Time Slot Columns - below staff assignments */}
      {resources.map((resource, index) => (
        <div 
          key={`timeslots-${resource.id}`} 
          className="time-slots-column"
          style={{ 
            gridColumn: index + 2,
            gridRow: 4,
            width: `${teamColumnWidth}px`
          }}
        >
          <div className="time-slots-grid">
            {timeSlots.map((slot) => (
              <div key={slot.time} className="time-slot-cell" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TimeGrid;
