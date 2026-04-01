import { useState, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EstablishmentGanttChart from "@/components/project/EstablishmentGanttChart";
import DeestablishmentGanttChart from "@/components/project/DeestablishmentGanttChart";
import EstablishmentTaskDetailSheet from "@/components/project/EstablishmentTaskDetailSheet";
import { supabase } from "@/integrations/supabase/client";
import type { useProjectDetail } from "@/hooks/useProjectDetail";

const tabTriggerClass =
  "relative px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-primary font-medium transition-colors hover:text-foreground";

interface SelectedTask {
  id: string;
  title: string;
  category: string;
  startDate: Date;
  endDate: Date;
  completed: boolean;
}

const EstablishmentPage = () => {
  const detail = useOutletContext<ReturnType<typeof useProjectDetail>>();
  const { project } = detail;
  const booking = project?.booking;
  const [selectedTask, setSelectedTask] = useState<SelectedTask | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [linkedTaskRef, setLinkedTaskRef] = useState<{ taskId: string; taskTitle: string } | null>(null);

  // Fetch staff pool: unique staff assigned to this booking
  const { data: staffPool = [] } = useQuery({
    queryKey: ['booking-staff-pool', booking?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("booking_staff_assignments")
        .select("staff_id")
        .eq("booking_id", booking!.id);

      const uniqueIds = [...new Set((data || []).map(r => r.staff_id))];
      if (uniqueIds.length === 0) return [];

      const { data: staffData } = await supabase
        .from("staff_members")
        .select("id, name")
        .in("id", uniqueIds)
        .order("name");

      return staffData || [];
    },
    enabled: !!booking?.id,
  });

  if (!project) return null;

  const handleTaskClick = (task: SelectedTask) => {
    setSelectedTask(task);
    setSheetOpen(true);
  };

  const handleOpenInChat = useCallback((taskId: string, taskTitle: string) => {
    setLinkedTaskRef({ taskId, taskTitle });
    setSheetOpen(false);
    // Chat is on the project view page — navigate there
    // For now, store the ref so parent can pick it up if communication is on this page
  }, []);

  return (
    <div className="space-y-6">

      <Tabs defaultValue="establishment" className="space-y-6">
        <div className="border-b border-border/40 overflow-x-auto">
          <TabsList className="h-auto p-0 bg-transparent gap-0">
            <TabsTrigger value="establishment" className={tabTriggerClass}>
              Etablering
            </TabsTrigger>
            <TabsTrigger value="deestablishment" className={tabTriggerClass}>
              Avetablering
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
            staffPool={staffPool}
            onTaskClick={handleTaskClick}
          />
        </TabsContent>

        <TabsContent value="deestablishment">
          <DeestablishmentGanttChart
            eventDate={booking?.eventdate}
            rigdownDate={booking?.rigdowndate}
            bookingId={booking?.id}
            onTaskClick={handleTaskClick}
          />
        </TabsContent>
      </Tabs>

      <EstablishmentTaskDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        task={selectedTask}
        bookingId={booking?.id ?? null}
        staffPool={staffPool}
        projectId={project?.id}
        onOpenInChat={handleOpenInChat}
      />
    </div>
  );
};

export default EstablishmentPage;
