import React, { useState } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import CustomEvent from './CustomEvent';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import StaffItem from './StaffItem';
import TeamVisibilityControl from './TeamVisibilityControl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './TimeGrid.css';

interface TeamVisibilityProps {
  allTeams: Resource[];
  visibleTeams: string[];
  onToggleTeam: (teamId: string) => void;
}

interface AvailableStaffMember {
  id: string;
  name: string;
  color?: string;
  assignedTeamId?: string;
  assignedTeamName?: string;
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
  variant?: 'default' | 'warehouse';
  isEventReadOnly?: (event: CalendarEvent) => boolean;
  onEventClick?: (event: CalendarEvent) => void;
  fullWidth?: boolean;
  availableStaff?: AvailableStaffMember[];
  carouselNav?: {
    onNavigateLeft: () => void;
    onNavigateRight: () => void;
  };
}

// Event Wrapper Component
const EventWrapper: React.FC<{
  event: CalendarEvent;
  position: { top: number; height: number };
  teamColumnWidth: number;
  onEventClick: (event: CalendarEvent) => void;
  onEventResize?: () => Promise<void>;
  readOnly?: boolean;
}> = React.memo(({ event, position, teamColumnWidth, onEventClick, onEventResize, readOnly }) => {
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
        readOnly={readOnly}
      />
    </div>
  );
});

