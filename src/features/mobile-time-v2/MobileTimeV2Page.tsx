/**
 * MobileTimeV2Page — startsida för /m/report.
 *
 * Renderar WeekFlowMobilePanel som ENDA huvudvy. Veckan kommer från
 * `get-staff-time-week-matrix` (samma resolver som admin Tid & Lön).
 * Dag-sheet skickar in via `submit-staff-day-v3`.
 *
 * Single-pipeline: appen läser ALDRIG raw GPS och anropar ALDRIG
 * get-mobile-gps-day-view eller submit-mobile-gps-day-v2.
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
