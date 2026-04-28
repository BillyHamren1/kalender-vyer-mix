import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const s = dashboardSummary;

  return (
    <div className="space-y-6">
      {/* A. Quick summary counters — compact */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/40">
          <CardContent className="p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Aktiva projekt</p>
            <p className="text-2xl font-bold text-foreground mt-1">{s.ongoingCount + s.upcomingCount}</p>
            <p className="text-[10px] text-muted-foreground">{s.ongoingCount} pågående · {s.upcomingCount} kommande</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Snittmarginal</p>
            <p className={cn(
              'text-2xl font-bold mt-1',
              s.projectedMarginPercent >= 15 ? 'text-green-600' :
              s.projectedMarginPercent >= 5 ? 'text-amber-600' : 'text-red-600'
            )}>
              {s.projectedMarginPercent.toFixed(0)}%
            </p>
            <p className="text-[10px] text-muted-foreground">över alla projekt</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Redo att fakturera</p>
            <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(s.readyToInvoiceAmount)}</p>
            <p className="text-[10px] text-muted-foreground">{s.readyForInvoicingCount} projekt</p>
          </CardContent>
        </Card>
        <Card className={cn('border-border/40', s.riskProjectCount > 0 && 'border-destructive/30')}>
          <CardContent className="p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Riskprojekt</p>
            <p className={cn('text-2xl font-bold mt-1', s.riskProjectCount > 0 ? 'text-destructive' : 'text-foreground')}>
              {s.riskProjectCount}
            </p>
            <p className="text-[10px] text-muted-foreground">{s.completedNotFullyInvoicedCount} avslutade ej stängda</p>
          </CardContent>
        </Card>
      </div>

      {/* B. Action Board — primary workspace */}
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
  "relative px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-primary font-medium transition-colors hover:text-foreground";

const EconomyOverview: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 theme-purple">
      <div className="container mx-auto px-4 py-8 max-w-[1600px]">
        {/* Header */}
        <div className="relative mb-8">
          <div className="absolute inset-0 -z-10 overflow-hidden rounded-3xl">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-primary/3 rounded-full blur-2xl" />
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 p-6 rounded-2xl bg-gradient-to-r from-card/80 via-card to-card/80 backdrop-blur-sm border border-border/50 shadow-lg">
            <div className="flex items-center gap-4">
              <div 
                className="relative p-3.5 rounded-2xl shadow-lg"
                style={{ background: 'var(--gradient-icon)', boxShadow: '0 8px 32px hsl(var(--primary) / 0.3)' }}
              >
                <Banknote className="h-7 w-7 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  Projektutvärdering
                </h1>
                <p className="text-muted-foreground mt-0.5">
                  Kontrolltorn · Kostnader · Attest · Överlämning
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabbed content */}
        <Tabs defaultValue="projects" className="space-y-6">
          <div className="rounded-xl border border-border/40 bg-card px-2 py-1" style={{ boxShadow: '0 1px 3px hsl(200 15% 15% / 0.04)' }}>
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
      </div>
    </div>
  );
};

export default EconomyOverview;
