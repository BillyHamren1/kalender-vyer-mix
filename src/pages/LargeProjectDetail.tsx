import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, Search, Calendar, MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProjectStatusDropdown from "@/components/project/ProjectStatusDropdown";
import ProjectTaskList from "@/components/project/ProjectTaskList";
import ProjectFiles from "@/components/project/ProjectFiles";
import ProjectComments from "@/components/project/ProjectComments";
import ProjectOverviewHeader from "@/components/project/ProjectOverviewHeader";
import TaskDetailSheet from "@/components/project/TaskDetailSheet";
import BookingInfoExpanded from "@/components/project/BookingInfoExpanded";
import { LargeProjectGanttSetup } from "@/components/project/LargeProjectGanttSetup";
import { LargeProjectGanttChart } from "@/components/project/LargeProjectGanttChart";
import { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";
import { fetchAvailableBookingsForLargeProject } from "@/services/largeProjectService";
import { LARGE_PROJECT_STATUS_LABELS } from "@/types/largeProject";
import { ProjectTask, ProjectStatus } from "@/types/project";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const tabTriggerClass =
  "relative px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-primary font-medium transition-colors hover:text-foreground";

const LargeProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [isAddBookingOpen, setIsAddBookingOpen] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");
  const [isGanttSetupOpen, setIsGanttSetupOpen] = useState(false);

  const {
    project,
    tasks,
    files,
    comments,
    ganttSteps,
    isLoading,
    updateStatus,
    addTask,
    updateTask,
    deleteTask,
    addComment,
    uploadFile,
    deleteFile,
    isUploadingFile,
    addBooking,
    removeBooking,
    isAddingBooking,
    saveGantt,
  } = useLargeProjectDetail(id || "");

  const { data: availableBookings = [] } = useQuery({
    queryKey: ["available-bookings-for-large-project"],
    queryFn: fetchAvailableBookingsForLargeProject,
    enabled: isAddBookingOpen,
  });

  const filteredAvailableBookings = availableBookings.filter(
    (b) =>
      b.client.toLowerCase().includes(bookingSearch.toLowerCase()) ||
      b.booking_number?.toLowerCase().includes(bookingSearch.toLowerCase()) ||
      b.deliveryaddress?.toLowerCase().includes(bookingSearch.toLowerCase())
  );

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "d MMMM yyyy", { locale: sv });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-32 bg-muted rounded" />
          <div className="h-24 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h2 className="text-xl font-semibold mb-4">Projektet hittades inte</h2>
        <Button onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Tillbaka
        </Button>
      </div>
    );
  }

  // Map large project status to project status for the dropdown
  const statusMap: Record<string, ProjectStatus> = {
    planning: "planning",
    in_progress: "in_progress",
    delivered: "delivered",
    completed: "completed",
  };

  const bookings = project.bookings || [];
  const firstBooking = bookings[0]?.booking;

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--gradient-page)' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-xl">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'hsl(var(--heading))' }}>{project.name}</h1>
                <Badge variant="outline" className="text-xs">
                  Stort projekt
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {bookings.length} bokningar
                {project.location ? ` • ${project.location}` : ""}
              </p>
            </div>
          </div>
          <ProjectStatusDropdown
            status={statusMap[project.status] || "planning"}
            onStatusChange={(status) => updateStatus(status as any)}
          />
        </div>

        {/* Overview Dashboard */}
        <ProjectOverviewHeader
          tasks={tasks}
          filesCount={files.length}
          commentsCount={comments.length}
          activities={[]}
        />

        {/* Booking Info – show all bookings as expandable cards */}
        <div className="space-y-2 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Kopplade bokningar ({bookings.length})
            </h3>
            <Button size="sm" variant="outline" onClick={() => setIsAddBookingOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Lägg till bokning
            </Button>
          </div>
          {bookings.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground mb-3">
                  Inga bokningar kopplade ännu
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddBookingOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Lägg till första bokningen
                </Button>
              </CardContent>
            </Card>
          ) : (
            bookings.map((lpb) =>
              lpb.booking ? (
                <div key={lpb.id} className="relative">
                  <BookingInfoExpanded
                    booking={{
                      id: lpb.booking.id,
                      client: lpb.booking.client,
                      eventdate: lpb.booking.eventdate,
                      rigdaydate: lpb.booking.rigdaydate,
                      rigdowndate: lpb.booking.rigdowndate,
                      deliveryaddress: lpb.booking.deliveryaddress,
                      contact_name: lpb.booking.contact_name,
                      booking_number: lpb.booking.booking_number,
                    }}
                    projectLeader={project.project_leader}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-3 right-28 h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (confirm("Ta bort bokningen från projektet?")) {
                        removeBooking(lpb.booking_id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Card key={lpb.id} className="mb-2">
                  <CardContent className="p-4 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {lpb.display_name || "Bokning"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        if (confirm("Ta bort bokningen från projektet?")) {
                          removeBooking(lpb.booking_id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              )
            )
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="tasks" className="space-y-6">
          <div className="border-b border-border/40 overflow-x-auto">
            <TabsList className="h-auto p-0 bg-transparent gap-0">
              <TabsTrigger value="tasks" className={tabTriggerClass}>
                Uppgifter
                {tasks.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
                    {tasks.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="gantt" className={tabTriggerClass}>
                Schema
              </TabsTrigger>
              <TabsTrigger value="economy" className={tabTriggerClass}>
                Ekonomi
              </TabsTrigger>
              <TabsTrigger value="staff" className={tabTriggerClass}>
                Personal
              </TabsTrigger>
              <TabsTrigger value="files" className={tabTriggerClass}>
                Filer
                {files.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
                    {files.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="comments" className={tabTriggerClass}>
                Kommentarer
                {comments.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
                    {comments.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="tasks">
            <ProjectTaskList
              tasks={tasks}
              onAddTask={addTask}
              onUpdateTask={updateTask}
              onDeleteTask={deleteTask}
            />
          </TabsContent>

          <TabsContent value="gantt">
            {isGanttSetupOpen || ganttSteps.length === 0 ? (
              <LargeProjectGanttSetup
                largeProjectId={id!}
                existingSteps={ganttSteps.length > 0 ? ganttSteps : undefined}
                onSave={async (steps) => {
                  saveGantt(steps);
                  setIsGanttSetupOpen(false);
                }}
                onCancel={ganttSteps.length > 0 ? () => setIsGanttSetupOpen(false) : undefined}
              />
            ) : (
              <LargeProjectGanttChart
                steps={ganttSteps}
                onEdit={() => setIsGanttSetupOpen(true)}
              />
            )}
          </TabsContent>

          <TabsContent value="economy">
            <Card className="border-border/40 shadow-2xl rounded-2xl">
              <CardContent className="py-12 text-center text-muted-foreground">
                <p className="text-sm">
                  Ekonomiöversikt för storprojekt – aggregerar data från alla {bookings.length} kopplade bokningar.
                </p>
                <p className="text-xs mt-1">Byggs ut i nästa fas.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="staff">
            <Card className="border-border/40 shadow-2xl rounded-2xl">
              <CardContent className="py-12 text-center text-muted-foreground">
                <p className="text-sm">
                  Personalöversikt för storprojekt – visar personal från alla {bookings.length} kopplade bokningar.
                </p>
                <p className="text-xs mt-1">Byggs ut i nästa fas.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="files">
            <ProjectFiles
              files={files}
              onUpload={uploadFile}
              onDelete={deleteFile}
              isUploading={isUploadingFile}
            />
          </TabsContent>

          <TabsContent value="comments">
            <ProjectComments comments={comments} onAddComment={addComment} />
          </TabsContent>
        </Tabs>

        {/* Task detail sheet */}
        <TaskDetailSheet
          task={selectedTask}
          open={!!selectedTask}
          onOpenChange={(open) => !open && setSelectedTask(null)}
          onUpdateTask={updateTask}
          onDeleteTask={deleteTask}
        />
      </div>

      {/* Add Booking Dialog */}
      <Dialog open={isAddBookingOpen} onOpenChange={setIsAddBookingOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Lägg till bokning</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Sök bokningar..."
                value={bookingSearch}
                onChange={(e) => setBookingSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {filteredAvailableBookings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Inga tillgängliga bokningar hittades</p>
                  <p className="text-sm mt-1">
                    Endast bekräftade bokningar som inte redan tillhör ett stort projekt visas.
                  </p>
                </div>
              ) : (
                filteredAvailableBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{booking.client}</span>
                        {booking.booking_number && (
                          <Badge variant="outline" className="text-xs">
                            #{booking.booking_number}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {booking.eventdate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(booking.eventdate)}
                          </span>
                        )}
                        {booking.deliveryaddress && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {booking.deliveryaddress}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => addBooking(booking.id)}
                      disabled={isAddingBooking}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Lägg till
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddBookingOpen(false)}>
              Stäng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LargeProjectDetail;
