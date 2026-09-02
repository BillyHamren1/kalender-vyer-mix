import React from 'react';
import { Card } from '@/components/ui/card';

/**
 * Truthful state surface for the Time V2 module (loading / empty / error /
 * offline / unconfigured). Never renders fabricated data.
 */
export const TimeV2StateCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  body: string;
  testId?: string;
  children?: React.ReactNode;
}> = ({ icon, title, body, testId, children }) => (
  <Card className="p-6 flex items-start gap-4" data-testid={testId}>
    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">{icon}</div>
    <div className="min-w-0">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      {children && <div className="mt-3">{children}</div>}
    </div>
  </Card>
);

export default TimeV2StateCard;
