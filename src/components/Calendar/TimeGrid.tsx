
import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import ResourceColumn from './ResourceColumn';
import TimeSlots from './TimeSlots';
import './TimeGrid.css';

interface TimeGridProps {
  days: Date[];
  resources: Resource[];
  events: CalendarEvent[];
  getEventsForDayAndResource: (date: Date, resourceId: string) => CalendarEvent[];
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
}

const TimeGrid: React.FC<TimeGridProps> = ({
  days,
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
    <div className="time-grid">
      {/* Header with day labels */}
      <div className="time-grid-header">
        <div className="resource-header-label">Teams</div>
        {days.map((day) => (
          <div key={format(day, 'yyyy-MM-dd')} className="day-header">
            <div className="day-label">
              {format(day, 'EEE d')}
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

      {/* Resource rows */}
      <div className="resource-rows">
        {resources.map((resource) => (
          <div key={resource.id} className="resource-row">
            {/* Resource label */}
            <ResourceColumn
              resource={resource}
              onStaffDrop={onStaffDrop}
            />
            
            {/* Time slots for each day */}
            {days.map((day) => (
              <div key={`${resource.id}-${format(day, 'yyyy-MM-dd')}`} className="day-column">
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
        ))}
      </div>
    </div>
  );
};

export default TimeGrid;
