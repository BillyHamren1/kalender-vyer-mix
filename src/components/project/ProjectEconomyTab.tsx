import { useState, useMemo } from 'react';
import { FileSpreadsheet, FileText, AlertTriangle, Clock, CheckCircle2, Lock, TrendingDown, ArrowRight, DollarSign, BarChart3 } from 'lucide-react';
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
import { TimeApprovalSummary } from './TimeApprovalSummary';
import { ProjectClosureDialog } from './ProjectClosureDialog';
import BookingEconomicsCard from '@/components/booking/BookingEconomicsCard';

import BillingStatusBadge from '@/components/economy/billing/BillingStatusBadge';
import { useSupplierInvoiceAttestations, getAttestationCounts } from '@/hooks/useSupplierInvoiceAttestation';
import { useProjectBillingList, useCreateProjectBilling, useAdvanceBillingStatus } from '@/hooks/useProjectBilling';
import {
  computeProjectEconomySignals,
  
  type ProjectEconomyInput,
  type SignalLevel,
} from '@/lib/economy/projectEconomyStatus';
import { exportToExcel, exportToPDF } from '@/services/projectEconomyExportService';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

const signalDot = (level: SignalLevel) => {
  const colors: Record<SignalLevel, string> = {
    ok: 'bg-primary',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
    neutral: 'bg-muted-foreground/30',
  };
  return <span className={cn('inline-block w-2 h-2 rounded-full shrink-0', colors[level])} />;
};

interface ProjectEconomyTabProps {
  projectId: string;
  projectName?: string;
  bookingId: string | null;
}

