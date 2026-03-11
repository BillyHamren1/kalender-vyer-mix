import React, { useMemo } from 'react';
import { CalendarEvent, Resource } from '../ResourceData';
import { useTimeSlots } from './useCalendarGrid';
import TimeColumn from './TimeColumn';
import ResourceColumn from './ResourceColumn';
import { format } from 'date-fns';

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
  const dateStr = useMemo(() => {
    const d = effectiveDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [effectiveDate]);

  const slots = useTimeSlots();

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
              events={events}
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
