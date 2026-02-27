import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Lock, CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
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
import { ProjectEconomyTab } from '@/components/project/ProjectEconomyTab';
import { toast } from 'sonner';

const ProjectEconomyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [checklist, setChecklist] = useState([false, false, false]);

  const { data: project, isLoading } = useQuery({
    queryKey: ['project-economy-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, booking:bookings(id, client, eventdate)')
        .eq('id', id!)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id
  });

  const handleCloseProject = async () => {
    if (!project) return;
    setIsClosing(true);
    try {
      // Signal EventFlow before local status update
      if (project.booking_id) {
        const { markReadyForInvoicing } = await import('@/services/planningApiService');
        await markReadyForInvoicing(project.booking_id);
      }
      const { error } = await supabase
        .from('projects')
        .update({ status: 'completed' })
        .eq('id', project.id);
      if (error) throw error;
      toast.success(`${project.name} har markerats som avslutat`);
      queryClient.invalidateQueries({ queryKey: ['project-economy-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['economy-overview'] });
    } catch (err) {
      console.error('Close project error:', err);
      toast.error('Kunde inte signalera faktureringssystemet — försök igen');
    } finally {
      setIsClosing(false);
      setShowCloseDialog(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Projektet kunde inte hittas.</p>
      </div>
    );
  }

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/economy');
    }
  };

  const isClosed = project.status === 'completed';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={handleBack}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">Ekonomi: {project.name}</h1>
            <Badge variant="outline" className={
              isClosed
                ? "border-red-200 text-red-600 bg-red-50 text-[11px] px-2 py-0.5 font-medium"
                : "border-emerald-200 text-emerald-600 bg-emerald-50 text-[11px] px-2 py-0.5 font-medium"
            }>
              {isClosed ? 'STÄNGD' : 'ÖPPEN'}
            </Badge>
          </div>
          <p className="text-muted-foreground">Projektets ekonomiska översikt</p>
        </div>
        {!isClosed && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCloseDialog(true)}
          >
            <Lock className="h-4 w-4 mr-1.5" />
            Stäng projekt
          </Button>
        )}
      </div>

      {/* Economy Tab Content */}
      <ProjectEconomyTab 
        projectId={project.id} 
        projectName={project.name}
        bookingId={project.booking_id}
      />

      {/* Close project dialog with checklist */}
      <AlertDialog open={showCloseDialog} onOpenChange={(open) => {
        setShowCloseDialog(open);
        if (!open) setChecklist([false, false, false]);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stäng projekt</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Bekräfta följande innan du stänger <strong className="text-foreground">{project.name}</strong>:
                </p>
                <div className="space-y-2">
                  {[
                    'Är faktureringsinformationen korrekt och fullständig?',
                    'Är eventuella avdrag/tillägg uppdaterade?',
                    'Är samtliga kostnader hänförliga till projektet korrekta?',
                  ].map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      className="flex items-start gap-3 w-full text-left p-3 rounded-lg border transition-colors hover:bg-muted/50"
                      onClick={() => setChecklist(prev => {
                        const next = [...prev];
                        next[i] = !next[i];
                        return next;
                      })}
                    >
                      {checklist[i] ? (
                        <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0 mt-0.5" />
                      )}
                      <span className="text-sm text-foreground">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClosing}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCloseProject}
              disabled={isClosing || !checklist.every(Boolean)}
              className="disabled:opacity-50"
            >
              {isClosing ? 'Stänger...' : 'Markera som avslutat'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProjectEconomyDetail;
