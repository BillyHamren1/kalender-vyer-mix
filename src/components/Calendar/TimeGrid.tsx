import React, { useState } from 'react';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
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

// Enhanced Droppable Time Slot Component with corrected precision
const DroppableTimeSlot: React.FC<{
  resourceId: string;
  day: Date;
  timeSlot: string;
  onEventDrop?: (eventId: string, targetResourceId: string, targetDate: Date, targetTime: string) => Promise<void>;
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
  children: React.ReactNode;
  isLateHoursExpanded?: boolean;
}> = React.memo(({ resourceId, day, timeSlot, onEventDrop, onStaffDrop, children, isLateHoursExpanded = false }) => {
  
  const elementRef = React.useRef<HTMLDivElement>(null);
  
  // Fixed time calculation with collapsible late hours support
  const getDropTime = (clientY: number, isLateExpanded: boolean) => {
    if (!elementRef.current) {
      console.warn('Element ref not available for time calculation');
      return '12:00';
    }
    
    const rect = elementRef.current.getBoundingClientRect();
    const parentScroll = elementRef.current.parentElement?.scrollTop || 0;
    
    // Account for any scroll offset
    const relativeY = clientY - rect.top + parentScroll;
    
    // Use consistent 25px per hour to match visual rendering
    const pixelsPerHour = 25;
    const startHour = 5; // Always start from 05:00
    
    // Calculate time from pixel position
    const hoursFromStart = Math.max(0, relativeY) / pixelsPerHour;
    const totalMinutes = (startHour * 60) + (hoursFromStart * 60);
    
    // Round to nearest 5-minute interval
    const roundedMinutes = Math.round(totalMinutes / 5) * 5;
    
    const finalHour = Math.floor(roundedMinutes / 60);
    const finalMinutes = roundedMinutes % 60;
    
    // Extended range: 00:00 to 28:55 (04:55 next day) when late hours are expanded
    const maxHour = isLateExpanded ? 28 : 23;
    const clampedHour = Math.max(0, Math.min(maxHour, finalHour));
    const clampedMinutes = clampedHour === maxHour ? Math.min(55, finalMinutes) : finalMinutes;
    
    const calculatedTime = `${clampedHour.toString().padStart(2, '0')}:${clampedMinutes.toString().padStart(2, '0')}`;
    
    return calculatedTime;
  };

  const [{ isOver, dragType }, drop] = useDrop({
    accept: ['calendar-event', 'STAFF'],
    drop: async (item: any, monitor) => {
      const clientOffset = monitor.getClientOffset();
      
      console.log('DroppableTimeSlot: Handling drop with corrected precision', { 
        item, 
        resourceId, 
        day: format(day, 'yyyy-MM-dd'),
        eventId: item.eventId,
        staffId: item.id 
      });
      
      try {
        // Handle event drops with corrected precision
        if (item.eventId && onEventDrop && clientOffset) {
          const targetTime = getDropTime(clientOffset.y, isLateHoursExpanded);
          
          console.log('Moving event with corrected precision:', {
            eventId: item.eventId,
            fromResource: item.resourceId,
            toResource: resourceId,
            targetTime,
            clientY: clientOffset.y,
            isLateHoursExpanded,
            precision: '5-minute intervals with collapsible late hours support'
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
  const [isLateHoursExpanded, setIsLateHoursExpanded] = useState(false);

  // Generate regular hours (05:00-23:00) and late hours (24:00-28:00, representing next day 00:00-04:00)
  const generateTimeSlots = () => {
    const regularSlots = [];
    const lateSlots = [];
    
    // Regular hours: 05:00 to 23:00
    for (let hour = 5; hour <= 23; hour++) {
      const time = hour.toString().padStart(2, '0') + ':00';
      regularSlots.push({ time, displayTime: time });
    }
    
    // Late hours: 24:00-28:00 (00:00-04:00 next day)
    for (let hour = 24; hour < 29; hour++) {
      const displayHour = hour - 24;
      const time = hour.toString();
      const displayTime = displayHour.toString().padStart(2, '0') + ':00';
      lateSlots.push({ time, displayTime });
    }
    
    return { regularSlots, lateSlots };
  };

  const { regularSlots, lateSlots } = generateTimeSlots();

  // Calculate responsive column widths with better spacing
  const timeColumnWidth = 80;
  const availableWidth = dayWidth - timeColumnWidth - 24;
  const teamColumnWidth = Math.max(120, Math.floor(availableWidth / resources.length));

  // Calculate event position based on time - Updated for collapsible early and late hours
  const getEventPosition = (event: CalendarEvent) => {
    const startTime = new Date(event.start);
    const endTime = new Date(event.end);
    
    // Get hours and minutes as decimal
    let startHour = startTime.getHours() + startTime.getMinutes() / 60;
    let endHour = endTime.getHours() + endTime.getMinutes() / 60;
    
    // Handle events that span into next day (convert to 24+ hour format)
    if (endHour < startHour) {
      endHour += 24;
    }
    
    // Calculate position from midnight (00:00) with support for hours beyond 23
    const gridStartHour = 0;
    const gridEndHour = 28; // Extended to support late hours
    
    // Calculate position in pixels (25px per hour)
    // Offset by 5 hours since we start from 05:00
    let top = (startHour - 5) * 25;
    
    // If event is in late hours (24:00+) and they're collapsed, hide it
    if (startHour >= 24 && !isLateHoursExpanded) {
      return null;
    }
    
    const height = Math.max(12, (endHour - startHour) * 25);
    
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
    const staff = weeklyStaffOperations.getStaffForTeamAndDate(teamId, day);
    // Ensure we always return an array
    return Array.isArray(staff) ? staff : [];
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
          {/* Regular hours labels */}
          {regularSlots.map((slot) => (
            <div key={slot.time} className="time-label-slot">
              {slot.displayTime}
            </div>
          ))}
          
          {/* Late hours section - collapsible with enhanced styling */}
          <Collapsible open={isLateHoursExpanded} onOpenChange={setIsLateHoursExpanded}>
            <CollapsibleTrigger asChild>
              <button 
                className="late-hours-trigger"
                style={{
                  width: '100%',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, hsl(var(--primary) / 0.1), hsl(var(--primary) / 0.05))',
                  border: '2px solid hsl(var(--primary) / 0.3)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: 'hsl(var(--primary))',
                  marginTop: '12px',
                  marginBottom: '4px',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 2px 4px hsl(var(--primary) / 0.1)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.08))';
                  e.currentTarget.style.borderColor = 'hsl(var(--primary) / 0.5)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 8px hsl(var(--primary) / 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, hsl(var(--primary) / 0.1), hsl(var(--primary) / 0.05))';
                  e.currentTarget.style.borderColor = 'hsl(var(--primary) / 0.3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 4px hsl(var(--primary) / 0.1)';
                }}
              >
                {isLateHoursExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span>{isLateHoursExpanded ? 'Hide' : 'Show'} Next Day Hours</span>
                <span className="text-[11px] font-bold bg-primary/20 px-2 py-0.5 rounded-full">
                  00-04
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {lateSlots.map((slot, index) => (
                <div 
                  key={slot.time} 
                  className="time-label-slot"
                  style={{
                    background: 'hsl(var(--primary) / 0.05)',
                    borderLeft: '3px solid hsl(var(--primary) / 0.3)'
                  }}
                >
                  {slot.displayTime}
                  {index === 0 && <span className="ml-2 text-[10px] font-bold text-primary">+1 day</span>}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
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
              isLateHoursExpanded={isLateHoursExpanded}
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
                  {/* Regular hours slots */}
                  {regularSlots.map((slot) => (
                    <div key={slot.time} className="time-slot-cell" />
                  ))}
                  
                  {/* Late hours trigger placeholder */}
                  <div style={{ height: '52px', marginTop: '12px', marginBottom: '4px' }} />
                  
                  {/* Late hours slots */}
                  {isLateHoursExpanded && lateSlots.map((slot) => (
                    <div 
                      key={slot.time} 
                      className="time-slot-cell"
                      style={{
                        background: 'hsl(var(--primary) / 0.02)',
                        borderLeft: '2px solid hsl(var(--primary) / 0.2)'
                      }}
                    />
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
