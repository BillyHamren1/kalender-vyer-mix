import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProjectOverviewHeader from "@/components/project/ProjectOverviewHeader";
import ProjectTaskList from "@/components/project/ProjectTaskList";
import ProjectFiles from "@/components/project/ProjectFiles";
import ProjectComments from "@/components/project/ProjectComments";
import ProjectActivityLog from "@/components/project/ProjectActivityLog";
import ProjectTransportWidget from "@/components/project/ProjectTransportWidget";
import TaskDetailSheet from "@/components/project/TaskDetailSheet";
import { LargeProjectGanttSetup } from "@/components/project/LargeProjectGanttSetup";
import { LargeProjectGanttChart } from "@/components/project/LargeProjectGanttChart";
import { ProjectTask } from "@/types/project";
import type { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";
import { useProjectTransport } from "@/hooks/useProjectTransport";

const tabTriggerClass =
  "relative px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-primary font-medium transition-colors hover:text-foreground";

const LargeProjectViewPage = () => {
  const detail = useOutletContext<ReturnType<typeof useLargeProjectDetail>>();
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [isGanttSetupOpen, setIsGanttSetupOpen] = useState(false);

  const { project, tasks, files, comments, ganttSteps } = detail;

  // Get first booking ID for transport (large projects may have multiple)
  const bookingId = (project as any)?.bookings?.[0]?.booking_id || null;
  const { assignments: transportAssignments } = useProjectTransport(bookingId);

  if (!project) return null;

  return (
    <div className="space-y-6">
      {/* Overview dashboard */}
      <ProjectOverviewHeader
        tasks={tasks}
        filesCount={files.length}
        commentsCount={comments.length}
        activities={[]}
      />

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
            <TabsTrigger value="transport" className={tabTriggerClass}>
              Transport
              {transportAssignments.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
                  {transportAssignments.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="activity" className={tabTriggerClass}>
              Historik
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="tasks">
          <ProjectTaskList
            tasks={tasks}
            onAddTask={detail.addTask}
            onUpdateTask={detail.updateTask}
            onDeleteTask={detail.deleteTask}
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

        <TabsContent value="transport">
          <ProjectTransportWidget bookingId={bookingId} />
        </TabsContent>

        <TabsContent value="activity">
          <ProjectActivityLog activities={[]} />
        </TabsContent>
      </Tabs>

      {/* Task detail sheet */}
      <TaskDetailSheet
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        onUpdateTask={detail.updateTask}
        onDeleteTask={detail.deleteTask}
      />
    </div>
  );
};

export default LargeProjectViewPage;
