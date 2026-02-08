import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProjectStatusDropdown from "@/components/project/ProjectStatusDropdown";
import ProjectTaskList from "@/components/project/ProjectTaskList";
import ProjectFiles from "@/components/project/ProjectFiles";
import ProjectComments from "@/components/project/ProjectComments";
import EstablishmentGanttChart from "@/components/project/EstablishmentGanttChart";
import DeestablishmentGanttChart from "@/components/project/DeestablishmentGanttChart";
import TaskDetailSheet from "@/components/project/TaskDetailSheet";
import { ProjectEconomyTab } from "@/components/project/ProjectEconomyTab";
import { ProjectStaffTab } from "@/components/project/ProjectStaffTab";
import BookingInfoExpanded from "@/components/project/BookingInfoExpanded";
import ProjectOverviewHeader from "@/components/project/ProjectOverviewHeader";
import ProjectActivityLog from "@/components/project/ProjectActivityLog";
import { useProjectDetail } from "@/hooks/useProjectDetail";
import { ProjectTask } from "@/types/project";

const tabTriggerClass = "relative px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-primary font-medium transition-colors hover:text-foreground";

const ProjectDetail = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  
  const {
    project,
    tasks,
    comments,
    files,
    activities,
    isLoading,
    updateStatus,
    addTask,
    updateTask,
    deleteTask,
    addComment,
    uploadFile,
    deleteFile,
    isUploadingFile
  } = useProjectDetail(projectId || '');

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-32 bg-muted rounded" />
          <div className="h-24 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h2 className="text-xl font-semibold mb-4">Projektet hittades inte</h2>
        <Button onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Tillbaka
        </Button>
      </div>
    );
  }

  const booking = project.booking;

  return (
    <div className="h-full overflow-y-auto">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
              {booking && (
                <p className="text-sm text-muted-foreground">
                  {booking.client} • {booking.booking_number || booking.id}
                </p>
              )}
            </div>
          </div>
          <ProjectStatusDropdown 
            status={project.status} 
            onStatusChange={updateStatus} 
          />
        </div>

        {/* Overview Dashboard */}
        <ProjectOverviewHeader
          tasks={tasks}
          filesCount={files.length}
          commentsCount={comments.length}
          activities={activities}
        />

        {/* Expanded Booking Info */}
        {booking && (
          <BookingInfoExpanded 
            booking={booking} 
            projectLeader={project.project_leader}
          />
        )}

        {/* Tabs Content */}
        <Tabs defaultValue="establishment" className="space-y-6">
          <div className="border-b overflow-x-auto">
            <TabsList className="h-auto p-0 bg-transparent gap-0">
              <TabsTrigger value="establishment" className={tabTriggerClass}>
                Etablering
              </TabsTrigger>
              <TabsTrigger value="deestablishment" className={tabTriggerClass}>
                Avetablering
              </TabsTrigger>
              <TabsTrigger value="tasks" className={tabTriggerClass}>
                Uppgifter
                {tasks.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-muted text-muted-foreground">
                    {tasks.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="staff" className={tabTriggerClass}>
                Personal
              </TabsTrigger>
              <TabsTrigger value="economy" className={tabTriggerClass}>
                Ekonomi
              </TabsTrigger>
              <TabsTrigger value="files" className={tabTriggerClass}>
                Filer
                {files.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-muted text-muted-foreground">
                    {files.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="comments" className={tabTriggerClass}>
                Kommentarer
                {comments.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-muted text-muted-foreground">
                    {comments.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="activity" className={tabTriggerClass}>
                Historik
                {activities.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-muted text-muted-foreground">
                    {activities.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="establishment">
            <EstablishmentGanttChart 
              rigDate={booking?.rigdaydate}
              eventDate={booking?.eventdate}
              bookingId={booking?.id}
              client={booking?.client}
              address={booking?.deliveryaddress}
            />
          </TabsContent>

          <TabsContent value="deestablishment">
            <DeestablishmentGanttChart 
              eventDate={booking?.eventdate}
              rigdownDate={booking?.rigdowndate}
            />
          </TabsContent>

          <TabsContent value="tasks">
            <ProjectTaskList
              tasks={tasks}
              onAddTask={addTask}
              onUpdateTask={updateTask}
              onDeleteTask={deleteTask}
            />
          </TabsContent>

          <TabsContent value="staff">
            <ProjectStaffTab 
              projectId={projectId || ''} 
              bookingId={project.booking_id} 
            />
          </TabsContent>

          <TabsContent value="economy">
            <ProjectEconomyTab 
              projectId={projectId || ''} 
              projectName={project.name}
              bookingId={project.booking_id} 
            />
          </TabsContent>

          <TabsContent value="files">
            <ProjectFiles
              files={files}
              onUpload={uploadFile}
              onDelete={deleteFile}
              isUploading={isUploadingFile}
            />
          </TabsContent>

          <TabsContent value="comments">
            <ProjectComments
              comments={comments}
              onAddComment={addComment}
            />
          </TabsContent>

          <TabsContent value="activity">
            <ProjectActivityLog activities={activities} />
          </TabsContent>
        </Tabs>

        {/* Task detail sheet for Gantt clicks */}
        <TaskDetailSheet
          task={selectedTask}
          open={!!selectedTask}
          onOpenChange={(open) => !open && setSelectedTask(null)}
          onUpdateTask={updateTask}
          onDeleteTask={deleteTask}
        />
      </div>
    </div>
  );
};

export default ProjectDetail;
