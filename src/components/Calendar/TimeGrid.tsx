
import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import TimeSlots from './TimeSlots';
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
  // Generate time slots from 6 AM to 10 PM
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 6; hour <= 22; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  return (
    <div 
      className="time-grid"
      style={{
        gridTemplateColumns: `80px repeat(${resources.length}, 1fr)`,
        gridTemplateRows: '60px 1fr'
      }}
    >
      {/* Header with team labels */}
      <div className="time-grid-header">
        <div className="resource-header-label">
          {format(day, 'EEE d')}
        </div>
        {resources.map((resource) => (
          <div 
            key={resource.id} 
            className="day-header"
            style={{ borderLeft: `3px solid ${resource.eventColor}` }}
          >
            <div className="day-label">
              {resource.title}
            </div>
          </div>
        ))}
      </div>

      {/* Time labels column */}
      <div className="time-labels">
        {timeSlots.map((time) => (
          <div key={time} className="time-label">
            {time}
          </div>
        ))}
      </div>

      {/* Team columns */}
      <div className="resource-rows">
        <div className="resource-row">
          {resources.map((resource) => (
            <div key={resource.id} className="day-column">
              <TimeSlots
                day={day}
                resource={resource}
                timeSlots={timeSlots}
                events={getEventsForDayAndResource(day, resource.id)}
                onStaffDrop={onStaffDrop}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TimeGrid;
