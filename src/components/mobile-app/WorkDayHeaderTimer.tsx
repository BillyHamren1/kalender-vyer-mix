import React from 'react';
import { Sun } from 'lucide-react';
import { useWorkDayTimer } from '@/hooks/useWorkDayTimer';

/**
 * WorkDayHeaderTimer — small, calm pill in the header showing how long
 * the current workday has been running. Starts automatically when the
 * first activity timer of the day starts, hides once the user has
 * actively ended the day.
 *
 * Render this inside the right-action slot of `MobileHeroHeader` /
 * `MobileBackHeader`. It's intentionally compact and uses
 * primary-foreground tokens so it sits cleanly on the primary header.
 */
const formatHMS = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const WorkDayHeaderTimer: React.FC = () => {
  const { isActive, elapsedSeconds } = useWorkDayTimer();
  if (!isActive) return null;

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-foreground/10 border border-primary-foreground/15"
      title="Arbetsdagens längd — pågår tills du avslutar dagen"
      aria-label="Dagens arbetstid"
    >
      <Sun className="w-3 h-3 text-primary-foreground/80" />
      <span className="font-mono font-semibold text-[11px] tabular-nums text-primary-foreground leading-none">
        {formatHMS(elapsedSeconds)}
      </span>
    </div>
  );
};

export default WorkDayHeaderTimer;
