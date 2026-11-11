import { addDays, format, startOfMonth, subDays } from 'date-fns';

// A shared monthly cache covers the month grid and adjacent weeks. Anchor to
// the viewed month, not today, so historical and future navigation stays valid.
export function getStaffAssignmentsWindow(currentDate: Date) {
  const anchor = startOfMonth(currentDate);
  return {
    from: format(subDays(anchor, 45), 'yyyy-MM-dd'),
    to: format(addDays(anchor, 60), 'yyyy-MM-dd'),
    bucket: format(anchor, 'yyyy-MM'),
  };
}
