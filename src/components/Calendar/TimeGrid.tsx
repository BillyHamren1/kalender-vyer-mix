import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import CustomEvent from './CustomEvent';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import { DRAG_DATA_TYPE, type DraggedEventData } from '@/hooks/useEventDragDrop';
import StaffItem from './StaffItem';
import TeamVisibilityControl from './TeamVisibilityControl';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
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
  staffExpanded?: boolean;
  onToggleStaffExpanded?: () => void;
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

  const hasOverlap = !!(overlapLayout && overlapLayout.totalColumns > 1);
  const overlapColumn = overlapLayout?.column ?? 0;
  const overlapCount = overlapLayout?.totalColumns ?? 1;
  const overlapWidthPercent = hasOverlap ? 60 : 100;
  const maxLeftPercent = hasOverlap ? 40 : 0;
  const leftPercent = hasOverlap && overlapCount > 1
    ? (overlapColumn / (overlapCount - 1)) * maxLeftPercent
    : 0;
  const horizontalInset = 4;
  const baseZ = hasOverlap ? 25 + overlapColumn : 25;

  return (
    <div
      draggable={!readOnly}
      onDragStart={handleDragStart}
      className={hasOverlap ? 'cascaded-event' : undefined}
      style={{
        position: 'absolute',
        top: `${position.top}px`,
        height: `${position.height}px`,
        left: `${horizontalInset + (leftPercent / 100) * Math.max(teamColumnWidth - horizontalInset * 2, 0)}px`,
        width: `calc(${overlapWidthPercent}% - ${horizontalInset * 2}px)`,
        zIndex: baseZ,
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
  staffExpanded: staffExpandedProp = false,
  onToggleStaffExpanded,
  carouselNav,
  setEvents
}) => {
  const [selectingForTeam, setSelectingForTeam] = useState<{ id: string; title: string } | null>(null);
  const staffContainerRef = useRef<HTMLDivElement>(null);
  const { handleEventClick } = useEventNavigation();

  // Close staff selection when clicking outside the staff container
  useEffect(() => {
    if (!selectingForTeam) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (staffContainerRef.current && !staffContainerRef.current.contains(e.target as Node)) {
        setSelectingForTeam(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectingForTeam]);
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
  // availableColumnWidth removed - staff shown in full-width row now
  const baseTeamColumnWidth = 95;
  const teamColumnWidth = baseTeamColumnWidth;

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

  const totalTeamColumnsWidth = resources.length * teamColumnWidth;

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

  const handleStaffSelectionClick = (resourceId: string, resourceTitle: string) => {
    setSelectingForTeam(prev => prev?.id === resourceId ? null : { id: resourceId, title: resourceTitle });
  };

  const handleAvailableStaffClick = async (staffId: string) => {
    if (!selectingForTeam || !onStaffDrop) return;
    await onStaffDrop(staffId, selectingForTeam.id, day);
    // Don't close selection — user can assign multiple staff, then click outside to dismiss
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
    const colWidths = resources.map(() => `${teamColumnWidth}px`).join(' ');
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
    <>
      {/* Available Staff - rendered ABOVE the day card */}
      <div 
        ref={staffContainerRef}
        className="rounded-t-2xl"
        style={{ 
          background: selectingForTeam 
            ? 'linear-gradient(180deg, hsl(var(--primary) / 0.15) 0%, hsl(var(--primary) / 0.08) 100%)'
            : 'linear-gradient(180deg, hsl(var(--muted) / 0.5) 0%, hsl(var(--muted) / 0.3) 100%)',
          borderBottom: '1px solid hsl(var(--border) / 0.6)',
          padding: '4px 6px',
          transition: 'background 0.2s ease',
        }}
      >
        {(() => {
          const allStaff = getUnassignedAvailableStaff();
          const maxCollapsed = 10; // 2 rows × 5 columns
          const displayStaff = staffExpandedProp ? allStaff : allStaff.slice(0, maxCollapsed);
          const hasMore = allStaff.length > maxCollapsed;
          return (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
                {displayStaff.map((staff) => {
                  const firstName = staff.name.trim().split(' ')[0];
                  return (
                    <div 
                      key={staff.id}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${selectingForTeam ? 'cursor-pointer hover:ring-2 hover:ring-primary/50 hover:scale-105 transition-all' : ''}`}
                      style={{ 
                        backgroundColor: staff.color || 'hsl(var(--muted))',
                        color: '#000'
                      }}
                      title={selectingForTeam ? `Tilldela ${staff.name} till ${selectingForTeam.title}` : staff.name}
                      onClick={selectingForTeam ? () => handleAvailableStaffClick(staff.id) : undefined}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 flex-shrink-0"></span>
                      <span>{firstName}</span>
                    </div>
                  );
                })}
              </div>
              {hasMore && (
                <button
                  onClick={onToggleStaffExpanded}
                  className="flex items-center gap-1 mt-1 text-[10px] font-medium text-primary hover:text-primary/80 cursor-pointer transition-colors"
                >
                  {staffExpandedProp ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" />
                      Visa mindre
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      Visa alla ({allStaff.length - maxCollapsed} till)
                    </>
                  )}
                </button>
              )}
              {allStaff.length === 0 && (
                <span className="text-[9px] text-muted-foreground/60 italic">Inga tillgängliga</span>
              )}
            </>
          );
        })()}
        {selectingForTeam && (
          <button 
            onClick={() => setSelectingForTeam(null)}
            className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground mt-1"
          >
            Avbryt
          </button>
        )}
      </div>

      <div 
        className={`time-grid-with-staff-header day-card bg-background rounded-2xl shadow-lg border overflow-hidden ${variant === 'warehouse' ? 'warehouse-theme' : ''}`}
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
          width: fullWidth ? 'auto' : `${totalTeamColumnsWidth}px`,
          maxWidth: fullWidth ? 'none' : `${totalTeamColumnsWidth}px`
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
          const isActiveTeam = selectingForTeam?.id === resource.id;
          return (
            <div 
              key={`header-${resource.id}`}
              className="team-header-cell cursor-pointer"
              style={{ 
                gridColumn: index + 2,
                gridRow: 2,
                width: fullWidth ? 'auto' : `${teamColumnWidth}px`,
                minWidth: fullWidth ? '120px' : `${teamColumnWidth}px`,
                ...(isActiveTeam ? { background: 'hsl(var(--primary) / 0.15)' } : {})
              }}
              onClick={() => handleStaffSelectionClick(resource.id, resource.title)}
              title={`Assign staff to ${resource.title}`}
            >
              <div className="team-header-content">
                <span className="team-title">{resource.title}</span>
                <button
                  className="add-staff-button-header"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStaffSelectionClick(resource.id, resource.title);
                  }}
                  title={`Assign staff to ${resource.title}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}

        {/* Row 3: Staff Assignment Areas per team */}
        <div className="staff-row-time-cell" style={{ gridRow: 3, gridColumn: 1 }}></div>
        {resources.map((resource, index) => {
          const assignedStaff = getAssignedStaffForTeam(resource.id);
          
          return (
            <div 
              key={`staff-${resource.id}`}
              className="staff-assignment-header-row"
              style={{ 
                gridColumn: index + 2,
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
                  gridColumn: index + 2,
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
                        teamColumnWidth={teamColumnWidth}
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
    </>
  );
};

export default TimeGrid;
