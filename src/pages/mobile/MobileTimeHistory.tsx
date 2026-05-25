// Legacy mobile time UI. Do not use for Time v2.
/**
 * MobileTimeHistory — tunn wrapper runt nya backend-drivna `TimeReportTab`.
 *
 * Tidigare versionen aggregerade `time_reports` + `travel_time_logs` lokalt
 * (reduce/group/start_time.slice). Det bröt mot regeln att Time-appen alltid
 * ska visa samma sanning som backend-snapshots
 * (`get-staff-day-status` / `get-staff-time-report-period` /
 * `get-staff-month-status`). Sidan finns kvar för bakåtkompatibilitet med
 * gamla djuplänkar (t.ex. från MobileProfile) men är nu en ren vy ovanpå
 * `TimeReportTab` så all data kommer från samma kanoniska källa som
 * `/m/report`.
 */
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MobileHeroHeader } from '@/components/mobile-app/MobileHeader';
import TimeReportTab from '@/components/mobile-app/time/TimeReportTab';

const MobileTimeHistory = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-screen bg-card pb-24">
      <MobileHeroHeader
        eyebrow="Tidrapport"
        title="Historik"
        subtitle="Dag, vecka och månad — alltid synkad med tidrapporten."
      />

      <div className="px-5 pt-3">
        <button
          type="button"
          onClick={() => navigate('/m/report')}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground active:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
          Tillbaka till Tid
        </button>
      </div>

      <div className="flex-1 px-5 pt-4 pb-28 space-y-4 w-full min-w-0 max-w-full box-border">
        <TimeReportTab />
      </div>
    </div>
  );
};

export default MobileTimeHistory;
