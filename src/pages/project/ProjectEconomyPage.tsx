import { useOutletContext, useParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectEconomyTab } from "@/components/project/ProjectEconomyTab";
import { ProjectStaffTab } from "@/components/project/ProjectStaffTab";
import type { useProjectDetail } from "@/hooks/useProjectDetail";

const tabTriggerClass =
  "relative px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-primary font-medium transition-colors hover:text-foreground";

const ProjectEconomyPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const detail = useOutletContext<ReturnType<typeof useProjectDetail>>();
  const { project } = detail;

  if (!project) return null;

  return (
    <div className="space-y-6">
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
    </div>
  );
};

export default ProjectEconomyPage;
