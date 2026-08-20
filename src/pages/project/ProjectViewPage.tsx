import { useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ProjectOverviewWorkspace from "@/components/project/ProjectOverviewWorkspace";
import ProjectFiles from "@/components/project/ProjectFiles";
import ProjectInternalNotes from "@/components/project/ProjectInternalNotes";
import BookingInfoExpanded from "@/components/project/BookingInfoExpanded";
import PickupStopsSection from "@/components/pickup/PickupStopsSection";
import ProjectTransportWidget from "@/components/project/ProjectTransportWidget";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import ProjectTeamPanel from "@/components/project/ProjectTeamPanel";
import ProjectFollowersPanel from "@/components/project/ProjectFollowersPanel";

import type { useProjectDetail } from "@/hooks/useProjectDetail";
import { useProjectTransport } from "@/hooks/useProjectTransport";
import { useRefreshBooking } from "@/hooks/useRefreshBooking";
import { FileText, MessageSquare, RefreshCw, Users, Truck, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  const { project, tasks, files, bookingAttachments } = detail;
  const bookingId = project?.booking_id || project?.booking?.id || null;
  const { assignments: transportAssignments } = useProjectTransport(bookingId);
  const { refreshBooking, isRefreshing } = useRefreshBooking(bookingId, project?.id ?? '');

  // Auto-complete "Boka transport" (även historiska "Transportbokning") när transport finns
  const incompleteTransportTask = tasks.find(t => isTransportTodoTitle(t.title) && !t.completed);
  useEffect(() => {
    if (transportAssignments.length > 0 && incompleteTransportTask) {
      detail.updateTask({ id: incompleteTransportTask.id, updates: { completed: true } });
    }
  }, [transportAssignments.length, incompleteTransportTask?.id]);

  // Resolve project_leader if it's stored as a UUID instead of a name
  const rawLeader = project?.project_leader || null;
  const isLeaderUuid = rawLeader && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawLeader);

  const { data: resolvedLeaderName } = useQuery({
    queryKey: ['resolve-leader-name', rawLeader],
    queryFn: async () => {
      // Try profiles first (user_id), then staff_members (id)
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('user_id', rawLeader!)
        .maybeSingle();
      if (profile?.full_name) return profile.full_name;
      if (profile?.email) return profile.email.split('@')[0];

      const { data: staff } = await supabase
        .from('staff_members')
        .select('name')
        .eq('id', rawLeader!)
        .maybeSingle();
      if (staff?.name) return staff.name;

      return rawLeader;
    },
    enabled: !!isLeaderUuid,
    staleTime: Infinity,
  });

  // Auto-heal: persist resolved name back to DB so UUID is replaced permanently
  useEffect(() => {
    if (isLeaderUuid && resolvedLeaderName && resolvedLeaderName !== rawLeader && project?.id) {
      detail.updateProject({ project_leader: resolvedLeaderName });
    }
  }, [isLeaderUuid, resolvedLeaderName, rawLeader, project?.id]);

  const projectLeaderDisplay = isLeaderUuid ? (resolvedLeaderName || null) : rawLeader;

  if (!project) return null;

  // Use booking data if available, otherwise construct from standalone project fields
  const booking = project.booking;
  const displayBooking = booking || (project.client ? {
    id: project.id,
    client: project.client,
    eventdate: project.eventdate,
    rigdaydate: project.rigdaydate,
    rigdowndate: project.rigdowndate,
    deliveryaddress: project.deliveryaddress,
    delivery_city: project.delivery_city,
    delivery_postal_code: project.delivery_postal_code,
    contact_name: project.contact_name,
    contact_phone: project.contact_phone,
    contact_email: project.contact_email,
    booking_number: null,
    carry_more_than_10m: null,
    ground_nails_allowed: null,
    exact_time_needed: null,
    exact_time_info: null,
    rental_only: false,
    internalnotes: project.internalnotes,
  } : null);

  return (
    <div className="space-y-6">
      {/* Simple operational overview: real dates, todos and establishment schedule. */}
      <ProjectOverviewWorkspace
        project={project}
        tasks={tasks}
        bookingId={bookingId}
        onAddTask={detail.addTask}
        onUpdateTask={detail.updateTask}
      />

      {/* Secondary project workspace: information is grouped by PM intent instead of long scrolling panels. */}
      <Tabs defaultValue="info" className="space-y-4">
        <TabsList className="h-auto w-full justify-start rounded-xl border border-border/50 bg-card p-1">
          <TabsTrigger value="info" className="gap-2"><Info className="h-4 w-4" />Projektinfo</TabsTrigger>
          <TabsTrigger value="team" className="gap-2"><Users className="h-4 w-4" />Team & kommunikation</TabsTrigger>
          <TabsTrigger value="logistics" className="gap-2"><Truck className="h-4 w-4" />Logistik</TabsTrigger>
          <TabsTrigger value="files" className="gap-2"><FileText className="h-4 w-4" />Dokument {files.length > 0 && `(${files.length})`}</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-0">
          {displayBooking && (
            <div className="relative max-h-[680px] overflow-y-auto rounded-2xl">
              {bookingId && <Button variant="outline" size="icon" onClick={refreshBooking} disabled={isRefreshing} className="absolute top-3 right-3 z-10 h-8 w-8" title="Uppdatera bokning"><RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} /></Button>}
              <BookingInfoExpanded booking={displayBooking} projectLeader={projectLeaderDisplay} bookingAttachments={bookingAttachments} showCustomerInfo={false} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="team" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <div className="space-y-4">
              <ProjectTeamPanel bookingId={bookingId} projectLeader={projectLeaderDisplay} onChangeLeader={(name) => detail.updateProject({ project_leader: name })} projectStartDate={project.rigdaydate || project.eventdate} projectEndDate={project.rigdowndate || project.eventdate} />
              <ProjectFollowersPanel projectId={project.id} projectType="standard" />
            </div>
            <div>
              <SectionHeader icon={MessageSquare} title="Interna anteckningar" />
              <ProjectInternalNotes bookingId={bookingId} currentNotes={booking?.internalnotes || project.internalnotes} projectId={project.id} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="logistics" className="mt-0 space-y-5">
          <ProjectTransportWidget bookingId={bookingId} />
          <PickupStopsSection parent={{ type: "project", id: project.id }} />
        </TabsContent>

        <TabsContent value="files" className="mt-0">
          <ProjectFiles files={files} onUpload={detail.uploadFile} onDelete={detail.deleteFile} isUploading={detail.isUploadingFile} bookingAttachments={bookingAttachments} />
        </TabsContent>
      </Tabs>

    </div>
  );
};

export default ProjectViewPage;
