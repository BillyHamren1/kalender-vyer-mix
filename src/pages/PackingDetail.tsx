import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PackingStatusDropdown from "@/components/packing/PackingStatusDropdown";
import PackingTaskList from "@/components/packing/PackingTaskList";
import PackingFiles from "@/components/packing/PackingFiles";
import PackingComments from "@/components/packing/PackingComments";
import PackingGanttChart from "@/components/packing/PackingGanttChart";
import PackingTaskDetailSheet from "@/components/packing/PackingTaskDetailSheet";
import WarehouseTopBar from "@/components/WarehouseTopBar";
import { usePackingDetail } from "@/hooks/usePackingDetail";
import { PackingTask } from "@/types/packing";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const PackingDetail = () => {
  const { packingId } = useParams<{ packingId: string }>();
  const navigate = useNavigate();
  const [selectedTask, setSelectedTask] = useState<PackingTask | null>(null);
  
  const {
    packing,
    tasks,
    comments,
    files,
    isLoading,
    updateStatus,
    addTask,
    updateTask,
    deleteTask,
    addComment,
    uploadFile,
    deleteFile,
    isUploadingFile
  } = usePackingDetail(packingId || '');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <WarehouseTopBar />
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!packing) {
    return (
      <div className="min-h-screen bg-background">
        <WarehouseTopBar />
        <div className="container mx-auto px-4 py-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Packningen hittades inte</h2>
          <Button onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Tillbaka
          </Button>
        </div>
      </div>
    );
  }

  const booking = packing.booking;

  return (
    <div className="min-h-screen bg-background">
      <WarehouseTopBar />
      
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{packing.name}</h1>
              {booking && (
                <p className="text-muted-foreground">
                  Kopplat till bokning: {booking.booking_number || booking.id}
                </p>
              )}
            </div>
          </div>
          <PackingStatusDropdown 
            status={packing.status} 
            onStatusChange={updateStatus} 
          />
        </div>

        {/* Booking Info Card */}
        {booking && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                Bokningsinformation
                <Link to={`/booking/${booking.id}`}>
                  <Button variant="outline" size="sm">Visa bokning</Button>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex items-start gap-2">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Kund</p>
                    <p className="font-medium">{booking.client}</p>
                  </div>
                </div>
                {booking.eventdate && (
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Eventdatum</p>
                      <p className="font-medium">
                        {format(new Date(booking.eventdate), 'd MMMM yyyy', { locale: sv })}
                      </p>
                    </div>
                  </div>
                )}
                {booking.deliveryaddress && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Adress</p>
                      <p className="font-medium">{booking.deliveryaddress}</p>
                    </div>
                  </div>
                )}
                {booking.contact_name && (
                  <div className="flex items-start gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Kontakt</p>
                      <p className="font-medium">{booking.contact_name}</p>
                      {booking.contact_phone && (
                        <p className="text-sm text-muted-foreground">{booking.contact_phone}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs Content */}
        <Tabs defaultValue="gantt" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="gantt">Gantt-schema</TabsTrigger>
            <TabsTrigger value="tasks">Uppgifter ({tasks.length})</TabsTrigger>
            <TabsTrigger value="files">Filer ({files.length})</TabsTrigger>
            <TabsTrigger value="comments">Kommentarer ({comments.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="gantt">
            <PackingGanttChart 
              tasks={tasks} 
              onTaskClick={(task) => setSelectedTask(task)}
            />
          </TabsContent>

          <TabsContent value="tasks">
            <PackingTaskList
              tasks={tasks}
              onAddTask={addTask}
              onUpdateTask={updateTask}
              onDeleteTask={deleteTask}
            />
          </TabsContent>

          <TabsContent value="files">
            <PackingFiles
              files={files}
              onUpload={uploadFile}
              onDelete={deleteFile}
              isUploading={isUploadingFile}
            />
          </TabsContent>

          <TabsContent value="comments">
            <PackingComments
              comments={comments}
              onAddComment={addComment}
            />
          </TabsContent>
        </Tabs>

        {/* Task detail sheet for Gantt clicks */}
        <PackingTaskDetailSheet
          task={selectedTask}
          open={!!selectedTask}
          onOpenChange={(open) => !open && setSelectedTask(null)}
          onUpdateTask={updateTask}
          onDeleteTask={deleteTask}
        />
      </div>
    </div>
  );
};

export default PackingDetail;
