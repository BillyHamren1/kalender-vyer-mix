/**
 * useStaffDayStatus(date)
 * =======================
 * Single official entrypoint the Time page uses to read the **truth about a
 * single day** (today by default).
 *
 * This is intentionally a thin re-export of {@link useStaffDaySnapshot} —
 * the snapshot is built server-side by the `get-staff-day-status` Edge
 * Function from workdays + time_reports + travel_time_logs +
 * location_time_entries + workday_flags + assistant_events.
 *
 * The mobile app must NEVER recombine those raw tables itself.
 *
 *   ✅ Use:    const { snapshot, refresh } = useStaffDayStatus();
 *   ❌ Avoid:  pulling time_reports + travel_logs + workdays into a
 *              component and summing them.
 *
 * The shape returned matches `StaffDaySnapshot` from useStaffDaySnapshot.
 */
import {
  useStaffDaySnapshot,
  type StaffDaySnapshot,
  type StaffDaySegment,
  type StaffDayActive,
  type StaffDayTotals,
  type StaffDayFlag,
  type StaffDaySegmentKind,
} from './useStaffDaySnapshot';

export type {
  StaffDaySnapshot,
  StaffDaySegment,
  StaffDayActive,
  StaffDayTotals,
  StaffDayFlag,
  StaffDaySegmentKind,
};

export function useStaffDayStatus(date?: string) {
  return useStaffDaySnapshot(date);
}
