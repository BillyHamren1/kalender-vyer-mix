import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import BookingEvent from './BookingEvent';
import EventHoverCard from './EventHoverCard';
import CustomEvent from './CustomEvent';
import DragLayer from './DragLayer';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import { useDrag, useDrop } from 'react-dnd';
import UnifiedDraggableStaffItem from './UnifiedDraggableStaffItem';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/eventService';
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
  onEventResize?: (eventId: string, newStartTime: Date, newEndTime: Date) => Promise<void>;
}

// Enhanced Draggable Event Wrapper Component with performance optimization
const DraggableEvent: React.FC<{
  event: CalendarEvent;
  position: { top: number; height: number };
  teamColumnWidth: number;
  onEventClick: (event: CalendarEvent) => void;
  onEventResize?: (eventId: string, newStartTime: Date, newEndTime: Date) => Promise<void>;
}> = React.memo(({ event, position, teamColumnWidth, onEventClick, onEventResize }) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: `${position.top}px`,
        height: `${position.height}px`,
        left: '4px',
        right: '4px',
        zIndex: 25,
        pointerEvents: 'auto'
      }}
    >
      <CustomEvent
        event={event}
        resource={{ id: event.resourceId, title: '' } as Resource}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative'
        }}
        onEventResize={onEventResize}
      />
    </div>
  );
});

