import { useState, useEffect, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ProjectOverviewHeader from "@/components/project/ProjectOverviewHeader";
import ProjectTaskList from "@/components/project/ProjectTaskList";
import ProjectFiles from "@/components/project/ProjectFiles";
import ProjectInternalNotes from "@/components/project/ProjectInternalNotes";
import ProjectActivityLog from "@/components/project/ProjectActivityLog";
import ProjectTransportWidget from "@/components/project/ProjectTransportWidget";
import ProjectTransportBookingDialog from "@/components/project/ProjectTransportBookingDialog";
import BookingInfoExpanded from "@/components/project/BookingInfoExpanded";
import ProjectContactCard from "@/components/project/ProjectContactCard";
import ProjectSuppliersTab from "@/components/project/suppliers/ProjectSuppliersTab";
import ProjectTimeline from "@/components/project/timeline/ProjectTimeline";

import ProjectStatusPanel from "@/components/project/ProjectStatusPanel";
import ProjectTeamPanel from "@/components/project/ProjectTeamPanel";

import type { useProjectDetail } from "@/hooks/useProjectDetail";
import { useProjectTransport } from "@/hooks/useProjectTransport";
import { useRefreshBooking } from "@/hooks/useRefreshBooking";
import { FileText, MessageSquare, History, RefreshCw, ArrowRight } from "lucide-react";
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
  const [transportBookingOpen, setTransportBookingOpen] = useState(false);

  const { project, tasks, files, activities, bookingAttachments } = detail;
  const bookingId = project?.booking_id || project?.booking?.id || null;
  const { assignments: transportAssignments, refetch: refetchTransport } = useProjectTransport(bookingId);
  const { refreshBooking, isRefreshing } = useRefreshBooking(bookingId, project?.id ?? '');

  // Auto-complete Transportbokning task if transport assignments exist
  const incompleteTransportTask = tasks.find(t => t.title === 'Transportbokning' && !t.completed);
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
    internalnotes: project.internalnotes,
  } : null);

  return (
    <div className="space-y-6">
      {/* Overview dashboard */}
      <ProjectOverviewHeader
        tasks={tasks}
        filesCount={files.length}
        commentsCount={0}
        activities={activities}
      />

      {/* Two-column layout: Booking info + Tasks & Transport */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6 items-start">
        {/* Left: Booking/Project info – scrolls if content overflows */}
        {displayBooking && (
          <div className="relative h-[560px] overflow-y-auto rounded-2xl">
            {bookingId && (
              <Button
                variant="outline"
                size="icon"
                onClick={refreshBooking}
                disabled={isRefreshing}
                className="absolute top-3 right-3 z-10 h-8 w-8"
                title="Uppdatera bokning"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            )}
            <BookingInfoExpanded
              booking={displayBooking}
              projectLeader={projectLeaderDisplay}
              bookingAttachments={bookingAttachments}
            />
          </div>
        )}

        {/* Right: Team + Internal notes */}
        <div className="flex flex-col gap-4 h-[560px] overflow-y-auto">
          <ProjectTeamPanel
            bookingId={bookingId}
            projectLeader={projectLeaderDisplay}
            onChangeLeader={(name) => detail.updateProject({ project_leader: name })}
            projectStartDate={project.rigdaydate || project.eventdate}
            projectEndDate={project.rigdowndate || project.eventdate}
          />
          <SectionHeader icon={MessageSquare} title="Interna anteckningar" />
          <ProjectInternalNotes
            bookingId={bookingId}
            currentNotes={booking?.internalnotes || project.internalnotes}
            projectId={project.id}
            className="h-full"
          />
        </div>
      </div>

      {/* Filer */}
      <div className="grid grid-cols-1 gap-6 items-stretch">
        <div className="flex flex-col h-full min-h-[480px]">
          <SectionHeader icon={FileText} title="Filer" count={files.length} />
          <ProjectFiles
            files={files}
            onUpload={detail.uploadFile}
            onDelete={detail.deleteFile}
            isUploading={detail.isUploadingFile}
            bookingAttachments={bookingAttachments}
            className="h-full"
          />
        </div>
      </div>


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
