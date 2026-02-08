import { useOutletContext } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EstablishmentGanttChart from "@/components/project/EstablishmentGanttChart";
import DeestablishmentGanttChart from "@/components/project/DeestablishmentGanttChart";
import type { useProjectDetail } from "@/hooks/useProjectDetail";

const tabTriggerClass =
  "relative px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-primary font-medium transition-colors hover:text-foreground";

const EstablishmentPage = () => {
  const detail = useOutletContext<ReturnType<typeof useProjectDetail>>();
  const { project } = detail;
  const booking = project?.booking;

  if (!project) return null;

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
          />
        </TabsContent>

        <TabsContent value="deestablishment">
          <DeestablishmentGanttChart
            eventDate={booking?.eventdate}
            rigdownDate={booking?.rigdowndate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EstablishmentPage;
