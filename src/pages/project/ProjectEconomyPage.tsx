import { useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectEconomyTab } from "@/components/project/ProjectEconomyTab";
import { ProjectStaffTab } from "@/components/project/ProjectStaffTab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Unlock, Loader2 } from "lucide-react";
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
  const [isReopening, setIsReopening] = useState(false);

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

  return (
    <div className="space-y-6">
      {/* Status + Reopen button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={
            isClosed
              ? "border-destructive/30 text-destructive bg-destructive/5 text-[11px] px-2 py-0.5 font-medium"
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
          {/* Project closure is handled exclusively via ProjectEconomyTab's validated flow */}
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
            largeProjectId={project.booking?.large_project_id ?? null}
            isInternal={(project as any).is_internal}
            locationId={(project as any).location_id}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProjectEconomyPage;
