
import { useRef } from 'react';
import { Resource } from '@/components/Calendar/ResourceData';
import { useCalendarView } from '@/components/Calendar/CalendarViewConfig';
import { getCalendarViews, getCalendarOptions } from '@/components/Calendar/CalendarConfig';
import { getCalendarTimeFormatting } from '@/components/Calendar/CalendarEventHandlers';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';

export const useResourceCalendarConfig = (
  resources: Resource[],
  droppableScope: string,
  calendarProps: Record<string, any>,
  viewMode?: 'weekly' | 'monthly'
) => {
  const calendarRef = useRef<any>(null);
  const { isMobile, getInitialView, getMobileHeaderToolbar, getAspectRatio } = useCalendarView();

  // Sort resources in the correct order before passing to FullCalendar
  const sortedResources = [...resources].sort((a, b) => {
    // Special case for "Todays events" (team-6) - it should be last
    if (a.id === 'team-6') return 1;
    if (b.id === 'team-6') return -1;
    
    // Extract team numbers for comparison
    const aMatch = a.id.match(/team-(\d+)/);
    const bMatch = b.id.match(/team-(\d+)/);
    
    if (!aMatch || !bMatch) return 0;
    
    const aNum = parseInt(aMatch[1]);
    const bNum = parseInt(bMatch[1]);
    
    // Sort by team number
    return aNum - bNum;
  });

  // Get the appropriate initial view - ALWAYS use resource view to preserve team columns
  const getViewForMode = () => {
    return 'resourceTimeGridDay'; // Always use resource view to preserve team columns
  };

  // Resource column configuration - optimized width for weekly view
  const getResourceColumnConfig = () => {
    // Use optimized width for weekly view - smaller columns to fit more on screen
    const columnWidth = viewMode === 'weekly' ? 100 : 120; // Smaller width for weekly view
    
    return {
      resourceAreaWidth: columnWidth,
      slotMinWidth: columnWidth,
      resourceAreaColumns: [
        {
          field: 'title',
          headerContent: 'Teams',
          width: columnWidth
        }
      ],
      resourcesInitiallyExpanded: true,
      stickyResourceAreaHeaders: true,
      resourceLaneWidth: columnWidth,
      resourceWidth: columnWidth
    };
  };

  const getBaseCalendarProps = () => ({
    ref: calendarRef,
    plugins: [
      resourceTimeGridPlugin,
      timeGridPlugin,
      interactionPlugin,
      dayGridPlugin
    ],
    schedulerLicenseKey: "0134084325-fcs-1745193612",
    initialView: getViewForMode(),
    headerToolbar: getMobileHeaderToolbar(),
    views: getCalendarViews(),
    // Always include resources to preserve team columns
    resources: sortedResources,
    // CRITICAL: Enable ALL editing capabilities for drag/drop/resize
    editable: true,
    droppable: true,
    selectable: true,
    eventDurationEditable: true,
    eventResizableFromStart: true,
    eventStartEditable: true,
    selectMirror: true,
    eventOverlap: true,
    selectOverlap: true,
    dragRevertDuration: 0, // Instant visual feedback
    eventDragMinDistance: 5, // Allow small drags
    longPressDelay: 300, // Mobile touch support
    // Layout and sizing
    height: "auto",
    aspectRatio: getAspectRatio(),
    dropAccept: ".fc-event",
    eventAllow: () => true, // Allow all event operations
    // CRITICAL: Use local timezone for proper time display
    timeZone: 'local',
    // Enhanced time configuration for better event display
    slotMinTime: '05:00:00',
    slotMaxTime: '24:00:00',
    scrollTime: '08:00:00',
    slotDuration: '01:00:00',
    slotLabelInterval: '01:00:00',
    snapDuration: '00:15:00', // Allow 15-minute snapping for precise time changes
    // Always include resource config to preserve team columns
    ...getResourceColumnConfig(),
    // Add calendar options
    ...getCalendarOptions(),
    // Add time formatting with proper timezone handling
    ...getCalendarTimeFormatting(),
    // CRITICAL: Enhanced event handling for proper time updates and drag/drop
    eventTimeFormat: {
      hour: '2-digit' as '2-digit',
      minute: '2-digit' as '2-digit',
      meridiem: false,
      hour12: false,
      omitZeroMinute: false
    },
    // Apply any additional calendar props
    ...calendarProps,
    // Enable calendar connection for drag & drop
    eventSourceId: droppableScope,
  });

  return {
    calendarRef,
    isMobile,
    sortedResources,
    getBaseCalendarProps
  };
};
