
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
  calendarProps: Record<string, any>
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

  // FIXED: Consistent resource column configuration - using NUMBERS for FullCalendar
  const getResourceColumnConfig = () => {
    // Use numeric values for FullCalendar (pixels without 'px')
    const standardWidth = 80;
    
    return {
      resourceAreaWidth: standardWidth,
      slotMinWidth: standardWidth,
      resourceAreaColumns: [
        {
          field: 'title',
          headerContent: 'Teams',
          width: standardWidth
        }
      ],
      resourcesInitiallyExpanded: true,
      stickyResourceAreaHeaders: true,
      resourceLaneWidth: standardWidth,
      resourceWidth: standardWidth
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
    initialView: getInitialView(),
    headerToolbar: getMobileHeaderToolbar(),
    views: getCalendarViews(),
    resources: isMobile ? [] : sortedResources,
    editable: true,
    droppable: true,
    selectable: true,
    eventDurationEditable: true,
    eventResizableFromStart: true,
    height: "auto",
    aspectRatio: getAspectRatio(),
    dropAccept: ".fc-event",
    eventAllow: () => true,
    // Add the FIXED resource column config with consistent 80px width (as numbers)
    ...getResourceColumnConfig(),
    // Add calendar options
    ...getCalendarOptions(),
    // Add time formatting
    ...getCalendarTimeFormatting(),
    // Apply any additional calendar props (but prioritize our width settings)
    ...calendarProps,
    // OVERRIDE any conflicting width settings from calendarProps with NUMBERS
    resourceAreaWidth: 80,
    slotMinWidth: 80,
    // Update resource rendering to include select button
    resourceAreaHeaderContent: (args: any) => {
      return (
        <div className="flex items-center justify-between p-1">
          <span>Teams</span>
        </div>
      );
    },
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
