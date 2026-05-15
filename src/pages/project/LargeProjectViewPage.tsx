import { useOutletContext, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProjectOverviewHeader from "@/components/project/ProjectOverviewHeader";

import ProjectFiles from "@/components/project/ProjectFiles";
import ProjectInternalNotes from "@/components/project/ProjectInternalNotes";
import ProjectTransportWidget from "@/components/project/ProjectTransportWidget";
import ProjectContactCard from "@/components/project/ProjectContactCard";
import LargeProjectProductsOverview from "@/components/project/LargeProjectProductsOverview";
import PickupStopsSection from "@/components/pickup/PickupStopsSection";



import type { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";
import { useProjectTransport } from "@/hooks/useProjectTransport";

const tabTriggerClass =
  "relative px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-primary font-medium transition-colors hover:text-foreground";

const LargeProjectViewPage = () => {
  const detail = useOutletContext<ReturnType<typeof useLargeProjectDetail>>();
  const navigate = useNavigate();

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
      />

      {/* Anslagstavla — interna anteckningar (ETT enhetligt fält) */}
      <ProjectInternalNotes
        bookingId={bookingId}
        currentNotes={(project as any).internalnotes}
        projectId={project.id}
      />

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
            <TabsTrigger value="pickup" className={tabTriggerClass}>
              Materialhämtning
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
          <ProjectTransportWidget bookingId={bookingId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LargeProjectViewPage;
