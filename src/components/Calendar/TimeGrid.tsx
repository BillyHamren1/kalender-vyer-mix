import React, { useState } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import CustomEvent from './CustomEvent';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import StaffItem from './StaffItem';
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
  onEventResize?: () => Promise<void>;
}

// Event Wrapper Component
const EventWrapper: React.FC<{
  event: CalendarEvent;
  position: { top: number; height: number };
  teamColumnWidth: number;
  onEventClick: (event: CalendarEvent) => void;
  onEventResize?: () => Promise<void>;
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

// Simple Time Slot Component - no drag-and-drop
const SimpleTimeSlot: React.FC<{
  children: React.ReactNode;
}> = React.memo(({ children }) => {
  return (
    <div
      className="time-slots-column hover-container"
      style={{ 
        width: `100%`,
        minWidth: `100%`,
        position: 'relative'
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
  onEventResize
}) => {
  const { handleEventClick } = useEventNavigation();
  // Generate continuous 24-hour time slots from 05:00 to 05:00 (next day)
  const generateTimeSlots = () => {
    const slots = [];
    
    // Hours 05:00 to 23:00
    for (let hour = 5; hour <= 23; hour++) {
      const time = hour.toString().padStart(2, '0') + ':00';
      slots.push({ time, displayTime: time });
    }
    
    // Hours 24:00-28:00 (displayed as 00:00-04:00 next day)
    for (let hour = 24; hour < 29; hour++) {
      const displayHour = hour - 24;
      const time = hour.toString();
      const displayTime = displayHour.toString().padStart(2, '0') + ':00';
      slots.push({ time, displayTime });
    }
    
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // Fixed column width for team columns (3x larger)
  const timeColumnWidth = 80;
  const teamColumnWidth = 128;

  // Calculate event position based on time - Continuous 24-hour grid
  const getEventPosition = (event: CalendarEvent) => {
    const startTime = new Date(event.start);
    const endTime = new Date(event.end);
    
    console.log('🔍 Event Duration Debug:', {
      eventId: event.id,
      bookingNumber: event.booking_number,
      rawStart: event.start,
      rawEnd: event.end,
      parsedStart: startTime.toISOString(),
      parsedEnd: endTime.toISOString()
    });
    
    // CRITICAL: Use UTC hours, not local hours!
    let startHour = startTime.getUTCHours() + startTime.getUTCMinutes() / 60;
    let endHour = endTime.getUTCHours() + endTime.getUTCMinutes() / 60;
    
    console.log('🔍 Calculated hours (UTC):', { startHour, endHour, duration: endHour - startHour });
    
    // Handle events that span into next day (convert to 24+ hour format)
    if (endHour < startHour) {
      endHour += 24;
      console.log('🔍 Event spans midnight, adjusted endHour:', endHour);
    }
    
    // Calculate position in pixels (25px per hour)
    // Offset by 5 hours since we start from 05:00
    let top = (startHour - 5) * 25;
    
    const height = Math.max(12, (endHour - startHour) * 25);
    
    console.log('🔍 Final position:', { top, height, duration: endHour - startHour });
    
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

  // Event drop handler removed - using click-based event marking system instead

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

        <div className="day-header-teams" style={{ 
          gridColumn: '2 / -1',
          width: `${teamColumnWidth * resources.length}px`,
          maxWidth: `${teamColumnWidth * resources.length}px`
        }}>
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
                <div className="assigned-staff-header-list">
                  {assignedStaff.map((staff) => (
                    <StaffItem
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
          );
        })}

        <div className="time-labels-column" style={{ gridRow: 4 }}>
          {/* Continuous 24-hour time labels from 05:00 to 05:00 (next day) */}
          {timeSlots.map((slot) => (
            <div key={slot.time} className="time-label-slot">
              {slot.displayTime}
            </div>
          ))}
        </div>

        {/* Simplified Time Slot Columns */}
        {resources.map((resource, index) => {
          const resourceEvents = getEventsForDayAndResource(day, resource.id);
          
          console.log(`📅 TimeGrid rendering for ${format(day, 'yyyy-MM-dd')} team ${resource.id}:`, {
            totalEventsInProps: events.length,
            resourceEvents: resourceEvents.length,
            firstEvent: resourceEvents[0]
          });
          
          return (
            <SimpleTimeSlot key={`timeslots-${resource.id}`}>
              <div 
                className="time-slots-column"
                style={{ 
                  gridColumn: index + 2,
                  gridRow: 4,
                  width: `${teamColumnWidth}px`,
                  minWidth: `${teamColumnWidth}px`,
                  position: 'relative'
                }}
              >
                {/* Time slots grid - continuous 24-hour */}
                <div className="time-slots-grid">
                  {timeSlots.map((slot) => (
                    <div key={slot.time} className="time-slot-cell" />
                  ))}
                </div>
                
                {/* Events positioned absolutely with enhanced precision */}
                {resourceEvents.map((event) => {
                  const position = getEventPosition(event);
                  return (
                    <EventWrapper
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
            </SimpleTimeSlot>
          );
        })}
    </div>
  );
};

export default TimeGrid;