// Enhanced Droppable Time Slot Component with improved precision
const DroppableTimeSlot: React.FC<{
  resourceId: string;
  day: Date;
  timeSlot: string;
  onEventDrop?: (eventId: string, targetResourceId: string, targetDate: Date, targetTime: string) => Promise<void>;
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
  children: React.ReactNode;
}> = React.memo(({ resourceId, day, timeSlot, onEventDrop, onStaffDrop, children }) => {
  
  const elementRef = React.useRef<HTMLDivElement>(null);
  
  // Enhanced time calculation with 5-minute precision for smoother drops
  const getDropTime = (clientY: number) => {
    if (!elementRef.current) {
      console.warn('Element ref not available for time calculation');
      return '12:00';
    }
    
    const rect = elementRef.current.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    
    // Use consistent 25px per hour
    const pixelsPerHour = 25;
    const startHour = 5; // Grid starts at 5 AM
    
    // Calculate precise time with 5-minute granularity
    const totalHours = relativeY / pixelsPerHour;
    const targetHour = Math.max(5, Math.min(23, startHour + totalHours));
    
    // Round to nearest 5-minute interval for smoother drops
    const totalMinutes = targetHour * 60;
    const roundedMinutes = Math.round(totalMinutes / 5) * 5;
    
    const finalHour = Math.floor(roundedMinutes / 60);
    const finalMinutes = roundedMinutes % 60;
    
    return `${finalHour.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}`;
  };

  const [{ isOver, dragType }, drop] = useDrop({
    accept: ['calendar-event', 'STAFF'],
    drop: async (item: any, monitor) => {
      const clientOffset = monitor.getClientOffset();
      
      console.log('DroppableTimeSlot: Handling drop with enhanced precision', { 
        item, 
        resourceId, 
        day: format(day, 'yyyy-MM-dd'),
        eventId: item.eventId,
        staffId: item.id 
      });
      
      try {
        // Handle event drops with enhanced precision
        if (item.eventId && onEventDrop && clientOffset) {
          const targetTime = getDropTime(clientOffset.y);
          
          console.log('Moving event with enhanced precision:', {
            eventId: item.eventId,
            fromResource: item.resourceId,
            toResource: resourceId,
            targetTime,
            clientY: clientOffset.y,
            precision: '5-minute intervals'
          });
          
          await onEventDrop(item.eventId, resourceId, day, targetTime);
          toast.success('Event moved successfully');
        }
        // Handle staff drops
        else if (item.id && onStaffDrop) {
          console.log('Assigning staff', item.id, 'to resource', resourceId);
          await onStaffDrop(item.id, resourceId, day);
          toast.success('Staff assigned successfully');
        }
      } catch (error) {
        console.error('Error in drop operation:', error);
        toast.error(`Failed to complete operation: ${error.message || 'Unknown error'}`);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      dragType: monitor.getItemType(),
    }),
  });

  const combinedRef = (node: HTMLDivElement) => {
    elementRef.current = node;
    drop(node);
  };

  return (
    <div
      ref={combinedRef}
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
  onEventDrop,
  onEventResize
}) => {
  const { handleEventClick } = useEventNavigation();

  // Generate time slots from 05:00 to 23:00 with European 24-hour format
  const generateTimeSlots = () => {
    const timeSlots = [];
    for (let hour = 5; hour <= 23; hour++) {
      const time = hour.toString().padStart(2, '0') + ':00';
      const displayTime = time;
      timeSlots.push({ time, displayTime });
    }
    return timeSlots;
  };

  const timeSlots = generateTimeSlots();

  // Calculate responsive column widths with better spacing
  const timeColumnWidth = 80;
  const availableWidth = dayWidth - timeColumnWidth - 24;
  const teamColumnWidth = Math.max(120, Math.floor(availableWidth / resources.length));

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
    const height = Math.max(12, (clampedEndHour - clampedStartHour) * 25);
    
    return { top, height };
  };

  // Handle event click - format event data for navigation hook
  const handleBookingEventClick = (event: CalendarEvent) => {
    console.log('TimeGrid: Event clicked:', event);
    
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

  // Optimized event drop handler with improved precision
  const handleEventDropOptimized = async (
    eventId: string, 
    targetResourceId: string, 
    targetDate: Date, 
    targetTime: string
  ) => {
    try {
      console.log('TimeGrid: Handling optimized event drop with enhanced precision', {
        eventId,
        targetResourceId,
        targetDate: format(targetDate, 'yyyy-MM-dd'),
        targetTime,
        precision: '5-minute intervals'
      });

      const [hours, minutes] = targetTime.split(':').map(Number);
      const newStartTime = new Date(targetDate);
      newStartTime.setHours(hours, minutes, 0, 0);
      
      const originalEvent = events.find(e => e.id === eventId);
      if (!originalEvent) {
        throw new Error('Original event not found');
      }
      
      const originalStart = new Date(originalEvent.start);
      const originalEnd = new Date(originalEvent.end);
      const duration = originalEnd.getTime() - originalStart.getTime();
      
      const newEndTime = new Date(newStartTime.getTime() + duration);
      
      // Update immediately with enhanced precision
      await updateCalendarEvent(eventId, {
        start: newStartTime.toISOString(),
        end: newEndTime.toISOString(),
        resourceId: targetResourceId
      });

      console.log('Event updated successfully with 5-minute precision');
      
    } catch (error) {
      console.error('Error handling event drop:', error);
      throw error;
    }
  };

  return (
    <>
      {/* Add drag layer for smooth visual feedback */}
      <DragLayer />
      
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

        {/* Enhanced Time Slot Columns with improved precision */}
        {resources.map((resource, index) => {
          const resourceEvents = getEventsForDayAndResource(day, resource.id);
          
          return (
            <DroppableTimeSlot
              key={`timeslots-${resource.id}`}
              resourceId={resource.id}
              day={day}
              timeSlot="any"
              onEventDrop={handleEventDropOptimized}
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
                {/* Time slots grid with enhanced precision indicators */}
                <div className="time-slots-grid">
                  {timeSlots.map((slot) => (
                    <div key={slot.time} className="time-slot-cell" />
                  ))}
                </div>
                
                {/* Events positioned absolutely with enhanced precision */}
                {resourceEvents.map((event) => {
                  const position = getEventPosition(event);
                  return (
                    <DraggableEvent
                      key={`event-wrapper-${event.id}`}
                      event={event}
                      position={position}
                      teamColumnWidth={teamColumnWidth}
                      onEventClick={handleBookingEventClick}
                      onEventResize={onEventResize}
                    />
                  );
                })}
              </div>
            </DroppableTimeSlot>
          );
        })}
      </div>
    </>
  );
};

export default TimeGrid;
