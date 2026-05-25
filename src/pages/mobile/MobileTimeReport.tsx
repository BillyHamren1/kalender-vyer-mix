import MobileTimeV2Page from '@/features/mobile-time-v2/MobileTimeV2Page';

/**
 * MobileTimeReport — REN tidrapportvy (Time v2).
 *
 * Hela sidan delegerar till MobileTimeV2Page som ENBART konsumerar
 * `get-mobile-gps-day-view` / `submit-mobile-gps-day-v2`. Allt gammalt
 * mobile-time-UI (TimeReportTab, StaffDayDetailSheet, useStaffDay*-hooks)
 * är frånkopplat från /m/report.
 */
const MobileTimeReport = () => {
  return <MobileTimeV2Page />;
};

export default MobileTimeReport;
