import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Check, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GateItem {
  label: string;
  passed: boolean;
  blocking: boolean;
  detail?: string;
}

interface ProjectClosureGateProps {
  gates: GateItem[];
  className?: string;
}

export const ProjectClosureGate: React.FC<ProjectClosureGateProps> = ({ gates, className }) => {
  const blockers = gates.filter(g => g.blocking && !g.passed);
  const warnings = gates.filter(g => !g.blocking && !g.passed);
  const allBlockersPassed = blockers.length === 0;

  return (
    <Card className={cn('border-border/40', className)}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Stängningskontroll
          </h3>
          {allBlockersPassed ? (
            <span className="text-[10px] font-medium text-green-600 bg-green-50 dark:bg-green-950/30 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800">
              Redo att stänga
            </span>
          ) : (
            <span className="text-[10px] font-medium text-red-600 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">
              {blockers.length} blockerare
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          {gates.map((gate) => (
            <div
              key={gate.label}
              className={cn(
                'flex items-start gap-2.5 px-3 py-2 rounded-md border text-xs',
                gate.passed
                  ? 'border-green-200/60 bg-green-50/50 dark:border-green-800/40 dark:bg-green-950/10'
                  : gate.blocking
                  ? 'border-red-200/60 bg-red-50/50 dark:border-red-800/40 dark:bg-red-950/10'
                  : 'border-amber-200/60 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-950/10'
              )}
            >
              <div className="mt-0.5 shrink-0">
                {gate.passed ? (
                  <Check className="h-3.5 w-3.5 text-green-600" />
                ) : gate.blocking ? (
                  <X className="h-3.5 w-3.5 text-red-600" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  'font-medium',
                  gate.passed ? 'text-green-700 dark:text-green-400' :
                  gate.blocking ? 'text-red-700 dark:text-red-400' :
                  'text-amber-700 dark:text-amber-400'
                )}>
                  {gate.label}
                  {!gate.blocking && !gate.passed && (
                    <span className="text-muted-foreground ml-1">(varning)</span>
                  )}
                </p>
                {gate.detail && (
                  <p className="text-muted-foreground mt-0.5">{gate.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// Helper to build gates from project data
export function buildClosureGates(params: {
  unattestedInvoiceCount: number;
  newCostCount: number;
  hasRecentEconomyData: boolean;
  budgetDeviation: number;
  marginPercent: number;
  timeReportsApproved: boolean;
}): GateItem[] {
  const gates: GateItem[] = [];

  // Blocking gates
  gates.push({
    label: 'Alla leverantörsfakturor attesterade',
    passed: params.unattestedInvoiceCount === 0,
    blocking: true,
    detail: params.unattestedInvoiceCount > 0 ? `${params.unattestedInvoiceCount} oattesterade fakturor` : undefined,
  });

  gates.push({
    label: 'Inga nya ogranskade kostnader',
    passed: params.newCostCount === 0,
    blocking: true,
    detail: params.newCostCount > 0 ? `${params.newCostCount} nya kostnader` : undefined,
  });

  gates.push({
    label: 'Ekonomibilden uppdaterad',
    passed: params.hasRecentEconomyData,
    blocking: true,
    detail: !params.hasRecentEconomyData ? 'Uppdatera ekonomidata innan stängning' : undefined,
  });

  // Warning gates
  gates.push({
    label: 'Budgetavvikelse inom rimlig nivå',
    passed: Math.abs(params.budgetDeviation) <= 10,
    blocking: false,
    detail: Math.abs(params.budgetDeviation) > 10 ? `${params.budgetDeviation.toFixed(0)}% avvikelse` : undefined,
  });

  gates.push({
    label: 'Marginal acceptabel',
    passed: params.marginPercent >= 10,
    blocking: false,
    detail: params.marginPercent < 10 ? `Marginal: ${params.marginPercent.toFixed(0)}%` : undefined,
  });

  gates.push({
    label: 'Tidrapporter godkända',
    passed: params.timeReportsApproved,
    blocking: false,
    detail: !params.timeReportsApproved ? 'Ej alla tidrapporter godkända' : undefined,
  });

  return gates;
}
