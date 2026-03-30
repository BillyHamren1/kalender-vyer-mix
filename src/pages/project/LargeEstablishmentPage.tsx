import { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EstablishmentGanttChart from "@/components/project/EstablishmentGanttChart";
import DeestablishmentGanttChart from "@/components/project/DeestablishmentGanttChart";
import EstablishmentTaskDetailSheet from "@/components/project/EstablishmentTaskDetailSheet";
import { supabase } from "@/integrations/supabase/client";
import type { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";

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

const LargeEstablishmentPage = () => {
  const detail = useOutletContext<ReturnType<typeof useLargeProjectDetail>>();
  const { project } = detail;
  const [selectedTask, setSelectedTask] = useState<SelectedTask | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Get booking IDs for staff pool
  const bookingIds = useMemo(() => {
    return (project?.bookings || [])
      .map(b => b.booking_id)
      .filter(Boolean);
  }, [project?.bookings]);

  // Fetch staff pool: unique staff assigned to any booking in this project
  const { data: staffPool = [] } = useQuery({
    queryKey: ['large-project-staff-pool', project?.id],
    queryFn: async () => {
      if (bookingIds.length === 0) return [];
      const { data } = await supabase
        .from('booking_staff_assignments')
        .select('staff_id')
        .in('booking_id', bookingIds);

      if (!data || data.length === 0) return [];

      const uniqueStaffIds = [...new Set(data.map(d => d.staff_id))];

      const { data: staffData } = await supabase
        .from('staff_members')
        .select('id, name')
        .in('id', uniqueStaffIds)
        .eq('is_active', true)
        .order('name');

      return staffData || [];
    },
    enabled: !!project?.id && bookingIds.length > 0,
  });

  if (!project) return null;

  const handleTaskClick = (task: SelectedTask) => {
    setSelectedTask(task);
    setSheetOpen(true);
  };

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
            largeProjectId={project.id}
            startDate={project.start_date}
            endDate={project.end_date}
            onTaskClick={handleTaskClick}
            projectBookings={(project.bookings || []).map(b => ({
              booking_id: b.booking_id,
              display_name: b.display_name,
              client: (b as any).client,
            }))}
          />
        </TabsContent>

        <TabsContent value="deestablishment">
          <DeestablishmentGanttChart
            eventDate={project.end_date}
            rigdownDate={project.end_date}
            bookingId={null}
            onTaskClick={handleTaskClick}
          />
        </TabsContent>
      </Tabs>

      <EstablishmentTaskDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        task={selectedTask}
        bookingId={null}
        largeProjectId={project.id}
        staffPool={staffPool}
        projectBookings={(project.bookings || []).map(b => ({
          booking_id: b.booking_id,
          display_name: b.display_name,
          client: (b as any).client,
        }))}
      />
    </div>
  );
};

export default LargeEstablishmentPage;
