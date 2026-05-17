export const GANTT_NAME_COL_PX = 220;
export const GANTT_HEADER_PX = 44;
export const GANTT_ROW_PX = 48;

export const getGanttLaneMetrics = (laneCount: number, rowPx = GANTT_ROW_PX) => {
  const safeLaneCount = Math.max(1, laneCount);
  const laneHeight = Math.max(12, (rowPx - 8) / safeLaneCount);

  return {
    topInset: 4,
    laneHeight,
    blockHeight: Math.max(10, laneHeight - 3),
  };
};

export const getGanttEvidenceBarStyle = (rowPx = GANTT_ROW_PX) => ({
  top: Math.max(2, rowPx - 8),
  height: 4,
});

export const shouldShowCompactBlockBadge = ({
  width,
  laneHeight,
}: {
  width: number;
  laneHeight: number;
}) => width >= 84 && laneHeight >= 16;

export const shouldShowCompactBlockTime = ({
  width,
  laneHeight,
  isSecondary,
}: {
  width: number;
  laneHeight: number;
  isSecondary: boolean;
}) => !isSecondary && width >= 170 && laneHeight >= 24;