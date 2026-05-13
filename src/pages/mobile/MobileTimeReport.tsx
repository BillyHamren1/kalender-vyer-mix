import { useState } from 'react';
import { MobileHeroHeader } from '@/components/mobile-app/MobileHeader';
import { useLanguage } from '@/i18n/LanguageContext';
import MobileTimeTabs, { type TimeTabId } from '@/components/mobile-app/time/MobileTimeTabs';
import TimeCalendarTab from '@/components/mobile-app/time/TimeCalendarTab';
import TimeReportTab from '@/components/mobile-app/time/TimeReportTab';
import TodayTab from '@/components/mobile-app/time/TodayTab';

/**
 * MobileTimeReport — Time-sidan med tre tabbar (Idag / Kalender / Tidrapport).
 *
 * Mobile day report source (PURE MIRROR of /staff-management/time-reports):
 *   get-mobile-staff-day-report
 *     → staff_day_report_cache
 *     → staff_day_submissions
 *
 * Periodvy (vecka/månad) använder fortfarande get-staff-time-report-period
 * som legacy tills den portas till samma cache-källa.
 *
 * Sidan får inte summera time_reports / travel_time_logs / workdays själv
 * och inte använda get-staff-day-status som datakälla.
 *
 * Sidan monterar INTE useWorkSession och renderar INGA legacy timer-dialogs.
 * Start/stopp av arbetsdag sker enbart via WorkDayPanel (TodayTab).
 * Manuell korrigering går via TimeReportTab eller `/m/report/:id/edit`.
 */
const MobileTimeReport = () => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TimeTabId>('today');

  return (
    <div className="flex flex-col min-h-screen bg-card pb-24">
      <MobileHeroHeader eyebrow={t('time.eyebrow')} title={t('time.title2')} subtitle={t('time.subtitle2')} />

      <div className="flex-1 px-5 pt-5 pb-28 space-y-4 w-full min-w-0 max-w-full box-border">
        <MobileTimeTabs value={activeTab} onChange={setActiveTab} />

        {activeTab === 'today' && <TodayTab />}
        {activeTab === 'report' && <TimeReportTab />}
        {activeTab === 'history' && <TimeCalendarTab />}
      </div>
    </div>
  );
};

export default MobileTimeReport;
