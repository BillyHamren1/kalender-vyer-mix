import React, { useState } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import CustomEvent from './CustomEvent';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import StaffItem from './StaffItem';
import TeamVisibilityControl from './TeamVisibilityControl';
import './TimeGrid.css';

interface TeamVisibilityProps {
  allTeams: Resource[];
  visibleTeams: string[];
  onToggleTeam: (teamId: string) => void;
}

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
  teamVisibilityProps?: TeamVisibilityProps;
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
  onEventResize,
  teamVisibilityProps
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
  // Live column (team-11) uses same width as TIME column for symmetry
  const timeColumnWidth = 80;
  const liveColumnWidth = 80; // Same as time column for symmetry
  const teamColumnWidth = 128;
  
  // Check if last resource is Live (team-11)
  const hasLiveColumn = resources.length > 0 && resources[resources.length - 1]?.id === 'team-11';
  const regularTeamCount = hasLiveColumn ? resources.length - 1 : resources.length;

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

  // Calculate grid template columns - Live column gets same width as TIME for symmetry
  const getGridTemplateColumns = () => {
    if (hasLiveColumn) {
      return `${timeColumnWidth}px repeat(${regularTeamCount}, ${teamColumnWidth}px) ${liveColumnWidth}px`;
    }
    return `${timeColumnWidth}px repeat(${resources.length}, ${teamColumnWidth}px)`;
  };

  // Calculate total width
  const getTotalWidth = () => {
    if (hasLiveColumn) {
      return timeColumnWidth + (regularTeamCount * teamColumnWidth) + liveColumnWidth;
    }
    return timeColumnWidth + (resources.length * teamColumnWidth);
  };

  // Get column width for a specific resource
  const getColumnWidth = (resourceId: string) => {
    return resourceId === 'team-11' ? liveColumnWidth : teamColumnWidth;
  };

  return (
    <div 
      className="time-grid-with-staff-header"
      style={{
        gridTemplateColumns: getGridTemplateColumns(),
        gridTemplateRows: 'auto auto auto 1fr',
        width: `${getTotalWidth()}px`
      }}
    >
        {/* Header row background (spans TIME + day header) */}
        <div className="time-grid-header-bg" style={{ gridColumn: '1 / -1', gridRow: 1 }} />

        {/* Time Column Header */}
        <div className="time-column-header">
          <div className="time-title">Time</div>
        </div>

        <div className="day-header-teams" style={{ 
          gridColumn: '2 / -1',
          width: `${getTotalWidth() - timeColumnWidth}px`,
          maxWidth: `${getTotalWidth() - timeColumnWidth}px`
        }}>
          <div className="day-header-content">
            <div style={{ width: '32px' }}></div>
            <span className="day-title">
              {format(day, 'EEE d')}
            </span>
            {teamVisibilityProps ? (
              <TeamVisibilityControl
                allTeams={teamVisibilityProps.allTeams}
                visibleTeams={teamVisibilityProps.visibleTeams}
                onToggleTeam={teamVisibilityProps.onToggleTeam}
                compact
              />
            ) : (
              <div style={{ width: '32px' }}></div>
            )}
          </div>
        </div>

        <div className="time-empty-cell" style={{ gridRow: 2 }}></div>

        {resources.map((resource, index) => {
          const assignedStaff = getAssignedStaffForTeam(resource.id);
          const isLiveColumn = resource.id === 'team-11';
          const columnWidth = getColumnWidth(resource.id);
          
          return (
            <div 
              key={`header-${resource.id}`}
              className={`team-header-cell ${isLiveColumn ? 'live-column-header' : ''}`}
              style={{ 
                gridColumn: index + 2,
                gridRow: 2,
                width: `${columnWidth}px`,
                minWidth: `${columnWidth}px`
              }}
            >
              <div className="team-header-content">
                <span className="team-title" title={resource.title}>{resource.title}</span>
                {!isLiveColumn && (
                  <button
                    className="add-staff-button-header"
                    onClick={(e) => handleStaffSelectionClick(resource.id, resource.title, e)}
                    title={`Assign staff to ${resource.title}`}
                  >
                    +
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <div className="staff-row-time-cell" style={{ gridRow: 3 }}></div>

        {resources.map((resource, index) => {
          const assignedStaff = getAssignedStaffForTeam(resource.id);
          const isLiveColumn = resource.id === 'team-11';
          const columnWidth = getColumnWidth(resource.id);
          
          return (
            <div 
              key={`staff-${resource.id}`}
              className={`staff-assignment-header-row ${isLiveColumn ? 'live-column-staff' : ''}`}
              style={{ 
                gridColumn: index + 2,
                gridRow: 3,
                width: `${columnWidth}px`,
                minWidth: `${columnWidth}px`
              }}
            >
              {!isLiveColumn && (
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
              )}
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
          const isLiveColumn = resource.id === 'team-11';
          const columnWidth = getColumnWidth(resource.id);
          
          console.log(`📅 TimeGrid rendering for ${format(day, 'yyyy-MM-dd')} team ${resource.id}:`, {
            totalEventsInProps: events.length,
            resourceEvents: resourceEvents.length,
            firstEvent: resourceEvents[0]
          });
          
          return (
            <SimpleTimeSlot key={`timeslots-${resource.id}`}>
              <div 
                className={`time-slots-column ${isLiveColumn ? 'live-column' : ''}`}
                style={{ 
                  gridColumn: index + 2,
                  gridRow: 4,
                  width: `${columnWidth}px`,
                  minWidth: `${columnWidth}px`,
                  position: 'relative'
                }}
              >
                {/* Time slots grid - continuous 24-hour */}
                <div className="time-slots-grid">
                  {timeSlots.map((slot) => (
                    <div key={slot.time} className="time-slot-cell">&nbsp;</div>
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
                      teamColumnWidth={columnWidth}
                      onEventClick={handleBookingEventClick}
                      onEventResize={onEventResize}
                    />
                  );
                })}
              </div>
            </SimpleTimeSlot>
          );
        })}

        {/* Footer row - same gradient as header */}
        <div className="time-grid-footer-bg" style={{ gridColumn: '1 / -1', gridRow: 5 }} />
    </div>
  );
};

export default TimeGrid;
