import React, { useState } from 'react';
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
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { useEconomyDashboard } from '@/hooks/useEconomyDashboard';
import type { EconomyProjectInsight } from '@/types/economyOverview';
import CompletedProjectsList from '@/components/economy/CompletedProjectsList';
import ProjectLeaderActionBoard from '@/components/economy/ProjectLeaderActionBoard';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const ProjectEconomyDashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const [closingProject, setClosingProject] = useState<EconomyProjectInsight | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const {
    isLoading,
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

  return (
    <div className="space-y-6">
      {/* Project list with phase tabs */}
      <CompletedProjectsList projectInsights={projectInsights} />

      {/* Action Board — primary workspace */}
      <ProjectLeaderActionBoard projectInsights={projectInsights} />

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

const EconomyOverview: React.FC = () => {
  return (
    <PageContainer theme="purple">
      <PageHeader
        icon={Banknote}
        variant="purple"
        title="Projektöversikt"
        subtitle="Kontrolltorn · Kostnader · Attest"
      />

      <div className="mt-4">
        <ProjectEconomyDashboard />
      </div>
    </PageContainer>
  );
};

export default EconomyOverview;
