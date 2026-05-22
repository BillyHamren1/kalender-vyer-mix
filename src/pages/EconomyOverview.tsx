import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Banknote, ChevronDown, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { useEconomyDashboard } from '@/hooks/useEconomyDashboard';
import type { EconomyProjectInsight } from '@/types/economyOverview';
import { StaffEconomyView } from '@/components/economy/StaffEconomyView';
import EconomyKpiCards from '@/components/economy/EconomyKpiCards';
import EconomyTBAnalysis from '@/components/economy/EconomyTBAnalysis';
import BillingSection from '@/components/economy/billing/BillingSection';
import ProjectLeaderActionBoard from '@/components/economy/ProjectLeaderActionBoard';
import CompletedProjectsList from '@/components/economy/CompletedProjectsList';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const EconomyTimeReportsContent = React.lazy(() => import('@/pages/EconomyTimeReports'));

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

const ProjectEconomyDashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const [closingProject, setClosingProject] = useState<EconomyProjectInsight | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const {
    isLoading,
    dashboardSummary,
    projectInsights,
  } = useEconomyDashboard();

  const handleCloseProject = async () => {
    if (!closingProject) return;
    setIsClosing(true);
    try {
      if (closingProject.booking_id) {
        const { markReadyForInvoicing } = await import('@/services/planningApiService');
        await markReadyForInvoicing(closingProject.booking_id);
      }
      const { error } = await supabase
        .from('projects')
        .update({ status: 'completed' })
        .eq('id', closingProject.id);
      if (error) throw error;
      toast.success(`${closingProject.name} har markerats som avslutat`);
      queryClient.invalidateQueries({ queryKey: ['economy-overview'] });
    } catch (err) {
      console.error('Close project error:', err);
      toast.error('Kunde inte signalera faktureringssystemet — försök igen');
    } finally {
      setIsClosing(false);
      setClosingProject(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <div className="rounded-xl border border-border/40 bg-card p-6 text-center">
          <p className="text-sm font-medium text-foreground">Hämtar ekonomidata…</p>
          <p className="text-xs text-muted-foreground mt-1">
            Synkar mot bokningssystemet (kan ta upp till en minut första gången).
          </p>
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const s = dashboardSummary;

  return (
    <div className="space-y-6">
      {/* A. Quick summary counters — Planning premium KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="planning-stat-card">
          <p className="text-[10px] font-bold text-[hsl(280_45%_38%)] uppercase tracking-[0.08em]">Aktiva projekt</p>
          <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{s.ongoingCount + s.upcomingCount}</p>
          <p className="text-[10.5px] text-muted-foreground mt-0.5">{s.ongoingCount} pågående · {s.upcomingCount} kommande</p>
        </div>
        <div className="planning-stat-card">
          <p className="text-[10px] font-bold text-[hsl(280_45%_38%)] uppercase tracking-[0.08em]">Snittmarginal</p>
          <p className={cn(
            'text-2xl font-bold mt-1 tabular-nums',
            s.projectedMarginPercent >= 15 ? 'text-emerald-600' :
            s.projectedMarginPercent >= 5 ? 'text-amber-600' : 'text-red-600'
          )}>
            {s.projectedMarginPercent.toFixed(0)}%
          </p>
          <p className="text-[10.5px] text-muted-foreground mt-0.5">över alla projekt</p>
        </div>
        <div className="planning-stat-card">
          <p className="text-[10px] font-bold text-[hsl(280_45%_38%)] uppercase tracking-[0.08em]">Redo att fakturera</p>
          <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{formatCurrency(s.readyToInvoiceAmount)}</p>
          <p className="text-[10.5px] text-muted-foreground mt-0.5">{s.readyForInvoicingCount} projekt</p>
        </div>
        <div
          className={cn(
            'planning-stat-card',
            s.riskProjectCount > 0 && 'border-destructive/40 bg-gradient-to-b from-white to-red-50/40',
          )}
        >
          <p className={cn(
            'text-[10px] font-bold uppercase tracking-[0.08em]',
            s.riskProjectCount > 0 ? 'text-destructive' : 'text-[hsl(280_45%_38%)]',
          )}>Riskprojekt</p>
          <p className={cn('text-2xl font-bold mt-1 tabular-nums', s.riskProjectCount > 0 ? 'text-destructive' : 'text-foreground')}>
            {s.riskProjectCount}
          </p>
          <p className="text-[10.5px] text-muted-foreground mt-0.5">{s.completedNotFullyInvoicedCount} avslutade ej stängda</p>
        </div>
      </div>

      {/* B. Slutförda projekt — kräver utvärdering, äldsta överst */}
      <CompletedProjectsList projectInsights={projectInsights} />

      {/* C. Action Board — primary workspace */}
      <ProjectLeaderActionBoard projectInsights={projectInsights} />

      {/* C. Analytics — collapsible secondary section */}
      <Collapsible open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between gap-2 px-3 py-2 h-auto text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Nyckeltal & Marginalanalys
            </div>
            <ChevronDown className={cn('h-4 w-4 transition-transform', analyticsOpen && 'rotate-180')} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-6 pt-2">
          <EconomyKpiCards summary={dashboardSummary} />
          <EconomyTBAnalysis projects={projectInsights} />
        </CollapsibleContent>
      </Collapsible>

      {/* Close project dialog */}
      <AlertDialog open={!!closingProject} onOpenChange={() => setClosingProject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stäng projekt</AlertDialogTitle>
            <AlertDialogDescription>
              Vill du markera <strong>{closingProject?.name}</strong> som avslutat?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClosing}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleCloseProject} disabled={isClosing}>
              {isClosing ? 'Stänger...' : 'Markera som avslutat'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const tabTriggerClass =
  "relative px-4 py-3 rounded-none border-b-2 border-transparent " +
  "data-[state=active]:border-[hsl(270_50%_55%)] data-[state=active]:bg-transparent data-[state=active]:shadow-none " +
  "bg-transparent text-muted-foreground data-[state=active]:text-[hsl(280_55%_30%)] " +
  "font-semibold text-[13px] tracking-tight transition-colors hover:text-[hsl(280_45%_35%)]";

const EconomyOverview: React.FC = () => {
  return (
    <PageContainer theme="purple">
      <PageHeader
        icon={Banknote}
        variant="purple"
        title="Projektöversikt"
        subtitle="Kontrolltorn · Kostnader · Attest · Överlämning"
      />

      {/* Tabbed content */}
      <Tabs defaultValue="projects" className="space-y-6 mt-4">
        <div className="planning-card px-2 py-1">
          <TabsList className="h-auto p-0 bg-transparent gap-0 w-full grid grid-cols-4">
            <TabsTrigger value="projects" className={tabTriggerClass}>
              Kontrollcenter
            </TabsTrigger>
            <TabsTrigger value="billing" className={tabTriggerClass}>
              Överlämning & status
            </TabsTrigger>
            <TabsTrigger value="staff" className={tabTriggerClass}>
              Personal
            </TabsTrigger>
            <TabsTrigger value="time-reports" className={tabTriggerClass}>
              Utlägg
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="projects">
          <ProjectEconomyDashboard />
        </TabsContent>

        <TabsContent value="billing">
          <BillingSection />
        </TabsContent>

        <TabsContent value="staff">
          <StaffEconomyView />
        </TabsContent>

        <TabsContent value="time-reports">
          <React.Suspense fallback={<Skeleton className="h-96" />}>
            <EconomyTimeReportsContent />
          </React.Suspense>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
};

export default EconomyOverview;
