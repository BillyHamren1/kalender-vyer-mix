import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectEconomy } from '@/hooks/useProjectEconomy';
import { EconomySummaryCard } from './EconomySummaryCard';
import { StaffCostTable } from './StaffCostTable';
import { PurchasesList } from './PurchasesList';
import { QuotesInvoicesList } from './QuotesInvoicesList';
import { BudgetSettingsDialog } from './BudgetSettingsDialog';

interface ProjectEconomyTabProps {
  projectId: string;
  bookingId: string | null;
}

export const ProjectEconomyTab = ({ projectId, bookingId }: ProjectEconomyTabProps) => {
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  
  const {
    budget,
    timeReports,
    purchases,
    quotes,
    invoices,
    summary,
    isLoading,
    saveBudget,
    addPurchase,
    removePurchase,
    addQuote,
    removeQuote,
    addInvoice,
    removeInvoice,
    updateInvoice
  } = useProjectEconomy(projectId, bookingId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <EconomySummaryCard summary={summary} />

      {/* Staff & Hours */}
      <StaffCostTable
        timeReports={timeReports}
        summary={summary}
        onOpenBudgetSettings={() => setBudgetDialogOpen(true)}
      />

      {/* Purchases */}
      <PurchasesList
        purchases={purchases}
        projectId={projectId}
        totalAmount={summary.purchasesTotal}
        onAddPurchase={addPurchase}
        onRemovePurchase={removePurchase}
      />

      {/* Quotes & Invoices */}
      <QuotesInvoicesList
        quotes={quotes}
        invoices={invoices}
        projectId={projectId}
        onAddQuote={addQuote}
        onRemoveQuote={removeQuote}
        onAddInvoice={addInvoice}
        onRemoveInvoice={removeInvoice}
        onUpdateInvoice={updateInvoice}
      />

      {/* Budget Settings Dialog */}
      <BudgetSettingsDialog
        open={budgetDialogOpen}
        onOpenChange={setBudgetDialogOpen}
        currentBudget={budget || null}
        onSave={saveBudget}
      />
    </div>
  );
};
