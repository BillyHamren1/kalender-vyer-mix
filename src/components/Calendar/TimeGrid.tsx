import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import BookingEvent from './BookingEvent';
import EventHoverCard from './EventHoverCard';
import { useWeeklyStaffOperations } from '@/hooks/useWeeklyStaffOperations';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import { useDrag, useDrop } from 'react-dnd';
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
  onEventDrop?: (eventId: string, targetResourceId: string, targetDate: Date, targetTime: string) => Promise<void>;
}

// Draggable Event Wrapper Component
const DraggableEvent: React.FC<{
  event: CalendarEvent;
  position: { top: number; height: number };
  teamColumnWidth: number;
  onEventClick: (event: CalendarEvent) => void;
}> = ({ event, position, teamColumnWidth, onEventClick }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'calendar-event',
    item: { 
      id: event.id,
      eventId: event.id,
      resourceId: event.resourceId,
      originalEvent: event
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  return (
    <div
      ref={drag}
      style={{
        position: 'absolute',
        top: `${position.top}px`,
        height: `${position.height}px`,
        left: '4px',
        right: '4px',
        zIndex: isDragging ? 30 : 25,
        pointerEvents: 'auto',
        opacity: isDragging ? 0.5 : 1,
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
    >
      <EventHoverCard event={event}>
        <BookingEvent
          event={event}
          style={{
            width: '100%',
            height: '100%',
            position: 'relative'
          }}
          onClick={() => onEventClick(event)}
        />
      </EventHoverCard>
    </div>
  );
};

// Droppable Time Slot Component
const DroppableTimeSlot: React.FC<{
  resourceId: string;
  day: Date;
  timeSlot: string;
  onEventDrop?: (eventId: string, targetResourceId: string, targetDate: Date, targetTime: string) => Promise<void>;
  children: React.ReactNode;
}> = ({ resourceId, day, timeSlot, onEventDrop, children }) => {
  const [{ isOver }, drop] = useDrop({
    accept: 'calendar-event',
    drop: async (item: any) => {
      if (onEventDrop && item.eventId && item.resourceId !== resourceId) {
        console.log('Dropping event:', {
          eventId: item.eventId,
          fromResource: item.resourceId,
          toResource: resourceId,
          targetDate: day,
          targetTime: timeSlot
        });
        
        try {
          await onEventDrop(item.eventId, resourceId, day, timeSlot);
        } catch (error) {
          console.error('Error dropping event:', error);
        }
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  return (
    <div
      ref={drop}
      className={`time-slots-column hover-container ${isOver ? 'drop-over' : ''}`}
      style={{ 
        width: `100%`,
        minWidth: `100%`,
        position: 'relative',
        backgroundColor: isOver ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
      }}
    >
      {children}
    </div>
  );
};

const TimeGrid: React.FC<TimeGridProps> = ({
  day,
  resources,
  events,
  getEventsForDayAndResource,
  onStaffDrop,
  onOpenStaffSelection,
  dayWidth = 800,
  weeklyStaffOperations,
  onEventDrop
}) => {
  // Use the event navigation hook for handling event clicks
  const { handleEventClick } = useEventNavigation();

  // Generate time slots from 05:00 to 23:00 with European 24-hour format
  const generateTimeSlots = () => {
    const timeSlots = [];
    for (let hour = 5; hour <= 23; hour++) {
      const time = hour.toString().padStart(2, '0') + ':00';
      const displayTime = time; // Use 24-hour format directly (e.g., "05:00", "13:00", "23:00")
      timeSlots.push({ time, displayTime });
    }
    return timeSlots;
  };

  const timeSlots = generateTimeSlots();

  // Calculate responsive column widths with better spacing
  const timeColumnWidth = 80; // Fixed width for time column
  const availableWidth = dayWidth - timeColumnWidth - 24; // Account for padding/margins
  const teamColumnWidth = Math.max(120, Math.floor(availableWidth / resources.length)); // Ensure minimum 120px per team

  // Calculate event position based on time - Updated for 25px rows
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
    
    // Calculate position in pixels (25px per hour instead of 15px for better visibility)
    const top = (clampedStartHour - gridStartHour) * 25;
    const height = Math.max(12, (clampedEndHour - clampedStartHour) * 25); // Minimum height increased to 12px
    
    return { top, height };
  };

  // Handle event click - format event data for navigation hook
  const handleBookingEventClick = (event: CalendarEvent) => {
    console.log('TimeGrid: Event clicked:', event);
    
    // Format the event data to match what useEventNavigation expects
    const formattedEventInfo = {
      event: {
        id: event.id,
        title: event.title,
        start: new Date(event.start),
        extendedProps: {
          bookingId: event.bookingId,
          resourceId: event.resourceId
        }
      }
    };
    
    console.log('TimeGrid: Formatted event for navigation:', formattedEventInfo);
    handleEventClick(formattedEventInfo);
  };

  // Get assigned staff for a team on this day - FIXED: Use correct function name
  const getAssignedStaffForTeam = (teamId: string) => {
    if (!weeklyStaffOperations) return [];
    return weeklyStaffOperations.getStaffForTeamAndDate(teamId, day) || [];
  };

  // Handle staff selection button click
  const handleStaffSelectionClick = (resourceId: string, resourceTitle: string) => {
    console.log('TimeGrid: Opening staff selection for', { resourceId, resourceTitle, day });
    if (onOpenStaffSelection) {
      onOpenStaffSelection(resourceId, resourceTitle, day);
    }
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
      {resources.map((resource, index) => {
        const assignedStaff = getAssignedStaffForTeam(resource.id);
        
        return (
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
                onClick={() => handleStaffSelectionClick(resource.id, resource.title)}
                title={`Assign staff to ${resource.title}`}
              >
                +
              </button>
            </div>
          </div>
        );
      })}

      {/* Empty cell for staff assignment row alignment */}
      <div className="staff-row-time-cell" style={{ gridRow: 3 }}></div>

      {/* Staff Assignment Display Row - shows assigned staff count and names */}
      {resources.map((resource, index) => {
        const assignedStaff = getAssignedStaffForTeam(resource.id);
        
        return (
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
            <div className="staff-header-assignment-area">
              <div className="staff-count-info">
                {assignedStaff.length} staff
              </div>
              <div className="assigned-staff-header-list">
                {assignedStaff.map((staff) => (
                  <div key={staff.id} className="staff-header-item">
                    <div 
                      className="text-xs px-1 py-0.5 bg-blue-100 text-blue-800 rounded"
                      title={staff.name}
                    >
                      {staff.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {/* Time Labels Column */}
      <div className="time-labels-column" style={{ gridRow: 4 }}>
        {timeSlots.map((slot) => (
          <div key={slot.time} className="time-label-slot">
            {slot.displayTime}
          </div>
        ))}
      </div>

      {/* Time Slot Columns with Events - NOW WITH DRAG & DROP */}
      {resources.map((resource, index) => {
        const resourceEvents = getEventsForDayAndResource(day, resource.id);
        
        return (
          <DroppableTimeSlot
            key={`timeslots-${resource.id}`}
            resourceId={resource.id}
            day={day}
            timeSlot="any" // We can make this more specific if needed
            onEventDrop={onEventDrop}
          >
            <div 
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
              
              {/* Events positioned absolutely on top of time slots - NOW DRAGGABLE */}
              {resourceEvents.map((event) => {
                const position = getEventPosition(event);
                return (
                  <DraggableEvent
                    key={`event-wrapper-${event.id}`}
                    event={event}
                    position={position}
                    teamColumnWidth={teamColumnWidth}
                    onEventClick={handleBookingEventClick}
                  />
                );
              })}
            </div>
          </DroppableTimeSlot>
        );
      })}
    </div>
  );
};

export default TimeGrid;
