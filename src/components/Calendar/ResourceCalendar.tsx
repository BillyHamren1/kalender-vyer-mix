import React, { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import { format } from 'date-fns';
import { CalendarEvent, Resource } from './ResourceData';
import { processEvents } from './CalendarEventProcessor';
import { useReliableStaffOperations } from '@/hooks/useReliableStaffOperations';
import ResourceHeaderDropZone from './ResourceHeaderDropZone';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import {
  renderEventContent,
  setupEventActions,
  addEventAttributes,
  setupResourceHeaderStyles
} from './CalendarEventRenderer';
import { useResourceCalendarConfig } from '@/hooks/useResourceCalendarConfig';
import { useResourceCalendarHandlers } from '@/hooks/useResourceCalendarHandlers';
import { ResourceCalendarStyles } from './ResourceCalendarStyles';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/calendarService';

interface ResourceCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void | CalendarEvent[]>;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  onSelectStaff?: (teamId: string, teamName: string) => void;
  forceRefresh?: boolean;
  calendarProps?: Record<string, any>;
  droppableScope?: string;
  targetDate?: Date;
}

const ResourceCalendar: React.FC<ResourceCalendarProps> = ({
  events,
  resources,
  isLoading,
  isMounted,
  currentDate,
  onDateSet,
  refreshEvents,
  onStaffDrop,
  onSelectStaff,
  forceRefresh,
  calendarProps = {},
  droppableScope = 'weekly-calendar',
  targetDate
}) => {
  const [selectedDate, setSelectedDate] = useState<Date>(currentDate);
  const [currentView, setCurrentView] = useState<string>('resourceTimeGridDay');
  const effectiveDate = targetDate || currentDate;

  const handleEventChange = async (info: any) => {
    try {
      const event = info.event;

      const resourceId =
        event.getResources?.()?.[0]?.id ||
        event._def?.resourceIds?.[0] ||
        event.extendedProps?.resourceId ||
        null;

      if (!event.id || !event.start || !event.end || !resourceId) {
        console.warn('❌ Missing data during event update:', {
          id: event.id,
          start: event.start,
          end: event.end,
          resourceId,
          extendedProps: event.extendedProps,
        });
        toast("❌ Event update failed", {
          description: "Required event data is missing",
        });
        return;
      }

      const updateData = {
        start: event.start.toISOString(),
        end: event.end.toISOString(),
        resourceId,
      };

      console.log("🔁 Updating calendar event:", updateData);

      await updateCalendarEvent(event.id, updateData);

      toast("✅ Event updated", {
        description: `Time updated to ${event.start.toLocaleTimeString()} - ${event.end.toLocaleTimeString()}`,
      });
    } catch (error) {
      console.error("💥 Failed to update event:", error);
      toast("❌ Event update failed", {
        description: "Something went wrong. Please try again.",
      });
    }
  };

  return (
    <FullCalendar
      events={events}
      resources={resources}
      initialView="resourceTimeGridDay"
      editable={true}
      eventStartEditable={true}
      eventDurationEditable={true}
      eventResizableFromStart={true}
      eventChange={handleEventChange}
      {...calendarProps}
    />
  );
};

export default ResourceCalendar;
