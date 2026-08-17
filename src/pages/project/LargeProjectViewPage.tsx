import { useOutletContext } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProjectOverviewHeader from "@/components/project/ProjectOverviewHeader";
import ProjectTaskList from "@/components/project/ProjectTaskList";

import ProjectFiles from "@/components/project/ProjectFiles";
import ProjectInternalNotes from "@/components/project/ProjectInternalNotes";
import LargeProjectLogisticsWorkspace from "@/components/project/LargeProjectLogisticsWorkspace";
import ProjectContactCard from "@/components/project/ProjectContactCard";
import LargeProjectProductsOverview from "@/components/project/LargeProjectProductsOverview";
import ProjectFollowersPanel from "@/components/project/ProjectFollowersPanel";



import type { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";
import { useProjectTransport } from "@/hooks/useProjectTransport";

const tabTriggerClass =
  "relative px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-primary font-medium transition-colors hover:text-foreground";

const LargeProjectViewPage = () => {
  const detail = useOutletContext<ReturnType<typeof useLargeProjectDetail>>();

  const { project, tasks, files } = detail;

  // Get first booking ID for transport (large projects may have multiple)
  const bookingId = (project as any)?.bookings?.[0]?.booking_id || null;
  const { assignments: transportAssignments } = useProjectTransport(bookingId);

  // Hitta första underbokning som har kontaktinfo (leverans-kontakt följer med från importen)
  const contactBooking = ((project as any)?.bookings || [])
    .map((b: any) => b.booking)
    .find((b: any) => b && (b.contact_name || b.contact_phone || b.contact_email));

  if (!project) return null;

  return (
    <div className="space-y-6">
      {/* Overview dashboard */}
      <ProjectOverviewHeader
        tasks={tasks}
        filesCount={files.length}
        commentsCount={0}
        activities={[]}
        projectLeader={(project as any).project_leader}
        rigDate={(project as any).start_date?.[0] || null}
        eventDate={(project as any).event_date?.[0] || null}
        rigDownDate={(project as any).end_date?.[0] || null}
        deliveryAddress={(project as any).address}
        bookingCount={(project as any)?.bookings?.length || 0}
      />

      {/* Same project-activity model as standard projects. The hook maps
          large_project_tasks to the shared ProjectTask shape and bridges to execution. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Aktiviteter</h2>
            <p className="text-xs text-muted-foreground">Projektledarens gemensamma aktiviteter, oavsett antal underbokningar.</p>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {tasks.filter(t => !t.completed && !t.is_info_only).length} öppna
          </span>
        </div>
        <div className="min-h-[360px]">
          <ProjectTaskList
            tasks={tasks}
            onAddTask={detail.addTask}
            onUpdateTask={detail.updateTask}
            onDeleteTask={detail.deleteTask}
            bookingId={bookingId}
            executionHref="../establishment"
          />
        </div>
      </section>


      {/* Anslagstavla — interna anteckningar (ETT enhetligt fält) */}
      <ProjectInternalNotes
        bookingId={bookingId}
        currentNotes={(project as any).internalnotes}
        projectId={project.id}
      />

      <ProjectFollowersPanel projectId={project.id} projectType="large" />

      {/* Leveranskontakt från bokningen */}
      {contactBooking && (
        <ProjectContactCard
          contactName={contactBooking.contact_name}
          contactPhone={contactBooking.contact_phone}
          contactEmail={contactBooking.contact_email}
        />
      )}

      {/* Tabbed content */}
      <Tabs defaultValue="files" className="space-y-6">
        <div className="border-b border-border/40 overflow-x-auto">
          <TabsList className="h-auto p-0 bg-transparent gap-0">
            <TabsTrigger value="files" className={tabTriggerClass}>
              Filer
              {files.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
                  {files.length}
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

        <TabsContent value="files">
          <ProjectFiles
            files={files}
            onUpload={detail.uploadFile}
            onDelete={detail.deleteFile}
            isUploading={detail.isUploadingFile}
          />
        </TabsContent>

        <TabsContent value="products">
          <LargeProjectProductsOverview bookings={(project as any)?.bookings || []} largeProjectId={project.id} />
        </TabsContent>

        <TabsContent value="transport">
          <LargeProjectLogisticsWorkspace largeProjectId={project.id} bookings={(project as any)?.bookings || []} />
        </TabsContent>

      </Tabs>

    </div>
  );
};

export default LargeProjectViewPage;
