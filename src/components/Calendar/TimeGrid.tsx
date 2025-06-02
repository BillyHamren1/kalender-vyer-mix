
import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import StaffAssignmentArea from './StaffAssignmentArea';
import BookingEvent from './BookingEvent';
import { useWeeklyStaffOperations } from '@/hooks/useWeeklyStaffOperations';
import './TimeGrid.css';

interface TimeGridProps {
  day: Date;
  resources: Resource[];
  events: CalendarEvent[];
  getEventsForDayAndResource: (date: Date, resourceId: string) => CalendarEvent[];
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
  onOpenStaffSelection?: (resourceId: string, resourceTitle: string, targetDate: Date) => void;
  dayWidth?: number;
  weeklyStaffOperations?: ReturnType<typeof useWeeklyStaffOperations>;
}

const TimeGrid: React.FC<TimeGridProps> = ({
  day,
  resources,
  events,
  getEventsForDayAndResource,
  onStaffDrop,
  onOpenStaffSelection,
  dayWidth = 800,
  weeklyStaffOperations
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

  // Calculate responsive column widths with better spacing
  const timeColumnWidth = 80; // Fixed width for time column
  const availableWidth = dayWidth - timeColumnWidth - 24; // Account for padding/margins
  const teamColumnWidth = Math.max(120, Math.floor(availableWidth / resources.length)); // Ensure minimum 120px per team

  // Calculate event position based on time
  const getEventPosition = (event: CalendarEvent) => {
    const startTime = new Date(event.start);
    const endTime = new Date(event.end);
    
    // Get hours and minutes as decimal
    const startHour = startTime.getHours() + startTime.getMinutes() / 60;
    const endHour = endTime.getHours() + endTime.getMinutes() / 60;
    
    // Calculate position from 5 AM (our grid starts at 5 AM)
    const gridStartHour = 5;
    const gridEndHour = 23;
    
    // Ensure event is within our time range
    const clampedStartHour = Math.max(gridStartHour, Math.min(gridEndHour, startHour));
    const clampedEndHour = Math.max(gridStartHour, Math.min(gridEndHour, endHour));
    
    // Calculate position in pixels (60px per hour)
    const top = (clampedStartHour - gridStartHour) * 60;
    const height = Math.max(30, (clampedEndHour - clampedStartHour) * 60);
    
    return { top, height };
  };

  console.log('TimeGrid: Width calculations', {
    dayWidth,
    timeColumnWidth,
    availableWidth,
    resourcesCount: resources.length,
    teamColumnWidth
  });

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
            width: `${teamColumnWidth}px`,
            minWidth: `${teamColumnWidth}px`
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
            width: `${teamColumnWidth}px`,
            minWidth: `${teamColumnWidth}px`
          }}
        >
          <StaffAssignmentArea
            day={day}
            resource={resource}
            events={getEventsForDayAndResource(day, resource.id)}
            onStaffDrop={onStaffDrop}
            onOpenStaffSelection={onOpenStaffSelection}
            timeSlots={[]}
            isHeaderRow={true}
            weeklyStaffOperations={weeklyStaffOperations}
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

      {/* Time Slot Columns with Events - below staff assignments */}
      {resources.map((resource, index) => {
        const resourceEvents = getEventsForDayAndResource(day, resource.id);
        
        return (
          <div 
            key={`timeslots-${resource.id}`} 
            className="time-slots-column"
            style={{ 
              gridColumn: index + 2,
              gridRow: 4,
              width: `${teamColumnWidth}px`,
              minWidth: `${teamColumnWidth}px`,
              position: 'relative'
            }}
          >
            {/* Time slots grid */}
            <div className="time-slots-grid">
              {timeSlots.map((slot) => (
                <div key={slot.time} className="time-slot-cell" />
              ))}
            </div>
            
            {/* Events positioned absolutely on top of time slots */}
            <div className="events-overlay" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              {resourceEvents.map((event) => {
                const position = getEventPosition(event);
                return (
                  <BookingEvent
                    key={event.id}
                    event={event}
                    style={{
                      top: `${position.top}px`,
                      height: `${position.height}px`,
                    }}
                    onClick={() => {
                      console.log('Event clicked:', event);
                      // TODO: Add event click handling (navigate to booking detail, etc.)
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TimeGrid;
