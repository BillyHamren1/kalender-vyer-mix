import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import CustomEvent from './CustomEvent';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import { DRAG_DATA_TYPE, type DraggedEventData } from '@/hooks/useEventDragDrop';
import StaffItem from './StaffItem';
import TeamVisibilityControl from './TeamVisibilityControl';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { extractUTCDate, extractUTCTime } from '@/utils/dateUtils';
import './TimeGrid.css';
...
  // Calculate event position based on time - Continuous 24-hour grid
  const getEventPosition = (event: CalendarEvent) => {
    const startClock = extractUTCTime(event.start);
    const endClock = extractUTCTime(event.end);
    const startDate = extractUTCDate(event.start);
    const endDate = extractUTCDate(event.end);

    const [startHH, startMM] = startClock.split(':').map(Number);
    const [endHH, endMM] = endClock.split(':').map(Number);

    let startHour = (Number.isNaN(startHH) ? 0 : startHH) + (Number.isNaN(startMM) ? 0 : startMM / 60);
    let endHour = (Number.isNaN(endHH) ? 0 : endHH) + (Number.isNaN(endMM) ? 0 : endMM / 60);

    // Handle events that span into next day (convert to 24+ hour format)
    if (endDate > startDate || endHour < startHour) {
      endHour += 24;
    }

    // Calculate position in pixels (25px per hour)
    // Offset by 5 hours since we start from 05:00
    const top = (startHour - 5) * 25;
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

  const availableStaffSectionHeight = staffExpandedProp ? 132 : 78;
  const availableStaffGridHeight = staffExpandedProp ? 108 : 48;
  const availableStaffFooterHeight = 18;
  const assignedStaffRowHeight = 88;

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
          height: `${availableStaffSectionHeight}px`,
          minHeight: `${availableStaffSectionHeight}px`,
          maxHeight: `${availableStaffSectionHeight}px`,
          transition: 'background 0.2s ease, height 0.2s ease',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {(() => {
          const allStaff = getUnassignedAvailableStaff();
          const maxCollapsed = 10; // 2 rows × 5 columns
          const displayStaff = staffExpandedProp ? allStaff : allStaff.slice(0, maxCollapsed);
          const hasMore = allStaff.length > maxCollapsed;
          return (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '4px',
                  maxHeight: `${availableStaffGridHeight}px`,
                  minHeight: `${availableStaffGridHeight}px`,
                  overflowY: 'auto',
                  alignContent: 'start',
                }}
              >
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

              <div
                style={{
                  minHeight: `${availableStaffFooterHeight}px`,
                  height: `${availableStaffFooterHeight}px`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: '2px',
                }}
              >
                {hasMore ? (
                  <button
                    onClick={onToggleStaffExpanded}
                    className="flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 cursor-pointer transition-colors"
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
                ) : (
                  <div />
                )}

                {allStaff.length === 0 && (
                  <span className="text-[9px] text-muted-foreground/60 italic">Inga tillgängliga</span>
                )}
              </div>
            </>
          );
        })()}
        {selectingForTeam && (
          <button 
            onClick={() => setSelectingForTeam(null)}
            className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground mt-1"
            style={{ alignSelf: 'flex-start' }}
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
        <div className="staff-row-time-cell" style={{ gridRow: 3, gridColumn: 1, height: `${assignedStaffRowHeight}px` }}></div>
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
                minWidth: fullWidth ? '120px' : `${teamColumnWidth}px`,
                height: `${assignedStaffRowHeight}px`,
                minHeight: `${assignedStaffRowHeight}px`,
                maxHeight: `${assignedStaffRowHeight}px`,
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
