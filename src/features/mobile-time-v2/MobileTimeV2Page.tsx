/**
 * MobileTimeV2Page — startsida för /m/report.
 *
 * EN dataväg:
 *   staff_location_history
 *     → Time Engine / cache-builder
 *     → staff_day_report_cache
 *     → resolveStaffDayReportsBatch
 *     → admin (Tid & Lön) OCH mobil (denna sida) läser SAMMA modell.
 *
 * Veckan kommer från `get-staff-time-week-matrix` (dual-auth — mobile
 * token = self only). Dag-sheet läser via `get-mobile-staff-day-report`
 * och skickar in via `submit-staff-day-v3`.
 *
 * Mobilappen får ALDRIG bygga om dagen från raw GPS, och får ALDRIG
 * anropa get-mobile-gps-day-view / submit-mobile-gps-day-v2 /
 * get-staff-gps-week-summary / useStaffGpsWeekSummary /
 * buildCanonicalStaffDayGpsResult / staff_location_history direkt.
 */

import React from 'react';
import { Card } from '@/components/ui/card';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import WeekFlowMobilePanel from '@/components/mobile-app/time/WeekFlowMobilePanel';

const MobileTimeV2Page: React.FC = () => {
  const { effectiveStaffId } = useMobileAuth();
  const staffId = effectiveStaffId ?? null;

  if (!staffId) {
    return (
      <div className="flex flex-col min-h-screen bg-background items-center justify-center p-8">
        <Card className="p-6 max-w-sm text-center">
          <p className="text-sm text-muted-foreground">Logga in för att se din tidrapport.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      <WeekFlowMobilePanel />
    </div>
  );
};

export default MobileTimeV2Page;
