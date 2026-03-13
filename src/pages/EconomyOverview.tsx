import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Banknote } from 'lucide-react';
import { useEconomyOverviewData, type ProjectWithEconomy } from '@/hooks/useEconomyOverviewData';
import { useEconomyDashboard, type EnrichedProject } from '@/hooks/useEconomyDashboard';
import { StaffEconomyView } from '@/components/economy/StaffEconomyView';
import EconomyKpiCards from '@/components/economy/EconomyKpiCards';
import EconomyInvoicingQueue from '@/components/economy/EconomyInvoicingQueue';
import EconomyCompletedProjects from '@/components/economy/EconomyCompletedProjects';
import EconomyForecastPanel from '@/components/economy/EconomyForecastPanel';
import EconomyRiskList from '@/components/economy/EconomyRiskList';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const EconomyTimeReportsContent = React.lazy(() => import('@/pages/EconomyTimeReports'));

const ProjectEconomyDashboard: React.FC = () => {
  const { data: projectsWithEconomy, isLoading } = useEconomyOverviewData();
  const queryClient = useQueryClient();
  const [closingProject, setClosingProject] = useState<EnrichedProject | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const { kpis, forecasts, risks, invoicingQueue, completedProjects } = useEconomyDashboard(projectsWithEconomy);

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
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. TOP KPI ROW */}
      <EconomyKpiCards kpis={kpis} />

      {/* 2. INVOICING CENTER */}
      <EconomyInvoicingQueue
        readyForInvoicing={invoicingQueue.readyForInvoicing}
        partiallyInvoiced={invoicingQueue.partiallyInvoiced}
        completedNotInvoiced={invoicingQueue.completedNotInvoiced}
        onCloseProject={setClosingProject}
      />

      {/* 3. FORECASTS + RISK SIDE BY SIDE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EconomyForecastPanel forecasts={forecasts} />
        <EconomyRiskList risks={risks} />
      </div>

      {/* 4. COMPLETED PROJECTS */}
      <EconomyCompletedProjects projects={completedProjects} />

      {/* Close project dialog */}
      <AlertDialog open={!!closingProject} onOpenChange={() => setClosingProject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stäng projekt</AlertDialogTitle>
            <AlertDialogDescription>
              Vill du markera <strong>{closingProject?.name}</strong> som avslutat? Projektet kommer fortfarande synas i listan men markeras som stängt.
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 py-8 max-w-[1600px]">
        {/* Premium Header */}
        <div className="relative mb-8">
          <div className="absolute inset-0 -z-10 overflow-hidden rounded-3xl">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-primary/3 rounded-full blur-2xl" />
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 p-6 rounded-2xl bg-gradient-to-r from-card/80 via-card to-card/80 backdrop-blur-sm border border-border/50 shadow-lg">
            <div className="flex items-center gap-4">
              <div 
                className="relative p-3.5 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg"
                style={{ boxShadow: '0 8px 32px hsl(var(--primary) / 0.3)' }}
              >
                <Banknote className="h-7 w-7 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  Ekonomiskt kontrollcenter
                </h1>
                <p className="text-muted-foreground mt-0.5">
                  Ledningsöverblick · Fakturering · Prognoser · Risk
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabbed content */}
        <Tabs defaultValue="projects" className="space-y-6">
          <div className="rounded-xl border border-border/40 bg-card px-2 py-1" style={{ boxShadow: '0 1px 3px hsl(200 15% 15% / 0.04)' }}>
            <TabsList className="h-auto p-0 bg-transparent gap-0 w-full grid grid-cols-3">
              <TabsTrigger value="projects" className={tabTriggerClass}>
                Kontrollcenter
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
