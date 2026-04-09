import React, { useState, useCallback, useMemo } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import CustomEvent from './CustomEvent';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import { DRAG_DATA_TYPE, type DraggedEventData } from '@/hooks/useEventDragDrop';
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
  setEvents?: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
}

// Overlap layout utility — assigns column indices to overlapping events
interface OverlapInfo { column: number; totalColumns: number; }

function computeOverlapLayout(
  events: CalendarEvent[],
  getPos: (e: CalendarEvent) => { top: number; height: number }
): Map<string, OverlapInfo> {
  const result = new Map<string, OverlapInfo>();
  if (events.length === 0) return result;

  const items = events.map(e => ({ id: e.id, ...getPos(e) }));
  items.sort((a, b) => a.top - b.top || b.height - a.height);

  // Build overlap groups using a sweep-line
  const groups: typeof items[] = [];
  const eventGroup = new Map<string, number>();

  for (const item of items) {
    let placed = false;
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      const overlaps = group.some(g => item.top < g.top + g.height && item.top + item.height > g.top);
      if (overlaps) {
        group.push(item);
        eventGroup.set(item.id, gi);
        placed = true;
        break;
      }
    }
    if (!placed) {
      eventGroup.set(item.id, groups.length);
      groups.push([item]);
    }
  }

  // Merge groups that share transitive overlaps
  for (const group of groups) {
    const cols: typeof items[] = [];
    for (const item of group) {
      let assigned = false;
      for (let ci = 0; ci < cols.length; ci++) {
        const canFit = cols[ci].every(c => item.top >= c.top + c.height || item.top + item.height <= c.top);
        if (canFit) {
          cols[ci].push(item);
          result.set(item.id, { column: ci, totalColumns: 0 });
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        cols.push([item]);
        result.set(item.id, { column: cols.length - 1, totalColumns: 0 });
      }
    }
    for (const item of group) {
      const info = result.get(item.id)!;
      info.totalColumns = cols.length;
    }
  }

  return result;
}

