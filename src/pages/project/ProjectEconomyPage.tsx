import { useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectEconomyTab } from "@/components/project/ProjectEconomyTab";
import { ProjectStaffTab } from "@/components/project/ProjectStaffTab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, CheckCircle2, Circle, Unlock, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { useProjectDetail } from "@/hooks/useProjectDetail";

const tabTriggerClass =
  "relative px-5 py-3.5 rounded-none border-b-[3px] border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-foreground/60 data-[state=active]:text-primary text-base font-semibold transition-colors hover:text-foreground";

const ProjectEconomyPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const detail = useOutletContext<ReturnType<typeof useProjectDetail>>();
  const { project } = detail;
  const queryClient = useQueryClient();
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [checklist, setChecklist] = useState([false, false, false]);

  if (!project) return null;

  const isClosed = project.status === 'completed';

  const handleReopenProject = async () => {
    setIsReopening(true);
    try {
      if (project.booking_id) {
        const { reopenBookingsInInvoicing } = await import('@/services/bookingCloseSyncService');
        const result = await reopenBookingsInInvoicing([project.booking_id]);
        if (result.failedIds.length > 0) {
          toast.error('Kunde inte återöppna i Booking — projektet förblir stängt');
          setIsReopening(false);
          return;
        }
      }
      const { error } = await supabase
        .from('projects')
        .update({ status: 'delivered' })
        .eq('id', project.id);
      if (error) throw error;
      toast.success(`${project.name} har återöppnats`);
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] });
      queryClient.invalidateQueries({ queryKey: ['economy-overview'] });
    } catch (err) {
      console.error('Reopen project error:', err);
      toast.error('Kunde inte återöppna projektet');
    } finally {
      setIsReopening(false);
    }
  };

  const handleCloseProject = async () => {
    setIsClosing(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({ status: 'completed' })
        .eq('id', project.id);
      if (error) throw error;

      if (project.booking_id) {
        try {
          const { markReadyForInvoicing } = await import('@/services/planningApiService');
          await markReadyForInvoicing(project.booking_id);
        } catch (syncErr) {
          console.warn('External sync failed (non-blocking):', syncErr);
          toast.warning('Projektet stängt lokalt, men synk misslyckades.');
        }
      }

      toast.success(`${project.name} har markerats som avslutat`);
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] });
      queryClient.invalidateQueries({ queryKey: ['economy-overview'] });
    } catch (err) {
      console.error('Close project error:', err);
      toast.error('Kunde inte stänga projektet — inga ändringar sparade');
    } finally {
      setIsClosing(false);
      setShowCloseDialog(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status + Close button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={
            isClosed
              ? "border-red-200 text-red-600 bg-red-50 text-[11px] px-2 py-0.5 font-medium"
              : "border-primary/30 text-primary bg-primary/5 text-[11px] px-2 py-0.5 font-medium"
          }>
            {isClosed ? 'STÄNGD' : 'ÖPPEN'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isClosed && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReopenProject}
              disabled={isReopening}
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              {isReopening ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Återöppnar...</>
              ) : (
                <><Unlock className="h-4 w-4 mr-1.5" /> Återöppna</>
              )}
            </Button>
          )}
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
      </div>

      <Tabs defaultValue="economy" className="space-y-6">
        <div className="border-b border-border/40 overflow-x-auto">
          <TabsList className="h-auto p-0 bg-transparent gap-0">
            <TabsTrigger value="economy" className={tabTriggerClass}>
              Ekonomi
            </TabsTrigger>
            <TabsTrigger value="staff" className={tabTriggerClass}>
              Personal
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="economy">
          <ProjectEconomyTab
            projectId={projectId || ""}
            projectName={project.name}
            bookingId={project.booking_id}
          />
        </TabsContent>

        <TabsContent value="staff">
          <ProjectStaffTab
            projectId={projectId || ""}
            bookingId={project.booking_id}
          />
        </TabsContent>
      </Tabs>

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

export default ProjectEconomyPage;
