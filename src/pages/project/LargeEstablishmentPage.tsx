import { useState, useMemo, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GanttChart, List, Users } from "lucide-react";
import EstablishmentGanttChart from "@/components/project/EstablishmentGanttChart";
import DeestablishmentGanttChart from "@/components/project/DeestablishmentGanttChart";
import EstablishmentTaskDetailSheet from "@/components/project/EstablishmentTaskDetailSheet";
import ProjectControlPanel from "@/components/project/planning/ProjectControlPanel";
import CollaborationPanel from "@/components/project/planning/CollaborationPanel";
import PlanningTaskList from "@/components/project/planning/PlanningTaskList";
import PeopleOverview from "@/components/project/planning/PeopleOverview";
import { useTaskAnalytics } from "@/hooks/useTaskAnalytics";
import { supabase } from "@/integrations/supabase/client";
import type { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";

type ViewMode = "gantt" | "list" | "people";

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
  const [collaborationCollapsed, setCollaborationCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("gantt");

  const tabTriggerClass =
    "relative px-4 py-2.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-primary font-medium transition-colors hover:text-foreground text-sm";

  const bookingIds = useMemo(() => {
    return (project?.bookings || [])
      .map(b => b.booking_id)
      .filter(Boolean);
  }, [project?.bookings]);

  const { data: staffPool = [] } = useQuery({
    queryKey: ['large-project-staff-pool', project?.id, bookingIds],
    queryFn: async () => {
      let staffIds: string[] = [];
      if (bookingIds.length > 0) {
        const { data } = await supabase
          .from('booking_staff_assignments')
          .select('staff_id')
          .in('booking_id', bookingIds);
        staffIds = [...new Set((data || []).map(d => d.staff_id))];
      }
      const query = supabase.from('staff_members').select('id, name').eq('is_active', true).order('name');
      if (staffIds.length > 0) {
        query.in('id', staffIds);
      }
      const { data: staffData } = await query;
      return staffData || [];
    },
    enabled: !!project?.id,
  });

  const { analytics } = useTaskAnalytics(project?.id);

  const handleTaskClick = useCallback((task: SelectedTask) => {
    setSelectedTask(task);
    setSheetOpen(true);
  }, []);

  const handleControlPanelTaskClick = useCallback((taskId: string) => {
    const task = analytics.tasks.find(t => t.id === taskId);
    if (task) {
      setSelectedTask({
        id: task.id,
        title: task.title,
        category: task.category,
        startDate: new Date(task.start_date),
        endDate: new Date(task.end_date),
        completed: task.completed,
      });
      setSheetOpen(true);
    }
  }, [analytics.tasks]);

  if (!project) return null;

  const projectBookings = (project.bookings || []).map(b => ({
    booking_id: b.booking_id,
    display_name: b.display_name || (b as any).booking?.client || (b as any).booking?.booking_number || b.booking_id,
    client: (b as any).booking?.client || null,
  }));

  return (
    <div className="space-y-4">
      {/* TOP: Project Control Panel */}
      <ProjectControlPanel
        analytics={analytics}
        staffPool={staffPool}
        onTaskClick={handleControlPanelTaskClick}
      />

      {/* CENTER + RIGHT: Main workspace */}
      <div className="flex gap-4 items-start">
        {/* CENTER: Planning workspace */}
        <div className="flex-1 min-w-0 space-y-4">
          <Card className="border-border/50 shadow-sm overflow-hidden">
            <Tabs defaultValue="establishment">
              <div className="border-b border-border/40 px-4 flex items-center justify-between">
                <TabsList className="h-auto p-0 bg-transparent gap-0">
                  <TabsTrigger value="establishment" className={tabTriggerClass}>
                    Etablering
                  </TabsTrigger>
                  <TabsTrigger value="deestablishment" className={tabTriggerClass}>
                    Avetablering
                  </TabsTrigger>
                </TabsList>

                {/* View mode toggle */}
                <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                  <Button
                    variant={viewMode === "gantt" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 px-2.5 text-xs gap-1"
                    onClick={() => setViewMode("gantt")}
                  >
                    <GanttChart className="h-3.5 w-3.5" />
                    Gantt
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 px-2.5 text-xs gap-1"
                    onClick={() => setViewMode("list")}
                  >
                    <List className="h-3.5 w-3.5" />
                    Lista
                  </Button>
                  <Button
                    variant={viewMode === "people" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 px-2.5 text-xs gap-1"
                    onClick={() => setViewMode("people")}
                  >
                    <Users className="h-3.5 w-3.5" />
                    Personal
                  </Button>
                </div>
              </div>

              <TabsContent value="establishment" className="mt-0 p-4">
                {viewMode === "gantt" ? (
                  <EstablishmentGanttChart
                    largeProjectId={project.id}
                    startDate={project.start_date}
                    endDate={project.end_date}
                    onTaskClick={handleTaskClick}
                    staffPool={staffPool}
                    projectBookings={projectBookings}
                  />
                ) : viewMode === "list" ? (
                  <PlanningTaskList
                    tasks={analytics.tasks}
                    staffPool={staffPool}
                    onTaskClick={handleTaskClick}
                    largeProjectId={project.id}
                  />
                ) : (
                  <PeopleOverview
                    analytics={analytics}
                    staffPool={staffPool}
                    onTaskClick={handleControlPanelTaskClick}
                  />
                )}
              </TabsContent>

              <TabsContent value="deestablishment" className="mt-0 p-4">
                <DeestablishmentGanttChart
                  eventDate={project.end_date}
                  rigdownDate={project.end_date}
                  bookingId={null}
                  onTaskClick={handleTaskClick}
                />
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        {/* RIGHT: Collaboration panel */}
        <CollaborationPanel
          collapsed={collaborationCollapsed}
          onToggle={() => setCollaborationCollapsed(prev => !prev)}
          comments={detail.comments}
          onAddComment={detail.addComment}
        />
      </div>

      <EstablishmentTaskDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        task={selectedTask}
        bookingId={null}
        largeProjectId={project.id}
        staffPool={staffPool}
        projectBookings={projectBookings}
      />
    </div>
  );
};

export default LargeEstablishmentPage;