// Simple Time Slot Component - no drag-and-drop
const SimpleTimeSlot: React.FC<{
  children: React.ReactNode;
  isLast?: boolean;
}> = React.memo(({ children, isLast }) => {
  return (
    <div
      className={`time-slot-wrapper ${isLast ? 'is-last' : ''}`}
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
  teamVisibilityProps,
  variant = 'default',
  isEventReadOnly,
  onEventClick,
  fullWidth = false,
  availableStaff = [],
  carouselNav
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

  // Fixed column widths
  const timeColumnWidth = 80;
  const availableColumnWidth = 60; // Narrower column for available staff
  const teamColumnWidth = 73;

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

  // Handle event click - format event data for navigation hook OR use custom handler
  const handleBookingEventClick = (event: CalendarEvent) => {
    console.log('TimeGrid: Event clicked:', event);
    
    // If a custom onEventClick handler is provided, use that instead
    if (onEventClick) {
      onEventClick(event);
      return;
    }
    
    // Otherwise, use the default navigation behavior
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

  // Calculate grid template columns - includes available staff column
  const getGridTemplateColumns = () => {
    if (fullWidth) {
      // In full width mode, use flexible columns with available staff column
      return `${timeColumnWidth}px ${availableColumnWidth}px repeat(${resources.length}, 1fr)`;
    }
    return `${timeColumnWidth}px ${availableColumnWidth}px repeat(${resources.length}, ${teamColumnWidth}px)`;
  };

  // Calculate total width
  const getTotalWidth = () => {
    if (fullWidth) {
      return '100%';
    }
    return `${timeColumnWidth + availableColumnWidth + (resources.length * teamColumnWidth)}px`;
  };

  // Get unassigned available staff (not assigned to any team today)
  const getUnassignedAvailableStaff = () => {
    if (!availableStaff || availableStaff.length === 0) return [];
    return availableStaff.filter(staff => !staff.assignedTeamId);
  };

  return (
    <div 
      className={`time-grid-with-staff-header ${variant === 'warehouse' ? 'warehouse-theme' : ''}`}
      style={{
        gridTemplateColumns: getGridTemplateColumns(),
        gridTemplateRows: 'auto auto auto 1fr',
        width: getTotalWidth()
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
          width: fullWidth ? 'auto' : `${availableColumnWidth + (resources.length * teamColumnWidth)}px`,
          maxWidth: fullWidth ? 'none' : `${availableColumnWidth + (resources.length * teamColumnWidth)}px`
        }}>
          <div className="day-header-content">
            {/* Left nav arrow - only if carouselNav provided */}
            {carouselNav ? (
              <button
                className="carousel-header-nav nav-left"
                onClick={carouselNav.onNavigateLeft}
                aria-label="Föregående dag"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : (
              <div style={{ width: '32px' }}></div>
            )}
            <span className="day-title">
              {format(day, 'EEE d')}
            </span>
            <div className="flex items-center gap-1">
              {teamVisibilityProps && (
                <TeamVisibilityControl
                  allTeams={teamVisibilityProps.allTeams}
                  visibleTeams={teamVisibilityProps.visibleTeams}
                  onToggleTeam={teamVisibilityProps.onToggleTeam}
                  compact
                />
              )}
              {/* Right nav arrow - only if carouselNav provided */}
              {carouselNav ? (
                <button
                  className="carousel-header-nav nav-right"
                  onClick={carouselNav.onNavigateRight}
                  aria-label="Nästa dag"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              ) : (
                !teamVisibilityProps && <div style={{ width: '32px' }}></div>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Available Staff Header + Team Headers */}
        <div className="time-empty-cell" style={{ gridRow: 2, gridColumn: 1 }}></div>
        
        {/* Available Staff Header */}
        <div 
          className="team-header-cell available-staff-header"
          style={{ 
            gridColumn: 2,
            gridRow: 2,
            width: fullWidth ? 'auto' : `${availableColumnWidth}px`,
            minWidth: `${availableColumnWidth}px`
          }}
        >
          <div className="team-header-content">
            <span className="team-title" style={{ whiteSpace: 'nowrap' }}>Personal</span>
          </div>
        </div>

        {resources.map((resource, index) => {
          return (
            <div 
              key={`header-${resource.id}`}
              className="team-header-cell cursor-pointer"
              style={{ 
                gridColumn: index + 3,
                gridRow: 2,
                width: fullWidth ? 'auto' : `${teamColumnWidth}px`,
                minWidth: fullWidth ? '120px' : `${teamColumnWidth}px`
              }}
              onClick={(e) => handleStaffSelectionClick(resource.id, resource.title, e as unknown as React.MouseEvent<HTMLButtonElement>)}
              title={`Assign staff to ${resource.title}`}
            >
              <div className="team-header-content">
                <span className="team-title">{resource.title}</span>
                <button
                  className="add-staff-button-header"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStaffSelectionClick(resource.id, resource.title, e);
                  }}
                  title={`Assign staff to ${resource.title}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}

        {/* Row 3: Available Staff List + Staff Assignment Areas */}
        <div className="staff-row-time-cell" style={{ gridRow: 3, gridColumn: 1 }}></div>
        
        {/* Available Staff Column - fully open, no height limit */}
        <div 
          className="available-staff-open-column"
          style={{ 
            gridColumn: 2,
            gridRow: 3,
            width: fullWidth ? 'auto' : `${availableColumnWidth}px`,
            minWidth: `${availableColumnWidth}px`,
            background: 'linear-gradient(180deg, hsl(var(--muted) / 0.5) 0%, hsl(var(--muted) / 0.3) 100%)',
            borderRight: '1px solid hsl(var(--foreground) / 0.2)',
            borderBottom: '1px solid hsl(var(--border) / 0.6)',
            padding: '3px 4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}
        >
          {getUnassignedAvailableStaff().map((staff) => {
            const firstName = staff.name.trim().split(' ')[0];
            return (
              <div 
                key={staff.id}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
                style={{ 
                  backgroundColor: staff.color || 'hsl(var(--muted))',
                  color: '#000'
                }}
                title={staff.name}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 flex-shrink-0"></span>
                <span>{firstName}</span>
              </div>
            );
          })}
          {getUnassignedAvailableStaff().length === 0 && (
            <span className="text-[9px] text-muted-foreground/60 italic text-center">Inga</span>
          )}
        </div>
        {resources.map((resource, index) => {
          const assignedStaff = getAssignedStaffForTeam(resource.id);
          
          return (
            <div 
              key={`staff-${resource.id}`}
              className="staff-assignment-header-row"
              style={{ 
                gridColumn: index + 3,
                gridRow: 3,
                width: fullWidth ? 'auto' : `${teamColumnWidth}px`,
                minWidth: fullWidth ? '120px' : `${teamColumnWidth}px`
              }}
            >
              <div className="staff-header-assignment-area">
                <div className="assigned-staff-header-list">
                  {assignedStaff.map((staff) => (
                    <StaffItem
                      key={staff.id}
                      staff={{
                        id: staff.id,
                        name: staff.name,
                        color: staff.color,
                        assignedTeam: resource.id
                      }}
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

        <div className="time-labels-column" style={{ gridRow: 4, gridColumn: 1 }}>
          {/* Continuous 24-hour time labels from 05:00 to 05:00 (next day) */}
          {timeSlots.map((slot) => (
            <div key={slot.time} className="time-label-slot">
              {slot.displayTime}
            </div>
          ))}
        </div>

        {/* Empty column under "Tillgängliga" header */}
        <div 
          className="time-slots-column available-staff-time-column"
          style={{ 
            gridColumn: 2,
            gridRow: 4,
            width: fullWidth ? 'auto' : `${availableColumnWidth}px`,
            minWidth: `${availableColumnWidth}px`,
            background: 'hsl(var(--muted) / 0.3)',
            borderRight: '1px solid hsl(var(--foreground) / 0.2)'
          }}
        >
          <div className="time-slots-grid">
            {timeSlots.map((slot) => (
              <div key={slot.time} className="time-slot-cell">&nbsp;</div>
            ))}
          </div>
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
            <SimpleTimeSlot key={`timeslots-${resource.id}`} isLast={index === resources.length - 1}>
              <div 
                className={`time-slots-column ${index === resources.length - 1 ? 'is-last' : ''}`}
                style={{ 
                  gridColumn: index + 3,
                  gridRow: 4,
                  width: fullWidth ? 'auto' : `${teamColumnWidth}px`,
                  minWidth: fullWidth ? '120px' : `${teamColumnWidth}px`,
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
                  const readOnly = isEventReadOnly ? isEventReadOnly(event) : false;
                  return (
                    <EventWrapper
                      key={`event-wrapper-${event.id}`}
                      event={event}
                      position={position}
                      teamColumnWidth={teamColumnWidth}
                      onEventClick={handleBookingEventClick}
                      onEventResize={onEventResize}
                      readOnly={readOnly}
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
