import React, { useState } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import StaffItem from './StaffItem';
import TeamVisibilityControl from './TeamVisibilityControl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { computeOverlapLayout, generateTimeSlots, getEventPosition } from './timeGridLayout';
import { EventWrapper, SimpleTimeSlot } from './TimeGridEventLayer';
import { type AvailableStaffMember } from './TimeGridAvailableStaff';
import TeamStaffPickerPopover from './TeamStaffPickerPopover';
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
    getStaffForTeamAndDate: (teamId: string, date: Date) => Array<{ id: string; name: string; color?: string }>;
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
  onTitleClick?: (date: Date) => void;
  setEvents?: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
}

const TIME_COLUMN_WIDTH = 50;
const TEAM_COLUMN_WIDTH = 95;
const ASSIGNED_STAFF_ROW_HEIGHT = 88;

const TimeGrid: React.FC<TimeGridProps> = ({
  day,
  resources,
  events,
  getEventsForDayAndResource,
  onStaffDrop,
  weeklyStaffOperations,
  onEventResize,
  teamVisibilityProps,
  variant = 'default',
  isEventReadOnly,
  onEventClick,
  fullWidth = false,
  availableStaff = [],
  staffExpanded = false,
  onToggleStaffExpanded,
  carouselNav,
  onTitleClick,
  setEvents,
}) => {
  const [selectingForTeam, setSelectingForTeam] = useState<{ id: string; title: string } | null>(null);
  const staffContainerRef = useRef<HTMLDivElement>(null);
  const { handleEventClick } = useEventNavigation();

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

  const timeSlots = generateTimeSlots();
  const totalTeamColumnsWidth = resources.length * TEAM_COLUMN_WIDTH;

  const handleBookingEventClick = (event: CalendarEvent) => {
    if (onEventClick) { onEventClick(event); return; }
    handleEventClick({
      event: {
        id: event.id,
        title: event.title,
        start: new Date(event.start),
        extendedProps: { bookingId: event.bookingId, resourceId: event.resourceId },
      },
    });
  };

  const getAssignedStaffForTeam = (teamId: string) => {
    if (!weeklyStaffOperations) return [];
    const staff = weeklyStaffOperations.getStaffForTeamAndDate(teamId, day);
    return Array.isArray(staff) ? staff : [];
  };

  const handleStaffSelectionClick = (resourceId: string, resourceTitle: string) => {
    setSelectingForTeam(prev => {
      const isOpening = prev?.id !== resourceId;
      if (isOpening && !staffExpanded && onToggleStaffExpanded) onToggleStaffExpanded();
      return isOpening ? { id: resourceId, title: resourceTitle } : null;
    });
  };

  const handlePickStaff = async (staffId: string) => {
    if (!selectingForTeam || !onStaffDrop) return;
    await onStaffDrop(staffId, selectingForTeam.id, day);
  };

  const handleStaffRemoval = async (staffId: string) => {
    if (onStaffDrop) await onStaffDrop(staffId, null, day);
  };

  const gridTemplateColumns = fullWidth
    ? `${TIME_COLUMN_WIDTH}px repeat(${resources.length}, 1fr)`
    : `${TIME_COLUMN_WIDTH}px ${resources.map(() => `${TEAM_COLUMN_WIDTH}px`).join(' ')}`;
  const totalWidth = fullWidth ? '100%' : `${TIME_COLUMN_WIDTH + totalTeamColumnsWidth}px`;

  return (
    <>
      <TimeGridAvailableStaff
        containerRef={staffContainerRef}
        staff={availableStaff}
        selectingForTeam={selectingForTeam}
        expanded={staffExpanded}
        onToggleExpanded={onToggleStaffExpanded}
        onPickStaff={handlePickStaff}
        onCancelSelection={() => setSelectingForTeam(null)}
      />

      <div className={`time-grid-with-staff-header day-card bg-background rounded-2xl shadow-lg border overflow-hidden ${variant === 'warehouse' ? 'warehouse-theme' : ''}`}>
        {/* Fixed header */}
        <div
          className="time-grid-fixed-header"
          style={{ display: 'grid', gridTemplateColumns, gridTemplateRows: 'auto auto auto', width: totalWidth, flexShrink: 0 }}
        >
          <div className="time-grid-header-bg" style={{ gridColumn: '1 / -1', gridRow: 1 }} />
          <div className="time-column-header"><div className="time-title">Time</div></div>

          <div
            className="day-header-teams"
            style={{
              gridColumn: '2 / -1',
              width: fullWidth ? 'auto' : `${totalTeamColumnsWidth}px`,
              maxWidth: fullWidth ? 'none' : `${totalTeamColumnsWidth}px`,
            }}
          >
            <div className="day-header-content">
              {carouselNav ? (
                <button className="carousel-header-nav nav-left" onClick={carouselNav.onNavigateLeft} aria-label="Föregående dag">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              ) : (
                <div style={{ width: '32px' }} />
              )}
              <span
                className={`day-title ${onTitleClick ? 'cursor-pointer hover:underline' : ''}`}
                onClick={onTitleClick ? () => onTitleClick(day) : undefined}
                role={onTitleClick ? 'button' : undefined}
                title={onTitleClick ? 'Öppna dagen i helskärm' : undefined}
              >
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
                {carouselNav ? (
                  <button className="carousel-header-nav nav-right" onClick={carouselNav.onNavigateRight} aria-label="Nästa dag">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                ) : (
                  !teamVisibilityProps && <div style={{ width: '32px' }} />
                )}
              </div>
            </div>
          </div>

          {/* Row 2: team headers */}
          <div className="time-empty-cell" style={{ gridRow: 2, gridColumn: 1 }} />
          {resources.map((resource, index) => {
            const isActiveTeam = selectingForTeam?.id === resource.id;
            return (
              <div
                key={`header-${resource.id}`}
                className="team-header-cell cursor-pointer"
                style={{
                  gridColumn: index + 2,
                  gridRow: 2,
                  width: fullWidth ? 'auto' : `${TEAM_COLUMN_WIDTH}px`,
                  minWidth: fullWidth ? '120px' : `${TEAM_COLUMN_WIDTH}px`,
                  ...(isActiveTeam ? { background: 'hsl(var(--primary) / 0.15)' } : {}),
                }}
                onClick={() => handleStaffSelectionClick(resource.id, resource.title)}
                title={`Assign staff to ${resource.title}`}
              >
                <div className="team-header-content">
                  <span className="team-title">{resource.title}</span>
                  <button
                    className="add-staff-button-header"
                    onClick={(e) => { e.stopPropagation(); handleStaffSelectionClick(resource.id, resource.title); }}
                    title={`Assign staff to ${resource.title}`}
                  >+</button>
                </div>
              </div>
            );
          })}

          {/* Row 3: assigned staff per team */}
          <div className="staff-row-time-cell" style={{ gridRow: 3, gridColumn: 1, height: `${ASSIGNED_STAFF_ROW_HEIGHT}px` }} />
          {resources.map((resource, index) => {
            const assignedStaff = getAssignedStaffForTeam(resource.id);
            return (
              <div
                key={`staff-${resource.id}`}
                className="staff-assignment-header-row"
                style={{
                  gridColumn: index + 2,
                  gridRow: 3,
                  width: fullWidth ? 'auto' : `${TEAM_COLUMN_WIDTH}px`,
                  minWidth: fullWidth ? '120px' : `${TEAM_COLUMN_WIDTH}px`,
                  height: `${ASSIGNED_STAFF_ROW_HEIGHT}px`,
                  minHeight: `${ASSIGNED_STAFF_ROW_HEIGHT}px`,
                  maxHeight: `${ASSIGNED_STAFF_ROW_HEIGHT}px`,
                }}
              >
                <div className="staff-header-assignment-area">
                  <div className="assigned-staff-header-list">
                    {assignedStaff.map((staff) => (
                      <StaffItem
                        key={staff.id}
                        staff={{ id: staff.id, name: staff.name, color: staff.color, assignedTeam: resource.id }}
                        onRemove={() => handleStaffRemoval(staff.id)}
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

        {/* Scrollable time slots */}
        <div
          className="time-grid-scrollable-content"
          style={{ display: 'grid', gridTemplateColumns, width: totalWidth, flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}
        >
          <div className="time-labels-column" style={{ gridColumn: 1 }}>
            {timeSlots.map((slot) => (
              <div key={slot.time} className="time-label-slot">{slot.displayTime}</div>
            ))}
          </div>

          {resources.map((resource, index) => {
            const resourceEvents = getEventsForDayAndResource(day, resource.id);
            return (
              <SimpleTimeSlot key={`timeslots-${resource.id}`} isLast={index === resources.length - 1}>
                <div
                  className={`time-slots-column ${index === resources.length - 1 ? 'is-last' : ''}`}
                  style={{
                    gridColumn: index + 2,
                    width: fullWidth ? 'auto' : `${TEAM_COLUMN_WIDTH}px`,
                    minWidth: fullWidth ? '120px' : `${TEAM_COLUMN_WIDTH}px`,
                    position: 'relative',
                  }}
                >
                  <div className="time-slots-grid">
                    {timeSlots.map((slot) => (
                      <div key={slot.time} className="time-slot-cell">&nbsp;</div>
                    ))}
                  </div>

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
                          teamColumnWidth={TEAM_COLUMN_WIDTH}
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
