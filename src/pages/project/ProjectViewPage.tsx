import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import ProjectOverviewHeader from "@/components/project/ProjectOverviewHeader";
import ProjectProductsList from "@/components/project/ProjectProductsList";
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
import { ListChecks, Truck, FileText, MessageSquare, History, Package } from "lucide-react";

const SectionHeader = ({ icon: Icon, title, count }: { icon: React.ElementType; title: string; count?: number }) => (
  <div className="flex items-center gap-2 mb-3">
    <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10">
      <Icon className="h-4 w-4 text-primary" />
    </div>
    <h2 className="text-base font-semibold text-foreground tracking-tight">{title}</h2>
    {count !== undefined && count > 0 && (
      <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-primary text-primary-foreground">
        {count}
      </span>
    )}
  </div>
);

const ProjectViewPage = () => {
  const detail = useOutletContext<ReturnType<typeof useProjectDetail>>();
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [transportBookingOpen, setTransportBookingOpen] = useState(false);

  const { project, tasks, files, comments, activities, bookingAttachments } = detail;
  const bookingId = project?.booking_id || project?.booking?.id || null;
  const { assignments: transportAssignments, refetch: refetchTransport } = useProjectTransport(bookingId);

  // Auto-complete Transportbokning task if transport assignments exist
  useEffect(() => {
    if (transportAssignments.length > 0 && tasks.length > 0) {
      const transportTask = tasks.find(t => t.title === 'Transportbokning' && !t.completed);
      if (transportTask) {
        detail.updateTask({ id: transportTask.id, updates: { completed: true } });
      }
    }
  }, [transportAssignments.length, tasks]);

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


      {/* Equipment / Products */}
      {bookingId && (
        <section>
          <SectionHeader icon={Package} title="Utrustning" />
          <ProjectProductsList bookingId={bookingId} />
        </section>
      )}

      {/* Tasks */}
      <section>
        <SectionHeader icon={ListChecks} title="Uppgifter" count={tasks.length} />
        <ProjectTaskList
          tasks={tasks}
          onAddTask={detail.addTask}
          onUpdateTask={detail.updateTask}
          onDeleteTask={detail.deleteTask}
          onTaskAction={(task) => {
            if (task.title === 'Transportbokning' && bookingId) {
              setTransportBookingOpen(true);
              return true;
            }
            return false;
          }}
        />
      </section>

      {/* Transport */}
      <section>
        <SectionHeader icon={Truck} title="Transport" count={transportAssignments.length} />
        <ProjectTransportWidget bookingId={bookingId} />
      </section>

      {/* Files */}
      <section>
        <SectionHeader icon={FileText} title="Filer" count={files.length + bookingAttachments.length} />
        <ProjectFiles
          files={files}
          onUpload={detail.uploadFile}
          onDelete={detail.deleteFile}
          isUploading={detail.isUploadingFile}
          bookingAttachments={bookingAttachments}
        />
      </section>

      {/* Comments */}
      <section>
        <SectionHeader icon={MessageSquare} title="Kommentarer" count={comments.length} />
        <ProjectComments comments={comments} onAddComment={detail.addComment} />
      </section>

      {/* Activity History */}
      <section>
        <SectionHeader icon={History} title="Historik" count={activities.length} />
        <ProjectActivityLog activities={activities} />
      </section>

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
          onComplete={() => {
            refetchTransport();
            const transportTask = tasks.find(t => t.title === 'Transportbokning' && !t.completed);
            if (transportTask) {
              detail.updateTask({ id: transportTask.id, updates: { completed: true } });
            }
          }}
        />
      )}
    </div>
  );
};

export default ProjectViewPage;
