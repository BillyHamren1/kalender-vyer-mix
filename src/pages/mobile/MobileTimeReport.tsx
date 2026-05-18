import { MobileHeroHeader } from '@/components/mobile-app/MobileHeader';
import { useLanguage } from '@/i18n/LanguageContext';
import TimeReportTab from '@/components/mobile-app/time/TimeReportTab';

/**
 * MobileTimeReport — REN tidrapportvy.
 *
 * Sidan visar bara TimeReportTab (dag/vecka/månad). Klick på en dag öppnar
 * StaffDayDetailSheet med tidslinjeunderlaget (StaffGanttMirrorTimeline,
 * dvs. samma Gantt som admin ser på /staff-management/time-reports).
 *
 * Tidigare "Idag"-tab med WorkdayStatusCard / TotalsCard / EndDayButton /
 * DisplayTimelineV2Card / start/avsluta-arbetsdag är BORTTAGNA — TIME-sidan
 * är inte längre ett live-flöde, bara rapportering. Workday startas/stoppas
 * via GlobalActiveTimerBanner / WorkDayPanel utanför denna sida.
 *
 * Datakälla (PURE MIRROR av /staff-management/time-reports):
 *   get-mobile-staff-day-report → staff_day_report_cache + staff_day_submissions
 *   get-staff-time-report-period (vecka/månad, legacy tills portad till samma cache)
 */
const MobileTimeReport = () => {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col min-h-screen bg-card pb-24">
      <MobileHeroHeader eyebrow={t('time.eyebrow')} title={t('time.title2')} subtitle={t('time.subtitle2')} />

      <div className="flex-1 px-5 pt-5 pb-28 space-y-4 w-full min-w-0 max-w-full box-border">
        <TimeReportTab />
      </div>
    </div>
  );
};

export default MobileTimeReport;
