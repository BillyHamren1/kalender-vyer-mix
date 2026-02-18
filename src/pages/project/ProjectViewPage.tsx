import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import ProjectOverviewHeader from "@/components/project/ProjectOverviewHeader";
import ProjectTaskList from "@/components/project/ProjectTaskList";
import ProjectFiles from "@/components/project/ProjectFiles";
import ProjectComments from "@/components/project/ProjectComments";
import ProjectActivityLog from "@/components/project/ProjectActivityLog";
import ProjectTransportWidget from "@/components/project/ProjectTransportWidget";
import ProjectTransportBookingDialog from "@/components/project/ProjectTransportBookingDialog";
import BookingInfoExpanded from "@/components/project/BookingInfoExpanded";
import TaskDetailSheet from "@/components/project/TaskDetailSheet";
import { ProjectTask } from "@/types/project";
import type { useProjectDetail } from "@/hooks/useProjectDetail";
import { useProjectTransport } from "@/hooks/useProjectTransport";
import { Truck, FileText, MessageSquare, History } from "lucide-react";

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

  const booking = project.booking;

  return (
    <div className="space-y-6">
      {/* Overview dashboard */}
      <ProjectOverviewHeader
        tasks={tasks}
        filesCount={files.length}
        commentsCount={comments.length}
        activities={activities}
      />

      {/* Two-column layout: Booking info + Tasks & Transport */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6 items-start">
        {/* Left: Booking info – scrolls if content overflows */}
        {booking && (
          <div className="h-[560px] overflow-y-auto rounded-2xl">
            <BookingInfoExpanded
              booking={booking}
              projectLeader={project.project_leader}
              bookingAttachments={bookingAttachments}
            />
          </div>
        )}

        {/* Right: Tasks only – same max height */}
        <div className="flex flex-col gap-4 h-[560px] overflow-y-auto">
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
        </div>
      </div>

      {/* Transport – full width */}
      <section>
        <SectionHeader icon={Truck} title="Transport" count={transportAssignments.length} />
        <ProjectTransportWidget bookingId={bookingId} />
      </section>

      {/* Full-width sections below */}
      <section>
        <SectionHeader icon={FileText} title="Filer" count={files.length} />
        <ProjectFiles
          files={files}
          onUpload={detail.uploadFile}
          onDelete={detail.deleteFile}
          isUploading={detail.isUploadingFile}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <section>
          <SectionHeader icon={MessageSquare} title="Kommentarer" count={comments.length} />
          <ProjectComments comments={comments} onAddComment={detail.addComment} />
        </section>

        <section>
          <SectionHeader icon={History} title="Historik" count={activities.length} />
          <ProjectActivityLog activities={activities} />
        </section>
      </div>

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
