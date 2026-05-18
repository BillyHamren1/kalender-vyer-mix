export interface WeeklyScrollIntent {
  deltaX: number;
  deltaY: number;
  shiftKey?: boolean;
}

export const getWeeklyHorizontalScrollDelta = ({ deltaX, deltaY, shiftKey = false }: WeeklyScrollIntent): number => {
  if (shiftKey && deltaY !== 0) {
    return deltaY;
  }

  if (deltaX === 0) {
    return 0;
  }

  return Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : 0;
};