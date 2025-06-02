
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
      className="time-grid"
      style={{
        gridTemplateColumns: `80px repeat(${resources.length}, 1fr)`,
        gridTemplateRows: 'auto auto 1fr'
      }}
    >
      {/* Time Column Header - spans rows 1-2 */}
      <div className="time-column-header">
        <div className="time-title">Time</div>
      </div>

      {/* Day Header - spans team columns only */}
      <div className="day-header-teams" style={{ gridColumn: '2 / -1' }}>
        <div className="day-title">
          {format(day, 'EEE d')}
        </div>
      </div>

      {/* Team Headers - row 2, columns 2+ */}
      {resources.map((resource, index) => (
        <div 
          key={resource.id} 
          className="team-header"
          style={{ 
            gridColumn: index + 2,
            gridRow: 2,
            borderLeft: `3px solid ${resource.eventColor}` 
          }}
        >
          <div className="team-title">
            {resource.title}
          </div>
        </div>
      ))}

      {/* Time Labels Column - row 3, column 1 */}
      <div className="time-labels">
        {timeSlots.map((slot) => (
          <div key={slot.time} className="time-label">
            {slot.displayTime}
          </div>
        ))}
      </div>

      {/* Team columns with staff assignments - row 3, columns 2+ */}
      {resources.map((resource, index) => (
        <div 
          key={resource.id} 
          className="team-column"
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
            timeSlots={timeSlots}
          />
        </div>
      ))}
    </div>
  );
};

export default TimeGrid;
