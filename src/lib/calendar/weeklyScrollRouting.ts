export interface WeeklyScrollIntent {
  deltaX: number;
  deltaY: number;
  shiftKey?: boolean;
}

export interface VerticalScrollState {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  deltaY: number;
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

export const canConsumeVerticalScroll = ({
  scrollTop,
  clientHeight,
  scrollHeight,
  deltaY,
}: VerticalScrollState): boolean => {
  if (deltaY === 0 || scrollHeight <= clientHeight) {
    return false;
  }

  const maxScrollTop = Math.max(scrollHeight - clientHeight, 0);
  const normalizedScrollTop = Math.min(Math.max(scrollTop, 0), maxScrollTop);

  if (deltaY < 0) {
    return normalizedScrollTop > 0;
  }

  return normalizedScrollTop < maxScrollTop;
};