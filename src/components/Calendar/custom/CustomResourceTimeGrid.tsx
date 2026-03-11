import React, { useMemo } from 'react';
import { CalendarEvent, Resource } from '../ResourceData';
import { useTimeSlots } from './useCalendarGrid';
import TimeColumn from './TimeColumn';
import ResourceColumn from './ResourceColumn';
import { deduplicateEvents } from '@/utils/eventUtils';

interface CustomResourceTimeGridProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void>;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  onSelectStaff?: (resourceId: string, resourceTitle: string) => void;
  forceRefresh?: boolean;
  droppableScope?: string;
  calendarProps?: any;
  targetDate?: Date;
  staffOperations?: {
    getStaffForTeamAndDate: (teamId: string, date: Date) => Array<{ id: string; name: string; color?: string }>;
  };
}

/**
 * STABILIZATION: Events are deduplicated once at the grid level
 * before distribution to ResourceColumns. Date string is memoized
 * to prevent unnecessary recalculations in children.
 */
const CustomResourceTimeGrid: React.FC<CustomResourceTimeGridProps> = ({
  events,
  resources,
  isLoading,
  currentDate,
  refreshEvents,
  targetDate,
  staffOperations,
}) => {
  const effectiveDate = targetDate || currentDate;

  // MEMOIZED: Date string computed once per date change
  const dateStr = useMemo(() => {
    const d = effectiveDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [effectiveDate]);

  const slots = useTimeSlots();

  // STABILIZATION: Deduplicate events once at grid level
  // Prevents duplicate rendering across all resource columns
  const stableEvents = useMemo(() => deduplicateEvents(events), [events]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-muted-foreground">Loading calendar...</div>
      </div>
    );
  }

  return (
    <div className="resource-calendar-container relative bg-background border border-border rounded overflow-hidden">
      <div className="flex overflow-x-auto">
        <TimeColumn slots={slots} />
        {resources.map(resource => {
          const staffList = staffOperations
            ? staffOperations.getStaffForTeamAndDate(resource.id, effectiveDate)
            : [];

          return (
            <ResourceColumn
              key={resource.id}
              resource={resource}
              events={stableEvents}
              dateStr={dateStr}
              slots={slots}
              refreshEvents={refreshEvents}
              staffList={Array.isArray(staffList) ? staffList : []}
            />
          );
        })}
      </div>
    </div>
  );
};

export default CustomResourceTimeGrid;
