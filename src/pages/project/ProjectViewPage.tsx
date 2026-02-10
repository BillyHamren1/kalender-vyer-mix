import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProjectOverviewHeader from "@/components/project/ProjectOverviewHeader";
import ProjectTaskList from "@/components/project/ProjectTaskList";
import ProjectFiles from "@/components/project/ProjectFiles";
import ProjectComments from "@/components/project/ProjectComments";
import ProjectActivityLog from "@/components/project/ProjectActivityLog";
import ProjectTransportWidget from "@/components/project/ProjectTransportWidget";
import ProjectTransportBookingDialog from "@/components/project/ProjectTransportBookingDialog";

import TaskDetailSheet from "@/components/project/TaskDetailSheet";
import { ProjectTask } from "@/types/project";
import type { useProjectDetail } from "@/hooks/useProjectDetail";
import { useProjectTransport } from "@/hooks/useProjectTransport";

const tabTriggerClass =
  "relative px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-primary font-medium transition-colors hover:text-foreground";

const ProjectViewPage = () => {
  const detail = useOutletContext<ReturnType<typeof useProjectDetail>>();
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [transportBookingOpen, setTransportBookingOpen] = useState(false);

  const { project, tasks, files, comments, activities } = detail;
  const bookingId = project?.booking_id || project?.booking?.id || null;
  const { assignments: transportAssignments, refetch: refetchTransport } = useProjectTransport(bookingId);

  if (!project) return null;

  return (
    <div className="space-y-6">
      {/* Overview dashboard */}
      <ProjectOverviewHeader
        tasks={tasks}
        filesCount={files.length}
        commentsCount={comments.length}
        activities={activities}
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
            <TabsTrigger value="activity" className={tabTriggerClass}>
              Historik
              {activities.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
                  {activities.length}
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
          </TabsList>
        </div>

        <TabsContent value="tasks">
          <ProjectTaskList
            tasks={tasks}
            onAddTask={detail.addTask}
            onUpdateTask={detail.updateTask}
            onDeleteTask={detail.deleteTask}
            onTaskAction={(task) => {
              if (task.title === 'Transportbokning' && bookingId) {
                setTransportBookingOpen(true);
                return true; // handled, don't open detail sheet
              }
              return false;
            }}
          />
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

        <TabsContent value="activity">
          <ProjectActivityLog activities={activities} />
        </TabsContent>

        <TabsContent value="transport">
          <ProjectTransportWidget bookingId={bookingId} />
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

      {bookingId && (
        <ProjectTransportBookingDialog
          bookingId={bookingId}
          open={transportBookingOpen}
          onOpenChange={setTransportBookingOpen}
          onComplete={refetchTransport}
        />
      )}
    </div>
  );
};

export default ProjectViewPage;
