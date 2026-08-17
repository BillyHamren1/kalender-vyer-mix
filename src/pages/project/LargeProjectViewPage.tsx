import { useOutletContext } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Info, MessageSquare, Package, Truck, Users } from "lucide-react";
import ProjectOverviewHeader from "@/components/project/ProjectOverviewHeader";
import ProjectTaskList from "@/components/project/ProjectTaskList";

import ProjectFiles from "@/components/project/ProjectFiles";
import ProjectInternalNotes from "@/components/project/ProjectInternalNotes";
import LargeProjectLogisticsWorkspace from "@/components/project/LargeProjectLogisticsWorkspace";
import ProjectContactCard from "@/components/project/ProjectContactCard";
import LargeProjectProductsOverview from "@/components/project/LargeProjectProductsOverview";
import ProjectFollowersPanel from "@/components/project/ProjectFollowersPanel";
import LargeProjectTeam from "@/components/project/LargeProjectTeam";



import type { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";

const LargeProjectViewPage = () => {
  const detail = useOutletContext<ReturnType<typeof useLargeProjectDetail>>();

  const { project, tasks, files } = detail;

  const bookingIds = useMemo(() => ((project as any)?.bookings || []).map((b: any) => b.booking_id).filter(Boolean), [project]);
  const primaryBookingId = bookingIds[0] || null;
  const { data: transportAssignments = [] } = useQuery({
    queryKey: ["large-project-overview-transport", project?.id, bookingIds.join(",")],
    queryFn: async () => {
      if (!bookingIds.length) return [];
      const { data, error } = await supabase
        .from("transport_assignments")
        .select("id, booking_id, status, partner_response")
        .in("booking_id", bookingIds);
      if (error) throw error;
      return data || [];
    },
    enabled: bookingIds.length > 0,
  });

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
        transportCount={transportAssignments.length}
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
            bookingId={primaryBookingId}
            executionHref="../establishment"
          />
        </div>
      </section>


      {/* Gemensam sekundär arbetsyta – samma informationsarkitektur som för enskilda projekt. */}
      <Tabs defaultValue="info" className="space-y-4">
        <TabsList className="h-auto w-full justify-start rounded-xl border border-border/50 bg-card p-1 overflow-x-auto">
          <TabsTrigger value="info" className="gap-2"><Info className="h-4 w-4" />Projektinfo</TabsTrigger>
          <TabsTrigger value="team" className="gap-2"><Users className="h-4 w-4" />Team & kommunikation</TabsTrigger>
          <TabsTrigger value="logistics" className="gap-2"><Truck className="h-4 w-4" />Logistik</TabsTrigger>
          <TabsTrigger value="products" className="gap-2"><Package className="h-4 w-4" />Material</TabsTrigger>
          <TabsTrigger value="files" className="gap-2"><FileText className="h-4 w-4" />Dokument {files.length > 0 && `(${files.length})`}</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <div className="rounded-xl border border-border/50 bg-card p-5">
              <h3 className="text-sm font-semibold">Projektets omfattning</h3>
              <p className="text-xs text-muted-foreground mt-1">Det här projektet samlar {(project as any)?.bookings?.length || 0} leveranser/bokningar i en gemensam projektledning. Detaljer per leverans hanteras utan att projektets helhet tappas.</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-border/50 p-3"><span className="text-muted-foreground">Leveranser</span><p className="text-lg font-semibold mt-1">{(project as any)?.bookings?.length || 0}</p></div>
                <div className="rounded-lg border border-border/50 p-3"><span className="text-muted-foreground">Transporter</span><p className="text-lg font-semibold mt-1">{transportAssignments.length}</p></div>
              </div>
            </div>
            {contactBooking ? (
              <ProjectContactCard contactName={contactBooking.contact_name} contactPhone={contactBooking.contact_phone} contactEmail={contactBooking.contact_email} />
            ) : (
              <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Ingen leveranskontakt hittades i projektets underbokningar.</div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="team" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <div className="space-y-4">
              <LargeProjectTeam largeProjectId={project.id} />
              <ProjectFollowersPanel projectId={project.id} projectType="large" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3"><MessageSquare className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Interna anteckningar</h3></div>
              <ProjectInternalNotes bookingId={primaryBookingId} currentNotes={(project as any).internalnotes} projectId={project.id} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="logistics" className="mt-0">
          <LargeProjectLogisticsWorkspace largeProjectId={project.id} bookings={(project as any)?.bookings || []} />
        </TabsContent>

        <TabsContent value="products" className="mt-0">
          <LargeProjectProductsOverview bookings={(project as any)?.bookings || []} largeProjectId={project.id} />
        </TabsContent>

        <TabsContent value="files" className="mt-0">
          <ProjectFiles files={files} onUpload={detail.uploadFile} onDelete={detail.deleteFile} isUploading={detail.isUploadingFile} />
        </TabsContent>
      </Tabs>

    </div>
  );
};

export default LargeProjectViewPage;
