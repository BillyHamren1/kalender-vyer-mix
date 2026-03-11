import React, { useMemo, useCallback } from 'react';
import { CalendarEvent, Resource } from '../ResourceData';
import { PositionedEvent, GRID_TOTAL_HEIGHT, positionEvents } from './useCalendarGrid';
import CustomEvent from '../CustomEvent';
import { getEventKey } from '@/utils/eventUtils';

interface ResourceColumnProps {
  resource: Resource;
  events: CalendarEvent[];
  dateStr: string;
  slots: { topPx: number; minute: number }[];
  refreshEvents: () => Promise<void>;
  staffList?: Array<{ id: string; name: string; color?: string }>;
}

/**
 * STABILIZATION: positionEvents is now memoized per (events, resourceId, dateStr).
 * Previously it ran on every render even when events hadn't changed.
 * refreshEvents callback is stabilized to prevent CustomEvent re-renders.
 */
const ResourceColumn: React.FC<ResourceColumnProps> = React.memo(({
  resource,
  events,
  dateStr,
  slots,
  refreshEvents,
  staffList = [],
}) => {
  // MEMOIZED: Only recompute positions when events/resource/date change
  const positioned = useMemo(
    () => positionEvents(events, resource.id, dateStr),
    [events, resource.id, dateStr]
  );

  // STABILIZED: Single callback reference for all CustomEvent instances
  const handleEventResize = useCallback(
    async () => { await refreshEvents(); },
    [refreshEvents]
  );

  return (
    <div className="flex flex-col flex-1 min-w-[80px]">
      {/* Header */}
      <div className="border-b border-border p-1 min-h-[70px] bg-muted/30">
        <div className="text-xs font-medium mb-1 text-foreground">{resource.title}</div>
        <div className="space-y-0.5">
          {staffList.map(staff => (
            <div
              key={staff.id}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: staff.color || 'hsl(var(--accent))',
                color: '#000',
              }}
            >
              {staff.name}
            </div>
          ))}
        </div>
      </div>

      {/* Time grid body */}
      <div className="relative border-r border-border" style={{ height: GRID_TOTAL_HEIGHT }}>
        {/* Slot lines — STABILIZED: slots array is already memoized via useTimeSlots */}
        {slots.map((slot, i) => (
          <div
            key={i}
            className={`absolute left-0 right-0 border-t ${slot.minute === 0 ? 'border-border' : 'border-border/30'}`}
            style={{ top: slot.topPx }}
          />
        ))}

        {/* Events — STABILIZED: Uses getEventKey for stable React keys */}
        {positioned.map((ev: PositionedEvent) => {
          const widthPercent = 100 / ev.totalColumns;
          const leftPercent = ev.columnIndex * widthPercent;

          return (
            <div
              key={getEventKey(ev)}
              className="absolute px-0.5"
              style={{
                top: ev.topPx,
                height: ev.heightPx,
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
              }}
            >
              <CustomEvent
                event={ev}
                resource={resource}
                onEventResize={handleEventResize}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

ResourceColumn.displayName = 'ResourceColumn';

export default ResourceColumn;
