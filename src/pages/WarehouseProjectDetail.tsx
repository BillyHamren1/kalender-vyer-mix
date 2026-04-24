import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Package, Wrench, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchWarehouseProject,
  fetchWarehouseProjectTasks,
  fetchWarehousePackings,
  deleteWarehouseProject,
} from "@/services/warehouseProjectService";
import {
  WAREHOUSE_PROJECT_STATUS_LABELS,
  WAREHOUSE_PROJECT_STATUS_COLORS,
} from "@/types/warehouseProject";
import PackingCard from "@/components/packing/PackingCard";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { toast } from "sonner";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

const WarehouseProjectDetail = () => {
  const { warehouseProjectId } = useParams<{ warehouseProjectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useRealtimeInvalidation({
    channelName: `wp-detail-${warehouseProjectId}`,
    tables: ['warehouse_projects', 'warehouse_project_tasks', 'packing_projects'],
    queryKeys: [
      ['warehouse-project', warehouseProjectId || ''],
      ['warehouse-project-tasks', warehouseProjectId || ''],
      ['warehouse-project-packings', warehouseProjectId || ''],
    ],
  });

  const { data: project, isLoading } = useQuery({
    queryKey: ['warehouse-project', warehouseProjectId],
    queryFn: () => fetchWarehouseProject(warehouseProjectId!),
    enabled: !!warehouseProjectId,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['warehouse-project-tasks', warehouseProjectId],
    queryFn: () => fetchWarehouseProjectTasks(warehouseProjectId!),
    enabled: !!warehouseProjectId,
  });

  const { data: packings = [] } = useQuery({
    queryKey: ['warehouse-project-packings', warehouseProjectId],
    queryFn: () => fetchWarehousePackings(warehouseProjectId!),
    enabled: !!warehouseProjectId,
  });

  const handleDelete = async () => {
    if (!warehouseProjectId) return;
    if (!confirm('Ta bort lagerprojektet? Detta tar även bort alla moment.')) return;
    try {
      await deleteWarehouseProject(warehouseProjectId);
      toast.success('Lagerprojekt borttaget');
      navigate('/warehouse/packing');
    } catch (err) {
      console.error(err);
      toast.error('Kunde inte ta bort');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-32 bg-muted/20 animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Lagerprojektet kunde inte hittas.</p>
        <Button variant="outline" onClick={() => navigate('/warehouse/packing')} className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Tillbaka
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--gradient-page)' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px]">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/warehouse/packing')}
          className="mb-4 -ml-2"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Tillbaka till lager
        </Button>

        <div className="rounded-2xl border border-border/40 bg-card p-6 shadow-sm mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                  {project.project_number}
                </span>
                <Badge className={WAREHOUSE_PROJECT_STATUS_COLORS[project.status]}>
                  {WAREHOUSE_PROJECT_STATUS_LABELS[project.status]}
                </Badge>
              </div>
              <h1 className="text-2xl font-semibold text-[hsl(var(--heading))]">{project.name}</h1>
              {(project.start_date || project.end_date) && (
                <p className="text-sm text-muted-foreground mt-1">
                  {project.start_date && format(new Date(project.start_date), 'd MMM yyyy', { locale: sv })}
                  {project.start_date && project.end_date && ' – '}
                  {project.end_date && format(new Date(project.end_date), 'd MMM yyyy', { locale: sv })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4 mr-2" /> Ta bort
              </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Översikt</TabsTrigger>
            <TabsTrigger value="packings">Packningar</TabsTrigger>
            <TabsTrigger value="tasks">Moment ({tasks.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div className="rounded-xl border border-border/40 bg-card p-6">
              <h3 className="font-semibold mb-3">Anteckningar</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {project.notes || 'Inga anteckningar.'}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="packings" className="mt-4">
            {packings.length === 0 ? (
              <div className="rounded-xl border border-border/40 bg-card p-6 text-center">
                <Package className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Inga packningar skapade ännu för det här lagerprojektet.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {packings.map((packing) => (
                  <PackingCard
                    key={packing.id}
                    packing={packing}
                    onClick={() => navigate(`/warehouse/packing/${packing.id}`)}
                    onDelete={() => {/* deletion handled in PackingDetail */}}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="tasks" className="mt-4">
            {tasks.length === 0 ? (
              <div className="rounded-xl border border-border/40 bg-card p-6 text-center">
                <Wrench className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">Inga moment ännu.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border/40 bg-card divide-y divide-border/40 overflow-hidden">
                {tasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <Wrench className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-foreground">{task.title}</h4>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                          {WAREHOUSE_PROJECT_STATUS_LABELS[task.status]}
                        </Badge>
                      </div>
                      {(task.start_date || task.end_date) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {task.start_date && format(new Date(task.start_date), 'd MMM', { locale: sv })}
                          {task.start_date && task.end_date && ' – '}
                          {task.end_date && format(new Date(task.end_date), 'd MMM yyyy', { locale: sv })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default WarehouseProjectDetail;
