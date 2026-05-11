import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useWorkSession } from '@/hooks/useWorkSession';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
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
 * useWorkSession monteras enbart för att rendera dialogs (rast/EOD/switch).
 * Manuell tidrapportering/korrigering går via TimeReportTab eller
 * `/m/report/:id/edit` — inte via en form på den här sidan.
 */
const MobileTimeReport = () => {
  const { t } = useLanguage();
  const { staff } = useMobileAuth();
  const { data: bookings = [], isLoading } = useMobileBookings();

  // useWorkSession behövs enbart för dialogs (rast/EOD/switch).
  // Dess activeTimers används INTE som källa för arbetstid eller aktiv timer.
  const { dialogs } = useWorkSession(bookings, staff?.id);

  const [activeTab, setActiveTab] = useState<TimeTabId>('today');

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-card">
        <MobileHeroHeader eyebrow={t('time.eyebrow')} title={t('time.title2')} subtitle={t('time.subtitle2')} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-card pb-24">
      <MobileHeroHeader eyebrow={t('time.eyebrow')} title={t('time.title2')} subtitle={t('time.subtitle2')} />

      <div className="flex-1 px-5 pt-5 pb-28 space-y-4 w-full min-w-0 max-w-full box-border">
        <MobileTimeTabs value={activeTab} onChange={setActiveTab} />

        {activeTab === 'today' && <TodayTab />}
        {activeTab === 'report' && <TimeReportTab />}
        {activeTab === 'history' && <TimeCalendarTab />}
      </div>

      {dialogs}
    </div>
  );
};

export default MobileTimeReport;