// Event Wrapper Component — outer draggable shell sits above Radix popovers
const EventWrapper: React.FC<{
  event: CalendarEvent;
  position: { top: number; height: number };
  overlapLayout?: OverlapInfo;
  teamColumnWidth: number;
  onEventClick: (event: CalendarEvent) => void;
  onEventResize?: () => Promise<void>;
  readOnly?: boolean;
  setEvents?: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
}> = React.memo(({ event, position, overlapLayout, teamColumnWidth, onEventClick, onEventResize, readOnly, setEvents }) => {
  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (readOnly) {
      e.preventDefault();
      return;
    }
    const data: DraggedEventData = {
      id: event.id,
      title: event.title,
      start: typeof event.start === 'string' ? event.start : new Date(event.start).toISOString(),
      end: typeof event.end === 'string' ? event.end : new Date(event.end).toISOString(),
      bookingId: event.bookingId,
      eventType: event.eventType,
      resourceId: event.resourceId,
    };
    e.dataTransfer.setData(DRAG_DATA_TYPE, JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
  }, [event, readOnly]);

  return (
    <div
      draggable={!readOnly}
      onDragStart={handleDragStart}
      style={{
        position: 'absolute',
        top: `${position.top}px`,
        height: `${position.height}px`,
        left: overlapLayout && overlapLayout.totalColumns > 1
          ? `calc(${(overlapLayout.column * 100) / overlapLayout.totalColumns}% + 2px)`
          : '4px',
        width: overlapLayout && overlapLayout.totalColumns > 1
          ? `calc(${100 / overlapLayout.totalColumns}% - 4px)`
          : 'calc(100% - 8px)',
        zIndex: 25,
        pointerEvents: 'auto',
        cursor: readOnly ? 'default' : 'grab',
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
        setEvents={setEvents}
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
  carouselNav,
  setEvents
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
  const timeColumnWidth = 50;
  const availableColumnWidth = 70; // Staff column
  const baseTeamColumnWidth = 73;
  const wideTeamColumnWidth = 140;

  // Calculate event position based on time - Continuous 24-hour grid
  const getEventPosition = (event: CalendarEvent) => {
    const startTime = new Date(event.start);
    const endTime = new Date(event.end);
    
    // CRITICAL: Use UTC hours, not local hours!
    let startHour = startTime.getUTCHours() + startTime.getUTCMinutes() / 60;
    let endHour = endTime.getUTCHours() + endTime.getUTCMinutes() / 60;
    
    // Handle events that span into next day (convert to 24+ hour format)
    if (endHour < startHour) {
      endHour += 24;
    }
    
    // Calculate position in pixels (25px per hour)
    // Offset by 5 hours since we start from 05:00
    let top = (startHour - 5) * 25;
    
    const height = Math.max(12, (endHour - startHour) * 25);
    
    return { top, height };
  };

  // Precompute which resources have overlapping events (need wider columns)
  const resourceHasOverlaps = useMemo(() => {
    const result = new Map<string, boolean>();
    resources.forEach(resource => {
      const resourceEvents = getEventsForDayAndResource(day, resource.id);
      if (resourceEvents.length > 1) {
        const overlapMap = computeOverlapLayout(resourceEvents, getEventPosition);
        const hasOverlap = Array.from(overlapMap.values()).some(info => info.totalColumns > 1);
        result.set(resource.id, hasOverlap);
      } else {
        result.set(resource.id, false);
      }
    });
    return result;
  }, [resources, events, day]);

  const getTeamColumnWidth = (resourceId: string) => {
    return resourceHasOverlaps.get(resourceId) ? wideTeamColumnWidth : baseTeamColumnWidth;
  };

  const totalTeamColumnsWidth = resources.reduce((sum, r) => sum + getTeamColumnWidth(r.id), 0);

  // Handle event click - format event data for navigation hook OR use custom handler
  const handleBookingEventClick = (event: CalendarEvent) => {
    if (onEventClick) {
      onEventClick(event);
      return;
    }
    
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
    
    handleEventClick(formattedEventInfo);
  };

  const getAssignedStaffForTeam = (teamId: string) => {
    if (!weeklyStaffOperations) return [];
    const staff = weeklyStaffOperations.getStaffForTeamAndDate(teamId, day);
    // Ensure we always return an array
    return Array.isArray(staff) ? staff : [];
  };

  const handleStaffSelectionClick = (resourceId: string, resourceTitle: string, event: React.MouseEvent<HTMLButtonElement>) => {
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

  // Calculate grid template columns - no more available staff column
  const getGridTemplateColumns = () => {
    if (fullWidth) {
      return `${timeColumnWidth}px repeat(${resources.length}, 1fr)`;
    }
    const colWidths = resources.map(r => `${getTeamColumnWidth(r.id)}px`).join(' ');
    return `${timeColumnWidth}px ${colWidths}`;
  };

  // Calculate total width
  const getTotalWidth = () => {
    if (fullWidth) {
      return '100%';
    }
    return `${timeColumnWidth + totalTeamColumnsWidth}px`;
  };

  // Get unassigned available staff (not assigned to any team today)
  const getUnassignedAvailableStaff = () => {
    if (!availableStaff || availableStaff.length === 0) return [];
    return availableStaff.filter(staff => !staff.assignedTeamId);
  };

  return (
    <div 
      className={`time-grid-with-staff-header ${variant === 'warehouse' ? 'warehouse-theme' : ''}`}
    >
      {/* Fixed Header Section */}
      <div 
        className="time-grid-fixed-header"
        style={{
          display: 'grid',
          gridTemplateColumns: getGridTemplateColumns(),
          gridTemplateRows: 'auto auto auto',
          width: getTotalWidth(),
          flexShrink: 0
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
          width: fullWidth ? 'auto' : `${availableColumnWidth + totalTeamColumnsWidth}px`,
          maxWidth: fullWidth ? 'none' : `${availableColumnWidth + totalTeamColumnsWidth}px`
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

        {/* Row 2: Team Headers */}
        <div className="time-empty-cell" style={{ gridRow: 2, gridColumn: 1 }}></div>

        {resources.map((resource, index) => {
          return (
            <div 
              key={`header-${resource.id}`}
              className="team-header-cell cursor-pointer"
              style={{ 
                gridColumn: index + 2,
                gridRow: 2,
                width: fullWidth ? 'auto' : `${getTeamColumnWidth(resource.id)}px`,
                minWidth: fullWidth ? '120px' : `${getTeamColumnWidth(resource.id)}px`
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

        {/* Row 3: Available Staff - full width, 4-column grid */}
        <div 
          style={{ 
            gridColumn: '1 / -1',
            gridRow: 3,
            background: 'linear-gradient(180deg, hsl(var(--muted) / 0.5) 0%, hsl(var(--muted) / 0.3) 100%)',
            borderBottom: '1px solid hsl(var(--border) / 0.6)',
            padding: '6px 10px',
          }}
        >
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-1">Personal</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
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
          </div>
          {getUnassignedAvailableStaff().length === 0 && (
            <span className="text-[9px] text-muted-foreground/60 italic">Inga tillgängliga</span>
          )}
        </div>

        {/* Row 4: Staff Assignment Areas per team */}
        <div className="staff-row-time-cell" style={{ gridRow: 4, gridColumn: 1 }}></div>
        {resources.map((resource, index) => {
          const assignedStaff = getAssignedStaffForTeam(resource.id);
          
          return (
            <div 
              key={`staff-${resource.id}`}
              className="staff-assignment-header-row"
              style={{ 
                gridColumn: index + 3,
                gridRow: 3,
                width: fullWidth ? 'auto' : `${getTeamColumnWidth(resource.id)}px`,
                minWidth: fullWidth ? '120px' : `${getTeamColumnWidth(resource.id)}px`
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
      </div>

      {/* Scrollable Time Slots Section */}
      <div 
        className="time-grid-scrollable-content"
        style={{
          display: 'grid',
          gridTemplateColumns: getGridTemplateColumns(),
          width: getTotalWidth(),
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden'
        }}
      >
        <div className="time-labels-column" style={{ gridColumn: 1 }}>
          {/* Continuous 24-hour time labels from 05:00 to 05:00 (next day) */}
          {timeSlots.map((slot) => (
            <div key={slot.time} className="time-label-slot">
              {slot.displayTime}
            </div>
          ))}
        </div>

        {/* Empty column under "Personal" header */}
        <div 
          className="time-slots-column available-staff-time-column"
          style={{ 
            gridColumn: 2,
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

        {/* Time Slot Columns */}
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
                  width: fullWidth ? 'auto' : `${getTeamColumnWidth(resource.id)}px`,
                  minWidth: fullWidth ? '120px' : `${getTeamColumnWidth(resource.id)}px`,
                  position: 'relative'
                }}
              >
                {/* Time slots grid - continuous 24-hour */}
                <div className="time-slots-grid">
                  {timeSlots.map((slot) => (
                    <div key={slot.time} className="time-slot-cell">&nbsp;</div>
                  ))}
                </div>
                
                {/* Events positioned absolutely with overlap detection */}
                {(() => {
                  const overlapMap = computeOverlapLayout(resourceEvents, getEventPosition);
                  return resourceEvents.map((event) => {
                    const position = getEventPosition(event);
                    const readOnly = isEventReadOnly ? isEventReadOnly(event) : false;
                    return (
                      <EventWrapper
                        key={`event-wrapper-${event.id}`}
                        event={event}
                        position={position}
                        overlapLayout={overlapMap.get(event.id)}
                        teamColumnWidth={getTeamColumnWidth(resource.id)}
                        onEventClick={handleBookingEventClick}
                        onEventResize={onEventResize}
                        readOnly={readOnly}
                        setEvents={setEvents}
                      />
                    );
                  });
                })()}
              </div>
            </SimpleTimeSlot>
          );
        })}
      </div>
    </div>
  );
};

export default TimeGrid;
