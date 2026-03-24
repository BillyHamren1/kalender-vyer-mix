import { useState, useMemo } from 'react';
import { FileSpreadsheet, FileText, AlertTriangle, ArrowRight } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useProjectEconomy } from '@/hooks/useProjectEconomy';
import { EconomySummaryCard } from './EconomySummaryCard';
import { StaffCostTable } from './StaffCostTable';
import { PurchasesList } from './PurchasesList';
import { QuotesInvoicesList } from './QuotesInvoicesList';
import { BudgetSettingsDialog } from './BudgetSettingsDialog';
import { ProductCostsCard } from './ProductCostsCard';
import { CostComparisonCard } from './CostComparisonCard';
import { SupplierInvoicesCard } from './SupplierInvoicesCard';
import BookingEconomicsCard from '@/components/booking/BookingEconomicsCard';
import { ProjectClosureGate } from '@/components/economy/ProjectClosureGate';
import BillingStatusBadge from '@/components/economy/billing/BillingStatusBadge';
import { useSupplierInvoiceAttestations, getAttestationCounts } from '@/hooks/useSupplierInvoiceAttestation';
import { useProjectBillingList } from '@/hooks/useProjectBilling';
import {
  computeProjectEconomySignals,
  buildGateItemsFromSignals,
  type ProjectEconomyInput,
} from '@/lib/economy/projectEconomyStatus';
import { exportToExcel, exportToPDF } from '@/services/projectEconomyExportService';
import { toast } from 'sonner';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

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

  const { data: attestations = [] } = useSupplierInvoiceAttestations(bookingId);
  const attestCounts = useMemo(() => getAttestationCounts(attestations), [attestations]);

  const { data: billingItems = [] } = useProjectBillingList();
  const billingRecord = useMemo(() => {
    return billingItems.find(b => b.project_id === projectId);
  }, [billingItems, projectId]);

  // Shared signals model
  const economyInput: ProjectEconomyInput = useMemo(() => ({
    summary,
    attestCounts,
    billingStatus: billingRecord?.billing_status ?? null,
    budgetedHours: budget?.budgeted_hours || 0,
    hourlyRate: budget?.hourly_rate || 0,
    timeReportsApproved: true,
    hasRecentEconomyData: true,
  }), [summary, attestCounts, billingRecord, budget]);

  const signals = useMemo(() => computeProjectEconomySignals(economyInput), [economyInput]);
  const closureGates = useMemo(() => buildGateItemsFromSignals(signals), [signals]);

  const { revenue, totalCost } = signals;
  const margin = signals.margin.marginPercent;

  const hasBlockers = !signals.closure.canClose;

  const handleExportExcel = () => {
    try {
      exportToExcel({ projectName, budget: budget || null, timeReports, purchases, quotes, invoices, summary });
      toast.success('Exporterad till Excel (CSV)');
    } catch { toast.error('Kunde inte exportera'); }
  };

  const handleExportPDF = () => {
    try {
      exportToPDF({ projectName, budget: budget || null, timeReports, purchases, quotes, invoices, summary });
    } catch { toast.error('Kunde inte exportera'); }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border/40">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Intäkt</p>
            <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(revenue)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total kostnad</p>
            <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(totalCost)}</p>
          </CardContent>
        </Card>
        <Card className={cn('border-border/40', margin < 10 && 'border-amber-200/60 dark:border-amber-800/40')}>
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">TB / Marginal</p>
            <p className={cn(
              'text-xl font-bold mt-1',
              margin >= 20 ? 'text-green-600' : margin >= 10 ? 'text-foreground' : 'text-amber-600'
            )}>
              {formatCurrency(revenue - totalCost)} ({margin.toFixed(0)}%)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action indicators */}
      <div className="flex items-center gap-3 flex-wrap">
        {attestCounts.unattested > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-md px-2.5 py-1.5 border border-amber-200/60 dark:border-amber-800/40">
            <AlertTriangle className="h-3 w-3" />
            {attestCounts.unattested} oattesterade levfakturor
          </div>
        )}
        {attestCounts.imported > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-sky-600 bg-sky-50 dark:bg-sky-950/20 rounded-md px-2.5 py-1.5 border border-sky-200/60 dark:border-sky-800/40">
            <FileText className="h-3 w-3" />
            {attestCounts.imported} nya kostnader
          </div>
        )}
        {billingRecord && (
          <div className="flex items-center gap-1.5 ml-auto">
            <BillingStatusBadge status={billingRecord.billing_status} />
          </div>
        )}
      </div>

      {/* Closure gate (show if project has billing record) */}
      {billingRecord && (
        <ProjectClosureGate gates={closureGates} />
      )}

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

      {/* Projektresultat - Utfall */}
      <EconomySummaryCard summary={summary} bookingEconomics={bookingEconomics} />

      {/* Product Costs */}
      {productCosts && (
        <ProductCostsCard
          productCosts={productCosts}
          isLoading={isLoading}
          onRefresh={refetchProductCosts}
          supplierInvoices={supplierInvoices}
        />
      )}

      {/* Budget vs Utfall */}
      <CostComparisonCard
        productCosts={productCosts ?? null}
        staffActual={summary.staffActual}
        supplierInvoices={supplierInvoices}
        purchases={purchases}
      />

      {/* Tabbed sections */}
      <Tabs defaultValue="staff" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="staff">Personal & Timmar</TabsTrigger>
          <TabsTrigger value="purchases">Inköp</TabsTrigger>
          <TabsTrigger value="quotes">Offerter & Fakturor</TabsTrigger>
          <TabsTrigger value="supplier" className="relative">
            Leverantörsfakturor
            {attestCounts.unattested > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[9px] px-1 py-0 h-3.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                {attestCounts.unattested}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="staff">
          <StaffCostTable
            timeReports={timeReports}
            summary={summary}
            bookingId={bookingId}
            onOpenBudgetSettings={() => setBudgetDialogOpen(true)}
          />
        </TabsContent>

        <TabsContent value="purchases">
          <PurchasesList
            purchases={purchases}
            projectId={projectId}
            totalAmount={summary.purchasesTotal}
            onAddPurchase={addPurchase}
            onRemovePurchase={removePurchase}
            supplierInvoices={supplierInvoices}
          />
        </TabsContent>

        <TabsContent value="quotes">
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
        </TabsContent>

        <TabsContent value="supplier">
          <SupplierInvoicesCard
            supplierInvoices={supplierInvoices}
            onRefresh={refetchSupplierInvoices}
            purchases={purchases}
            productCosts={productCosts}
            onLinkInvoice={linkSupplierInvoice}
            bookingId={bookingId}
          />
        </TabsContent>
      </Tabs>

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
