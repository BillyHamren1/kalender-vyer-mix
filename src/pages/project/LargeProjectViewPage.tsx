import { useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProjectOverviewHeader from "@/components/project/ProjectOverviewHeader";
import ProjectTaskList from "@/components/project/ProjectTaskList";
import ProjectFiles from "@/components/project/ProjectFiles";
import ProjectComments from "@/components/project/ProjectComments";
import ProjectTransportWidget from "@/components/project/ProjectTransportWidget";
import LargeProjectProductsOverview from "@/components/project/LargeProjectProductsOverview";
import { LargeProjectGanttSetup } from "@/components/project/LargeProjectGanttSetup";
import { LargeProjectGanttChart } from "@/components/project/LargeProjectGanttChart";
import LargeProjectTeam from "@/components/project/LargeProjectTeam";

import type { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";
import { useProjectTransport } from "@/hooks/useProjectTransport";

const tabTriggerClass =
  "relative px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-primary font-medium transition-colors hover:text-foreground";

const LargeProjectViewPage = () => {
  const detail = useOutletContext<ReturnType<typeof useLargeProjectDetail>>();
  const [isGanttSetupOpen, setIsGanttSetupOpen] = useState(false);
  const navigate = useNavigate();

  const { project, tasks, files, comments, ganttSteps } = detail;

  // Get first booking ID for transport (large projects may have multiple)
  const bookingId = (project as any)?.bookings?.[0]?.booking_id || null;
  const { assignments: transportAssignments } = useProjectTransport(bookingId);

  if (!project) return null;

  return (
    <div className="space-y-6">
      {/* Project team + Overview dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ProjectOverviewHeader
            tasks={tasks}
            filesCount={files.length}
            commentsCount={comments.length}
            activities={[]}
          />
        </div>
        <LargeProjectTeam largeProjectId={project.id} />
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="tasks" className="space-y-6">
        <div className="border-b border-border/40 overflow-x-auto">
          <TabsList className="h-auto p-0 bg-transparent gap-0">
            <TabsTrigger value="tasks" className={tabTriggerClass}>
              Uppgifter
              {tasks.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
                  {tasks.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="gantt" className={tabTriggerClass}>
              Schema
            </TabsTrigger>
            <TabsTrigger value="files" className={tabTriggerClass}>
              Filer
              {files.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
                  {files.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="comments" className={tabTriggerClass}>
              Kommentarer
              {comments.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
                  {comments.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="products" className={tabTriggerClass}>
              Produkter
            </TabsTrigger>
            <TabsTrigger value="transport" className={tabTriggerClass}>
              Transport
              {transportAssignments.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
                  {transportAssignments.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="tasks">
          <ProjectTaskList
            tasks={tasks}
            onAddTask={detail.addTask}
            onUpdateTask={detail.updateTask}
            onDeleteTask={detail.deleteTask}
            bookingId={bookingId}
            executionHref="establishment"
            onOpenInChat={(taskId, taskTitle) =>
              navigate("collaboration", { state: { linkedTaskRef: { taskId, taskTitle } } })
            }
          />
        </TabsContent>

        <TabsContent value="gantt">
          {isGanttSetupOpen || ganttSteps.length === 0 ? (
            <LargeProjectGanttSetup
              largeProjectId={project.id}
              existingSteps={ganttSteps.length > 0 ? ganttSteps : undefined}
              onSave={async (steps) => {
                detail.saveGantt(steps);
                setIsGanttSetupOpen(false);
              }}
              onCancel={ganttSteps.length > 0 ? () => setIsGanttSetupOpen(false) : undefined}
            />
          ) : (
            <LargeProjectGanttChart
              steps={ganttSteps}
              onEdit={() => setIsGanttSetupOpen(true)}
            />
          )}
        </TabsContent>

        <TabsContent value="files">
          <ProjectFiles
            files={files}
            onUpload={detail.uploadFile}
            onDelete={detail.deleteFile}
            isUploading={detail.isUploadingFile}
          />
        </TabsContent>

        <TabsContent value="comments">
          <ProjectComments comments={comments} onAddComment={detail.addComment} />
        </TabsContent>

        <TabsContent value="products">
          <LargeProjectProductsOverview bookings={(project as any)?.bookings || []} />
        </TabsContent>

        <TabsContent value="transport">
          <ProjectTransportWidget bookingId={bookingId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LargeProjectViewPage;
