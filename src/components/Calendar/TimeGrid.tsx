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
  onEventDrop?: (e: React.DragEvent, targetDateStr: string, targetResourceId?: string) => void | Promise<void>;
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date, fromTeamId?: string) => Promise<void>;
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

const TIME_COLUMN_WIDTH = 28;
const TEAM_COLUMN_WIDTH = 95;
const ASSIGNED_STAFF_ROW_HEIGHT = 88;

const TimeGrid: React.FC<TimeGridProps> = ({
  day,
  resources,
  events,
  getEventsForDayAndResource,
  onEventDrop,
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
  const [openPickerTeamId, setOpenPickerTeamId] = useState<string | null>(null);
  const { handleEventClick } = useEventNavigation();

  const timeSlots = generateTimeSlots();

  const getAssignedStaffForTeamSafe = (teamId: string) => {
    if (!weeklyStaffOperations) return [];
    const staff = weeklyStaffOperations.getStaffForTeamAndDate(teamId, day);
    return Array.isArray(staff) ? staff : [];
  };
  // Bredda team-kolumnen när det finns fler än 5 tilldelade personer.
  const WIDE_TEAM_COLUMN_WIDTH = Math.round(TEAM_COLUMN_WIDTH * 1.25); // ~två kompakta namn bredvid varandra
  // Beräkna max-överlapp per resurs så vi kan bredda kolumnen även när två
  // event ligger samtidigt (samma princip som vid flera personer i teamet).
  const overlapMaps = resources.map((r) =>
    computeOverlapLayout(getEventsForDayAndResource(day, r.id), getEventPosition),
  );
  const maxOverlapPerResource = overlapMaps.map((map) => {
    let m = 1;
    for (const info of map.values()) if (info.totalColumns > m) m = info.totalColumns;
    return m;
  });
  const teamColumnWidths = resources.map((r, i) => {
    const staffCount = getAssignedStaffForTeamSafe(r.id).length;
    const staffWidth = staffCount > 5 ? WIDE_TEAM_COLUMN_WIDTH : TEAM_COLUMN_WIDTH;
    // Vid överlapp: ge varje "lane" full kolumnbredd (cap vid 4 lanes för att inte sprängas).
    const overlapLanes = Math.min(maxOverlapPerResource[i] ?? 1, 4);
    const overlapWidth = overlapLanes * TEAM_COLUMN_WIDTH;
    return Math.max(staffWidth, overlapWidth);
  });
  const totalTeamColumnsWidth = teamColumnWidths.reduce((sum, w) => sum + w, 0);

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

  const getAssignedStaffForTeam = getAssignedStaffForTeamSafe;

  const handlePickStaffForTeam = async (teamId: string, staffId: string) => {
    if (!onStaffDrop) return;
    await onStaffDrop(staffId, teamId, day);
  };

  const handleStaffRemoval = async (staffId: string, fromTeamId?: string) => {
    // Multi-team: only remove THIS team-row, not all teams for the day.
    if (onStaffDrop) await onStaffDrop(staffId, null, day, fromTeamId);
  };

  const gridTemplateColumns = fullWidth
    ? `${TIME_COLUMN_WIDTH}px repeat(${resources.length}, 1fr) ${TIME_COLUMN_WIDTH}px`
    : `${TIME_COLUMN_WIDTH}px ${teamColumnWidths.map((w) => `${w}px`).join(' ')} ${TIME_COLUMN_WIDTH}px`;
  const totalWidth = fullWidth ? '100%' : `${TIME_COLUMN_WIDTH * 2 + totalTeamColumnsWidth}px`;
  const rightTimeColumn = resources.length + 2;

  return (
    <>
      <div className={`time-grid-with-staff-header day-card bg-background rounded-2xl shadow-lg border overflow-x-auto overflow-y-hidden ${variant === 'warehouse' ? 'warehouse-theme' : ''}`}>
        {/* Fixed header */}
        <div
          className="time-grid-fixed-header"
          style={{ display: 'grid', gridTemplateColumns, gridTemplateRows: 'auto auto auto', width: totalWidth, flexShrink: 0 }}
        >
          <div className="time-grid-header-bg" style={{ gridColumn: '1 / -1', gridRow: 1 }} />
          <div className="time-column-header" />

          <div
            className="day-header-teams"
            style={{
              gridColumn: `2 / ${rightTimeColumn}`,
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
            const isActiveTeam = openPickerTeamId === resource.id;
            const assignedIds = getAssignedStaffForTeam(resource.id).map((s) => s.id);
            const colWidth = teamColumnWidths[index];
            return (
              <div
                key={`header-${resource.id}`}
                className="team-header-cell"
                style={{
                  gridColumn: index + 2,
                  gridRow: 2,
                  width: fullWidth ? 'auto' : `${colWidth}px`,
                  minWidth: fullWidth ? 0 : `${colWidth}px`,
                  ...(isActiveTeam ? { background: 'hsl(var(--primary) / 0.15)' } : {}),
                }}
              >
                <div className="team-header-content">
                  <span className="team-title">{resource.title}</span>
                  <TeamStaffPickerPopover
                    teamId={resource.id}
                    teamTitle={resource.title}
                    staff={availableStaff}
                    assignedStaffIds={assignedIds}
                    onPick={(staffId) => handlePickStaffForTeam(resource.id, staffId)}
                    open={isActiveTeam}
                    onOpenChange={(o) => setOpenPickerTeamId(o ? resource.id : null)}
                  >
                    <button
                      className="add-staff-button-header"
                      onClick={(e) => e.stopPropagation()}
                      title={`Tilldela personal till ${resource.title}`}
                      aria-label={`Tilldela personal till ${resource.title}`}
                    >+</button>
                  </TeamStaffPickerPopover>
                </div>
              </div>
            );
          })}
          {/* Höger tids-cell rad 2 */}
          <div className="time-column-header" style={{ gridRow: 2, gridColumn: rightTimeColumn }}>
            <div className="time-title">Time</div>
          </div>

          {/* Row 3: assigned staff per team */}
          <div className="staff-row-time-cell" style={{ gridRow: 3, gridColumn: 1, minHeight: `${ASSIGNED_STAFF_ROW_HEIGHT}px` }} />
          {resources.map((resource, index) => {
            const assignedStaff = getAssignedStaffForTeam(resource.id);
            const colWidth = teamColumnWidths[index];
            const wide = assignedStaff.length > 5;
            return (
              <div
                key={`staff-${resource.id}`}
                className="staff-assignment-header-row"
                style={{
                  gridColumn: index + 2,
                  gridRow: 3,
                  width: fullWidth ? 'auto' : `${colWidth}px`,
                  minWidth: fullWidth ? 0 : `${colWidth}px`,
                  minHeight: `${ASSIGNED_STAFF_ROW_HEIGHT}px`,
                }}
              >
                <div className="staff-header-assignment-area">
                  <div className={`assigned-staff-header-list${wide ? ' assigned-staff-header-list--wide' : ''}`}>
                    {assignedStaff.map((staff) => (
                      <StaffItem
                        key={staff.id}
                        staff={{ id: staff.id, name: staff.name, color: staff.color, assignedTeam: resource.id }}
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
            const colWidth = teamColumnWidths[index];
            return (
              <SimpleTimeSlot
                key={`timeslots-${resource.id}`}
                isLast={index === resources.length - 1}
                gridColumn={index + 2}
                fullWidth={fullWidth}
                fixedWidth={fullWidth ? undefined : colWidth}
              >
                <div
                  className={`time-slots-column ${index === resources.length - 1 ? 'is-last' : ''}`}
                  onDragOver={onEventDrop ? (e) => e.preventDefault() : undefined}
                  onDrop={onEventDrop ? (e) => {
                    e.stopPropagation();
                    void onEventDrop(e, format(day, 'yyyy-MM-dd'), resource.id);
                  } : undefined}
                  style={{
                    width: '100%',
                    minWidth: 0,
                    position: 'relative',
                  }}
                >
                  <div className="time-slots-grid">
                    {timeSlots.map((slot) => (
                      <div key={slot.time} className="time-slot-cell">&nbsp;</div>
                    ))}
                  </div>

                  {(() => {
                    const overlapMap = overlapMaps[index];
                    return resourceEvents.map((event) => {
                      const position = getEventPosition(event);
                      const readOnly = isEventReadOnly ? isEventReadOnly(event) : false;
                      return (
                        <EventWrapper
                          key={`event-wrapper-${event.id}`}
                          event={event}
                          position={position}
                          overlapLayout={overlapMap.get(event.id)}
                          teamColumnWidth={colWidth}
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

          {/* Höger tids-kolumn (spegelvänd) */}
          <div className="time-labels-column time-labels-column--right" style={{ gridColumn: rightTimeColumn }}>
            {timeSlots.map((slot) => (
              <div key={`r-${slot.time}`} className="time-label-slot">{slot.displayTime}</div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default TimeGrid;
