/**
 * MobileTimeV2Page — startsida för /m/report.
 *
 * Renderar WeekFlowMobilePanel som är den ENDA huvudvyn. Samma
 * useStaffTimeWeekFlow + WeekFlowDayCard som admin Tid & Lön — så
 * appen och admin visar alltid samma statusar och samma underlag.
 *
 * Submit går genom DayReviewSheet (V2-APIet:
 * get-mobile-gps-day-view + submit-mobile-gps-day-v2). Skriver aldrig
 * till time_reports/workdays/location_time_entries/travel_time_logs.
 *
 * Legacy MobileTimeReportQueue finns kvar i filträdet men är inte längre
 * monterad — flippa VITE_LEGACY_TIME_QUEUE=1 om något behöver gamla vyn.
 */
import React from 'react';
import { Card } from '@/components/ui/card';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import WeekFlowMobilePanel from '@/components/mobile-app/time/WeekFlowMobilePanel';
import MobileTimeReportQueue from './MobileTimeReportQueue';

const LEGACY_QUEUE =
  (import.meta as any).env?.VITE_LEGACY_TIME_QUEUE === '1' ||
  (import.meta as any).env?.VITE_LEGACY_TIME_QUEUE === 'true';

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

  if (LEGACY_QUEUE) {
    return <MobileTimeReportQueue staffId={staffId} />;
  }

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      <WeekFlowMobilePanel />
    </div>
  );
};

export default MobileTimeV2Page;
