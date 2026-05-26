/**
 * MobileTimeV2Page — startsida för /m/report.
 *
 * All UI/sheet/queue-logik äger MobileTimeReportQueue. Den här sidan
 * är bara en autentiseringsguard + kontainer.
 */
import React from 'react';
import { Card } from '@/components/ui/card';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import MobileTimeReportQueue from './MobileTimeReportQueue';

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

  return <MobileTimeReportQueue staffId={staffId} />;
};

export default MobileTimeV2Page;
