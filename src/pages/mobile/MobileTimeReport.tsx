import MobileTimeV2Page from '@/features/mobile-time-v2/MobileTimeV2Page';

/**
 * MobileTimeReport — /m/report.
 *
 * Single-pipeline tidrapport:
 *   - veckan via get-staff-time-week-matrix (resolveStaffDayReportsBatch)
 *   - dagen via get-mobile-staff-day-report (samma resolver)
 *   - inskick via submit-staff-day-v3
 *
 * Inget GPS byggs i appen. Ingen dag byggs om vid submit. Appen speglar
 * staff_day_report_cache tills personalen skickar in; efter inskick
 * speglar appen staff_day_submissions.
 */
const MobileTimeReport = () => <MobileTimeV2Page />;

export default MobileTimeReport;