export const ProjectEconomyTab = ({ projectId, projectName = 'Projekt', bookingId }: ProjectEconomyTabProps) => {
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [closureDialogOpen, setClosureDialogOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const queryClient = useQueryClient();
  
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
    hasBooking,
    saveBudget,
    addPurchase,
    updatePurchase,
    removePurchase,
    addQuote,
    removeQuote,
    addInvoice,
    removeInvoice,
    updateInvoice,
    refetchProductCosts,
    refetchSupplierInvoices,
    linkSupplierInvoice,
    costOverrides,
    updateProductCost,
    resetProductCost,
  } = useProjectEconomy(projectId, bookingId);

  const { data: attestations = [] } = useSupplierInvoiceAttestations(bookingId);
  const attestCounts = useMemo(() => getAttestationCounts(attestations), [attestations]);

  const { data: billingItems = [] } = useProjectBillingList();
  const billingRecord = useMemo(() => billingItems.find(b => b.project_id === projectId), [billingItems, projectId]);
  const createBilling = useCreateProjectBilling();
  const advanceBilling = useAdvanceBillingStatus();

  // Time report counts
  const timeReportCounts = useMemo(() => {
    const allDetailed = timeReports.flatMap(r => r.detailed_reports || []);
    return {
      total: allDetailed.length,
      approved: allDetailed.filter(r => r.approved).length,
      pending: allDetailed.filter(r => !r.approved).length,
    };
  }, [timeReports]);

  // Shared signals model
  const economyInput: ProjectEconomyInput = useMemo(() => ({
    summary,
    attestCounts,
    billingStatus: billingRecord?.billing_status ?? null,
    budgetedHours: budget?.budgeted_hours || 0,
    hourlyRate: budget?.hourly_rate || 0,
    timeReportsApproved: timeReportCounts.pending === 0,
    hasRecentEconomyData: true,
    timeReportCounts,
  }), [summary, attestCounts, billingRecord, budget, timeReportCounts]);

  const signals = useMemo(() => computeProjectEconomySignals(economyInput), [economyInput]);
  

  const { revenue, totalCost } = signals;
  const margin = signals.margin.marginPercent;
  const marginAmount = signals.margin.marginAmount;

  // Close project handler — ordered: validate → billing → mark closed → external sync
  const handleCloseProject = async (notes?: string) => {
    setIsClosing(true);
    try {
      // ── A. Validate blockers (re-check at execution time, not just UI) ──
      if (!signals.closure.canClose) {
        toast.error(`Projektet kan inte stängas — ${signals.closure.blockerCount} blockerare kvarstår`);
        setIsClosing(false);
        return;
      }

      // ── B. Create or update project_billing with final economy snapshot ──
      const billingPayload = {
        project_id: projectId,
        project_type: 'medium',
        project_name: projectName,
        invoiceable_amount: revenue,
        total_cost: totalCost,
        booking_id: bookingId ?? undefined,
      };

      if (billingRecord) {
        // Always update to reflect final state at close time
        const { error: billingErr } = await supabase
          .from('project_billing')
          .update({
            invoiceable_amount: revenue,
            total_cost: totalCost,
            billing_status: 'ready_for_handover',
            closed_at: new Date().toISOString(),
            review_status: 'approved',
            review_completed_at: new Date().toISOString(),
            approved_for_invoicing_at: new Date().toISOString(),
            internal_notes: notes || billingRecord.internal_notes,
          } as any)
          .eq('id', billingRecord.id);
        if (billingErr) throw billingErr;
      } else {
        await createBilling.mutateAsync(billingPayload);
      }

      // ── C. Mark project as closed locally ──
      const { error: projectErr } = await supabase
        .from('projects')
        .update({ status: 'completed' })
        .eq('id', projectId);
      if (projectErr) throw projectErr;

      // ── D. Only after local success: send external sync signal ──
      if (bookingId) {
        try {
          const { markReadyForInvoicing } = await import('@/services/planningApiService');
          await markReadyForInvoicing(bookingId);
        } catch (syncErr) {
          // External sync failure is non-fatal — project is closed locally
          console.warn('External sync failed (non-blocking):', syncErr);
          toast.warning('Projektet stängt lokalt, men synk till bokningssystemet misslyckades. Försök igen senare.');
        }
      }

      toast.success(`${projectName} har markerats som avslutat`);
      queryClient.invalidateQueries({ queryKey: ['economy-overview'] });
      queryClient.invalidateQueries({ queryKey: ['project-billing'] });
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] });
    } catch (err) {
      console.error('Close project error:', err);
      toast.error('Kunde inte stänga projektet — inga ändringar sparade');
    } finally {
      setIsClosing(false);
      setClosureDialogOpen(false);
    }
  };

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
    <div className="space-y-5">
      {/* ─── A. Financial summary ─── */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Intäkt</p>
            </div>
            <p className="text-xl font-bold text-foreground">{formatCurrency(revenue)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total kostnad</p>
            </div>
            <p className="text-xl font-bold text-foreground">{formatCurrency(totalCost)}</p>
          </CardContent>
        </Card>
        <Card className={cn('border-border/40', signals.margin.level === 'warning' && 'border-amber-200/60 dark:border-amber-800/40', signals.margin.level === 'danger' && 'border-red-200/60 dark:border-red-800/40')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">TB / Marginal</p>
            </div>
            <p className={cn(
              'text-xl font-bold',
              signals.margin.level === 'ok' ? 'text-teal-600' :
              signals.margin.level === 'warning' ? 'text-amber-600' :
              signals.margin.level === 'danger' ? 'text-red-600' : 'text-foreground'
            )}>
              {formatCurrency(marginAmount)} ({margin.toFixed(0)}%)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── B. Status signals row ─── */}
      <Card className="border-border/40">
        <CardContent className="p-3">
          <div className="flex items-center gap-4 flex-wrap text-xs">
            {/* Time status */}
            <div className="flex items-center gap-1.5">
              {signalDot(signals.time.level)}
              <span className="text-foreground font-medium">{signals.time.label}</span>
              {signals.time.detail && <span className="text-muted-foreground">({signals.time.detail})</span>}
            </div>
            
            <span className="text-border">|</span>

            {/* Supplier invoice status */}
            <div className="flex items-center gap-1.5">
              {signalDot(signals.supplierInvoice.level)}
              <span className="text-foreground font-medium">{signals.supplierInvoice.label}</span>
              {signals.supplierInvoice.detail && <span className="text-muted-foreground">({signals.supplierInvoice.detail})</span>}
            </div>
            
            <span className="text-border">|</span>

            {/* Cost status */}
            <div className="flex items-center gap-1.5">
              {signalDot(signals.cost.level)}
              <span className="text-foreground font-medium">{signals.cost.label}</span>
            </div>

            <span className="text-border">|</span>

            {/* Closure status */}
            <div className="flex items-center gap-1.5">
              {signalDot(signals.closure.level)}
              <span className="text-foreground font-medium">{signals.closure.label}</span>
              {signals.closure.blockerCount > 0 && (
                <span className="text-muted-foreground">({signals.closure.blockerCount} blockerare)</span>
              )}
            </div>

            {/* Billing status badge */}
            {billingRecord && (
              <div className="ml-auto">
                <BillingStatusBadge status={billingRecord.billing_status} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── C. Action buttons ─── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={signals.closure.canClose ? 'default' : 'outline'}
          size="sm"
          className={cn('gap-1.5', signals.closure.canClose && 'bg-teal-600 hover:bg-teal-700')}
          onClick={() => setClosureDialogOpen(true)}
        >
          {signals.closure.canClose ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <Lock className="h-3.5 w-3.5" />
          )}
          {signals.closure.canClose ? 'Stäng projekt' : 'Stängningskontroll'}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
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

      {/* ─── D. Time Approval Summary ─── */}
      <TimeApprovalSummary timeReports={timeReports} />


      {/* ─── F. Offertunderlag från bokning ─── */}
      {bookingEconomics && (
        <BookingEconomicsCard
          economics={bookingEconomics}
          label="Ordervärde (från bokning)"
        />
      )}

      {/* ─── G. Projektresultat - Utfall ─── */}
      <EconomySummaryCard summary={summary} bookingEconomics={bookingEconomics} />

      {/* ─── H. Product Costs ─── */}
      {productCosts && (
        <ProductCostsCard
          productCosts={productCosts}
          isLoading={isLoading}
          onRefresh={refetchProductCosts}
          supplierInvoices={supplierInvoices}
          costOverrides={costOverrides}
          onUpdateProductCost={updateProductCost}
          onResetProductCost={resetProductCost}
        />
      )}

      {/* Budget vs Utfall */}
      <CostComparisonCard
        productCosts={productCosts ?? null}
        staffActual={summary.staffActual}
        supplierInvoices={supplierInvoices}
        purchases={purchases}
      />

      {/* ─── I. Tabbed detail sections ─── */}
      <Tabs defaultValue="supplier" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="supplier" className="relative">
            Leverantörsfakturor
            {attestCounts.unattested > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[9px] px-1 py-0 h-3.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                {attestCounts.unattested}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="staff">Personal & Timmar</TabsTrigger>
          <TabsTrigger value="purchases">Inköp</TabsTrigger>
          <TabsTrigger value="quotes">Offerter & Fakturor</TabsTrigger>
        </TabsList>

        <TabsContent value="supplier">
          <SupplierInvoicesCard
            supplierInvoices={supplierInvoices}
            onRefresh={refetchSupplierInvoices}
            purchases={purchases}
            productCosts={productCosts}
            onLinkInvoice={linkSupplierInvoice}
            bookingId={bookingId}
            projectRevenue={revenue}
          />
        </TabsContent>

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
      </Tabs>

      {/* Budget Settings Dialog */}
      <BudgetSettingsDialog
        open={budgetDialogOpen}
        onOpenChange={setBudgetDialogOpen}
        currentBudget={budget || null}
        onSave={saveBudget}
      />

      {/* Closure Dialog */}
      <ProjectClosureDialog
        open={closureDialogOpen}
        onOpenChange={setClosureDialogOpen}
        projectName={projectName}
        
        canClose={signals.closure.canClose}
        isClosing={isClosing}
        onClose={handleCloseProject}
      />
    </div>
  );
};
