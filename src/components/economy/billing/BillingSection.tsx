import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Receipt, Loader2 } from 'lucide-react';
import {
  useProjectBillingList,
  useUpdateProjectBilling,
  useAdvanceBillingStatus,
  groupByBillingStatus,
  type ProjectBilling,
  type BillingStatus,
} from '@/hooks/useProjectBilling';
import BillingKpiCards from './BillingKpiCards';
import BillingPipeline from './BillingPipeline';
import BillingReviewDialog from './BillingReviewDialog';
import { startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

const BillingSection: React.FC = () => {
  const { data: billingItems = [], isLoading } = useProjectBillingList();
  const updateBilling = useUpdateProjectBilling();
  const { advance } = useAdvanceBillingStatus();
  const [selectedBilling, setSelectedBilling] = useState<ProjectBilling | null>(null);

  const grouped = useMemo(() => groupByBillingStatus(billingItems), [billingItems]);

  const paidThisMonth = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    return grouped.paid.filter(p => {
      if (!p.invoice_paid_at) return false;
      const d = new Date(p.invoice_paid_at);
      return isWithinInterval(d, { start: monthStart, end: monthEnd });
    });
  }, [grouped.paid]);

  // Combine invoiced + invoice_created for "sent unpaid"
  const sentUnpaid = useMemo(
    () => [...grouped.invoiced, ...grouped.invoice_created],
    [grouped.invoiced, grouped.invoice_created]
  );

  const handleSave = (id: string, updates: Partial<ProjectBilling>) => {
    updateBilling.mutate({ id, ...updates } as any);
  };

  const handleAdvance = (id: string, newStatus: BillingStatus) => {
    advance(id, newStatus);
    setSelectedBilling(null);
  };

  if (isLoading) {
    return (
      <Card className="border-border/40">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const hasAnyItems = billingItems.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Receipt className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold text-foreground">Fakturering</h2>
      </div>

      {!hasAnyItems ? (
        <Card className="border-border/40">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Inga projekt i faktureringskön</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Projekt som stängs operativt visas här automatiskt för granskning
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI cards */}
          <BillingKpiCards
            underReview={grouped.under_review}
            readyToInvoice={grouped.ready_to_invoice}
            invoiced={sentUnpaid}
            overdue={grouped.overdue}
            paidThisMonth={paidThisMonth}
          />

          {/* Pipeline columns */}
          <Card className="border-border/40">
            <CardContent className="p-5">
              <BillingPipeline
                grouped={grouped}
                onSelectProject={setSelectedBilling}
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Review panel */}
      <BillingReviewDialog
        billing={selectedBilling}
        open={!!selectedBilling}
        onClose={() => setSelectedBilling(null)}
        onSave={handleSave}
        onAdvanceStatus={handleAdvance}
      />
    </div>
  );
};

export default BillingSection;
