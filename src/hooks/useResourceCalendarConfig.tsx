
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

  // Resource column configuration - optimized width for weekly view
  const getResourceColumnConfig = () => {
    // Use optimized width for weekly view - smaller columns to fit more on screen
    const columnWidth = viewMode === 'weekly' ? 100 : 120;
    
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
    initialView: 'resourceTimeGridDay',
    headerToolbar: getMobileHeaderToolbar(),
    views: getCalendarViews(),
    resources: sortedResources,
    // FULLY ENABLE all editing capabilities for drag/drop
    editable: true,
    droppable: true,
    selectable: true,
    eventDurationEditable: true,
    eventResizableFromStart: true,
    eventStartEditable: true,
    selectMirror: true,
    eventOverlap: true,
    selectOverlap: true,
    dayMaxEvents: false,
    height: "auto",
    aspectRatio: getAspectRatio(),
    dropAccept: ".fc-event",
    eventAllow: () => true,
    // Let FullCalendar handle timezone naturally
    timeZone: 'local',
    // FIXED: Use full 24-hour range instead of limiting to 05:00-24:00
    slotMinTime: '00:00:00',
    slotMaxTime: '24:00:00',
    scrollTime: '06:00:00',
    slotDuration: '01:00:00',
    slotLabelInterval: '01:00:00',
    snapDuration: '00:15:00',
    // Resource config
    ...getResourceColumnConfig(),
    // Add calendar options
    ...getCalendarOptions(),
    // Simple time formatting
    ...getCalendarTimeFormatting(),
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
