
import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import BookingEvent from './BookingEvent';
import EventHoverCard from './EventHoverCard';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import { useDrag, useDrop } from 'react-dnd';
import UnifiedDraggableStaffItem from './UnifiedDraggableStaffItem';
import { toast } from 'sonner';
import './TimeGrid.css';

interface TimeGridProps {
  day: Date;
  resources: Resource[];
  events: CalendarEvent[];
  getEventsForDayAndResource: (date: Date, resourceId: string) => CalendarEvent[];
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
  onOpenStaffSelection?: (resourceId: string, resourceTitle: string, targetDate: Date, buttonElement?: HTMLElement) => void;
  dayWidth?: number;
  weeklyStaffOperations?: {
    getStaffForTeamAndDate: (teamId: string, date: Date) => Array<{id: string, name: string, color?: string}>;
  };
  onEventDrop?: (eventId: string, targetResourceId: string, targetDate: Date, targetTime: string) => Promise<void>;
}

// Enhanced Draggable Event Wrapper Component with standardized drag data
const DraggableEvent: React.FC<{
  event: CalendarEvent;
  position: { top: number; height: number };
  teamColumnWidth: number;
  onEventClick: (event: CalendarEvent) => void;
}> = React.memo(({ event, position, teamColumnWidth, onEventClick }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'calendar-event',
    item: { 
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
        cursor: isDragging ? 'grabbing' : 'grab',
        border: isDragging ? '2px dashed #3b82f6' : 'none',
        transform: isDragging ? 'rotate(1deg) scale(1.02)' : 'none',
        transition: 'all 0.2s ease'
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
});

// Enhanced Droppable Time Slot Component with better error handling
const DroppableTimeSlot: React.FC<{
  resourceId: string;
  day: Date;
  timeSlot: string;
  onEventDrop?: (eventId: string, targetResourceId: string, targetDate: Date, targetTime: string) => Promise<void>;
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
  children: React.ReactNode;
}> = React.memo(({ resourceId, day, timeSlot, onEventDrop, onStaffDrop, children }) => {
  const [{ isOver, dragType }, drop] = useDrop({
    accept: ['calendar-event', 'STAFF'],
    drop: async (item: any) => {
      console.log('DroppableTimeSlot: Handling drop', { item, resourceId, day: format(day, 'yyyy-MM-dd') });
      
      try {
        // Handle event drops with standardized data structure
        if (item.eventId && onEventDrop) {
          // Only process if moving to a different resource
          if (item.resourceId !== resourceId) {
            console.log('Moving event', item.eventId, 'from', item.resourceId, 'to', resourceId);
            await onEventDrop(item.eventId, resourceId, day, timeSlot);
            toast.success('Event moved successfully');
          } else {
            console.log('Event dropped on same resource, no action needed');
          }
        }
        // Handle staff drops
        else if (item.id && onStaffDrop) {
          console.log('Assigning staff', item.id, 'to resource', resourceId);
          await onStaffDrop(item.id, resourceId, day);
          toast.success('Staff assigned successfully');
        }
      } catch (error) {
        console.error('Error in drop operation:', error);
        toast.error('Failed to complete operation. Please try again.');
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      dragType: monitor.getItemType(),
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
        backgroundColor: isOver ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
        border: isOver ? '2px dashed #3b82f6' : '2px solid transparent',
        transition: 'all 0.2s ease'
      }}
    >
      {children}
    </div>
  );
});

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

  const getAssignedStaffForTeam = (teamId: string) => {
    if (!weeklyStaffOperations) return [];
    return weeklyStaffOperations.getStaffForTeamAndDate(teamId, day) || [];
  };

  const handleStaffSelectionClick = (resourceId: string, resourceTitle: string, event: React.MouseEvent<HTMLButtonElement>) => {
    console.log('TimeGrid: Opening staff selection for', { resourceId, resourceTitle, day });
    if (onOpenStaffSelection) {
      onOpenStaffSelection(resourceId, resourceTitle, day, event.currentTarget);
    }
  };

  const handleStaffRemoval = async (staffId: string, teamId: string) => {
    if (onStaffDrop) {
      await onStaffDrop(staffId, null, day);
    }
  };

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

      <div className="day-header-teams" style={{ gridColumn: '2 / -1' }}>
        <div className="day-title">
          {format(day, 'EEE d')}
        </div>
      </div>

      <div className="time-empty-cell" style={{ gridRow: 2 }}></div>

      {resources.map((resource, index) => {
        const assignedStaff = getAssignedStaffForTeam(resource.id);
        
        return (
          <div 
            key={`header-${resource.id}`}
            className="team-header-cell"
            style={{ 
              gridColumn: index + 2,
              gridRow: 2,
              width: `${teamColumnWidth}px`,
              minWidth: `${teamColumnWidth}px`
            }}
          >
            <div className="team-header-content">
              <span className="team-title" title={resource.title}>{resource.title}</span>
              <button
                className="add-staff-button-header"
                onClick={(e) => handleStaffSelectionClick(resource.id, resource.title, e)}
                title={`Assign staff to ${resource.title}`}
              >
                +
              </button>
            </div>
          </div>
        );
      })}

      <div className="staff-row-time-cell" style={{ gridRow: 3 }}></div>

      {resources.map((resource, index) => {
        const assignedStaff = getAssignedStaffForTeam(resource.id);
        
        return (
          <DroppableTimeSlot
            key={`staff-${resource.id}`}
            resourceId={resource.id}
            day={day}
            timeSlot="staff-assignment"
            onStaffDrop={onStaffDrop}
          >
            <div 
              className="staff-assignment-header-row"
              style={{ 
                gridColumn: index + 2,
                gridRow: 3,
                width: `${teamColumnWidth}px`,
                minWidth: `${teamColumnWidth}px`
              }}
            >
              <div className="staff-header-assignment-area">
                <div className="assigned-staff-header-list">
                  {assignedStaff.map((staff) => (
                    <UnifiedDraggableStaffItem
                      key={staff.id}
                      staff={staff}
                      onRemove={() => handleStaffRemoval(staff.id, resource.id)}
                      currentDate={day}
                      teamName={resource.title}
                      variant="compact"
                      showRemoveDialog={true}
                    />
                  ))}
                </div>
              </div>
            </div>
          </DroppableTimeSlot>
        );
      })}

      <div className="time-labels-column" style={{ gridRow: 4 }}>
        {timeSlots.map((slot) => (
          <div key={slot.time} className="time-label-slot">
            {slot.displayTime}
          </div>
        ))}
      </div>

      {/* Enhanced Time Slot Columns with improved drag & drop */}
      {resources.map((resource, index) => {
        const resourceEvents = getEventsForDayAndResource(day, resource.id);
        
        return (
          <DroppableTimeSlot
            key={`timeslots-${resource.id}`}
            resourceId={resource.id}
            day={day}
            timeSlot="any"
            onEventDrop={onEventDrop}
            onStaffDrop={onStaffDrop}
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
              
              {/* Events positioned absolutely on top of time slots with enhanced dragging */}
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
