import React from 'react';
import { TimeSlot, GRID_TOTAL_HEIGHT } from './useCalendarGrid';

interface TimeColumnProps {
  slots: TimeSlot[];
}

const TimeColumn: React.FC<TimeColumnProps> = React.memo(({ slots }) => {
  return (
    <div className="relative flex-shrink-0 w-14 border-r border-border" style={{ height: GRID_TOTAL_HEIGHT }}>
      {slots.map((slot, i) => (
        <div
          key={i}
          className="absolute right-2 text-[10px] text-muted-foreground leading-none"
          style={{ top: slot.topPx - 6 }}
        >
          {slot.label}
        </div>
      ))}
    </div>
  );
});

TimeColumn.displayName = 'TimeColumn';

export default TimeColumn;
