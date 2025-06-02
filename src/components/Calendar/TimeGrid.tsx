
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
}

const TimeGrid: React.FC<TimeGridProps> = ({
  day,
  resources,
  events,
  getEventsForDayAndResource,
  onStaffDrop,
  onOpenStaffSelection
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

  return (
    <div 
      className="time-grid-aligned"
      style={{
        gridTemplateColumns: `80px repeat(${resources.length}, 1fr)`,
        gridTemplateRows: 'auto auto 1fr'
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

      {/* Empty cell for alignment */}
      <div className="time-empty-cell"></div>

      {/* Team Headers Row - aligned with time structure */}
      {resources.map((resource, index) => (
        <div 
          key={`header-${resource.id}`}
          className="team-header-cell"
          style={{ 
            gridColumn: index + 2,
            gridRow: 2,
            borderLeft: `3px solid ${resource.eventColor}`
          }}
        >
          <div className="team-header-content">
            <span className="team-title">{resource.title}</span>
            <button
              className="add-staff-button-header"
              onClick={() => onOpenStaffSelection?.(resource.id, resource.title, day)}
            >
              +
            </button>
          </div>
        </div>
      ))}

      {/* Time Labels Column */}
      <div className="time-labels-aligned">
        {timeSlots.map((slot) => (
          <div key={slot.time} className="time-label-aligned">
            {slot.displayTime}
          </div>
        ))}
      </div>

      {/* Team columns with staff assignments - aligned with time slots */}
      {resources.map((resource, index) => (
        <div 
          key={resource.id} 
          className="team-column-aligned"
          style={{ 
            gridColumn: index + 2,
            gridRow: 3
          }}
        >
          <StaffAssignmentArea
            day={day}
            resource={resource}
            events={getEventsForDayAndResource(day, resource.id)}
            onStaffDrop={onStaffDrop}
            onOpenStaffSelection={onOpenStaffSelection}
            timeSlots={timeSlots}
          />
        </div>
      ))}
    </div>
  );
};

export default TimeGrid;
