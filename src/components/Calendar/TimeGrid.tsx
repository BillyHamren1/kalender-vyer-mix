
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
  return (
    <div 
      className="time-grid"
      style={{
        gridTemplateColumns: `repeat(${resources.length}, 1fr)`,
        gridTemplateRows: 'auto 1fr'
      }}
    >
      {/* Day Header - spans entire width */}
      <div className="day-header-full" style={{ gridColumn: '1 / -1' }}>
        <div className="day-title">
          {format(day, 'EEE d')}
        </div>
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

      {/* Team columns with staff assignments */}
      {resources.map((resource) => (
        <div key={resource.id} className="team-column">
          <StaffAssignmentArea
            day={day}
            resource={resource}
            events={getEventsForDayAndResource(day, resource.id)}
            onStaffDrop={onStaffDrop}
          />
        </div>
      ))}
    </div>
  );
};

export default TimeGrid;
