
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
}

const TimeGrid: React.FC<TimeGridProps> = ({
  day,
  resources,
  events,
  getEventsForDayAndResource,
  onStaffDrop
}) => {
  // Generate time slots from 6 AM to 4 PM (10 slots as shown in image)
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 6; hour <= 16; hour++) {
      if (hour <= 12) {
        slots.push(`${hour}am`);
      } else {
        slots.push(`${hour - 12}pm`);
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  return (
    <div 
      className="time-grid"
      style={{
        gridTemplateColumns: `80px repeat(${resources.length}, 1fr)`,
        gridTemplateRows: 'auto auto 1fr'
      }}
    >
      {/* Day Header - spans entire width */}
      <div className="day-header-full" style={{ gridColumn: '1 / -1' }}>
        <div className="day-title">
          {format(day, 'EEE d')}
        </div>
      </div>

      {/* Time column label */}
      <div className="time-column-header">
        Time
      </div>

      {/* Team Headers */}
      {resources.map((resource) => (
        <div 
          key={resource.id} 
          className="team-header"
          style={{ borderLeft: `3px solid ${resource.eventColor}` }}
        >
          <div className="team-title">
            {resource.title}
          </div>
        </div>
      ))}

      {/* Time labels column */}
      <div className="time-labels">
        {timeSlots.map((time) => (
          <div key={time} className="time-label">
            {time}
          </div>
        ))}
      </div>

      {/* Team columns with staff assignments */}
      {resources.map((resource) => (
        <div key={resource.id} className="team-column">
          <StaffAssignmentArea
            day={day}
            resource={resource}
            timeSlots={timeSlots}
            events={getEventsForDayAndResource(day, resource.id)}
            onStaffDrop={onStaffDrop}
          />
        </div>
      ))}
    </div>
  );
};

export default TimeGrid;
