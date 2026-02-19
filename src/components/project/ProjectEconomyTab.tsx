import { useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useProjectEconomy } from '@/hooks/useProjectEconomy';
import { EconomySummaryCard } from './EconomySummaryCard';
import { StaffCostTable } from './StaffCostTable';
import { PurchasesList } from './PurchasesList';
import { QuotesInvoicesList } from './QuotesInvoicesList';
import { BudgetSettingsDialog } from './BudgetSettingsDialog';
import { ProductCostsCard } from './ProductCostsCard';
import { SupplierInvoicesCard } from './SupplierInvoicesCard';
import BookingEconomicsCard from '@/components/booking/BookingEconomicsCard';
import { exportToExcel, exportToPDF } from '@/services/projectEconomyExportService';
import { toast } from 'sonner';



interface ProjectEconomyTabProps {
  projectId: string;
  projectName?: string;
  bookingId: string | null;
}

export const ProjectEconomyTab = ({ projectId, projectName = 'Projekt', bookingId }: ProjectEconomyTabProps) => {
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  
  const {
    budget,
    timeReports,
    purchases,
    quotes,
    invoices,
    productCosts,
    supplierInvoices,
    bookingEconomics,
    summary,
    isLoading,
    saveBudget,
    addPurchase,
    removePurchase,
    addQuote,
    removeQuote,
    addInvoice,
    removeInvoice,
    updateInvoice,
    refetchProductCosts,
    refetchSupplierInvoices,
    linkSupplierInvoice,
  } = useProjectEconomy(projectId, bookingId);

  const handleExportExcel = () => {
    try {
      exportToExcel({
        projectName,
        budget: budget || null,
        timeReports,
        purchases,
        quotes,
        invoices,
        summary
      });
      toast.success('Exporterad till Excel (CSV)');
    } catch (error) {
      toast.error('Kunde inte exportera till Excel');
    }
  };

  const handleExportPDF = () => {
    try {
      exportToPDF({
        projectName,
        budget: budget || null,
        timeReports,
        purchases,
        quotes,
        invoices,
        summary
      });
    } catch (error) {
      toast.error('Kunde inte exportera till PDF');
    }
  };

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
      {/* Export buttons */}
      <div className="flex justify-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <FileText className="h-4 w-4 mr-2" />
              Exportera
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExportPDF}>
              <FileText className="h-4 w-4 mr-2" />
              Exportera till PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Exportera till Excel (CSV)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Offertunderlag från bokning */}
      {bookingEconomics && (
        <BookingEconomicsCard
          economics={bookingEconomics}
          label="Offertunderlag (från bokningsoffert)"
        />
      )}

      {/* Summary Card */}
      <EconomySummaryCard summary={summary} />

      {/* Product Costs (Budget basis) */}
      {productCosts && (
        <ProductCostsCard
          productCosts={productCosts}
          isLoading={isLoading}
          onRefresh={refetchProductCosts}
        />
      )}

      {/* Staff & Hours */}
      <StaffCostTable
        timeReports={timeReports}
        summary={summary}
        bookingId={bookingId}
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

      {/* Supplier Invoices (Fortnox) */}
      <SupplierInvoicesCard
        supplierInvoices={supplierInvoices}
        onRefresh={refetchSupplierInvoices}
        purchases={purchases}
        productCosts={productCosts}
        budget={budget || null}
        onLinkInvoice={linkSupplierInvoice}
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
