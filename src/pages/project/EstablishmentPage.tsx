import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EstablishmentGanttChart from "@/components/project/EstablishmentGanttChart";
import DeestablishmentGanttChart from "@/components/project/DeestablishmentGanttChart";
import EstablishmentTaskDetailSheet from "@/components/project/EstablishmentTaskDetailSheet";
import ProjectGanttChart from "@/components/project/ProjectGanttChart";
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
  const { project, tasks } = detail;
  const booking = project?.booking;
  const [selectedTask, setSelectedTask] = useState<SelectedTask | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!project) return null;

  const handleTaskClick = (task: SelectedTask) => {
    setSelectedTask(task);
    setSheetOpen(true);
  };

  return (
    <div className="space-y-6">
      <ProjectGanttChart tasks={tasks} />

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
      />
    </div>
  );
};

export default EstablishmentPage;
