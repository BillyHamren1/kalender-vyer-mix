import type { ScheduledShift } from '@/services/mobileApiService';
import MobileWeekGrid from './MobileWeekGrid';

interface Props {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  shifts: ScheduledShift[];
  activeBookingIds: Set<string>;
  /** Optional — when provided, tapping the already-selected day opens day view. */
  onOpenDayView?: (d: Date) => void;
}

const MobileWeekView = ({
  selectedDate,
  onSelectDate,
  shifts,
  activeBookingIds,
  onOpenDayView,
}: Props) => {
  return (
    <MobileWeekGrid
      selectedDate={selectedDate}
      onSelectDate={onSelectDate}
      onOpenDayView={onOpenDayView}
      shifts={shifts}
      activeBookingIds={activeBookingIds}
    />
  );
};

export default MobileWeekView;
