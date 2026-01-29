import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ProjectCard from "@/components/project/ProjectCard";
import CreateProjectWizard from "@/components/project/CreateProjectWizard";
import { IncomingBookingsList } from "@/components/project/IncomingBookingsList";
import JobsListPanel from "@/components/project/JobsListPanel";
import { fetchProjects, deleteProject } from "@/services/projectService";
import { ProjectStatus, PROJECT_STATUS_LABELS } from "@/types/project";
import { toast } from "sonner";

const ProjectManagement = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Projekt borttaget');
    },
    onError: () => toast.error('Kunde inte ta bort projekt')
  });

  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(search.toLowerCase()) ||
      project.booking?.client?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleProjectClick = (projectId: string) => {
    navigate(`/project/${projectId}`);
  };

  const handleDelete = (projectId: string) => {
    if (confirm('Är du säker på att du vill ta bort detta projekt?')) {
      deleteMutation.mutate(projectId);
    }
  };

  const handleCreateProject = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setIsCreateOpen(true);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <FolderKanban className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Projekthantering</h1>
            <p className="text-muted-foreground">Hantera dina projekt och jobb</p>
          </div>
        </div>
        <Button onClick={() => { setSelectedBookingId(null); setIsCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nytt projekt
        </Button>
      </div>

      {/* Incoming Bookings Section */}
      <div className="mb-8">
        <IncomingBookingsList 
          onCreateProject={handleCreateProject}
        />
      </div>

      {/* Two Column Layout: Projects & Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Projects Column - takes 2/3 */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderKanban className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Projekt</CardTitle>
                </div>
                <Badge variant="outline">{filteredProjects.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Sök projekt..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ProjectStatus | "all")}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Filtrera status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla statusar</SelectItem>
                    {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Project Grid */}
              <div className="max-h-[600px] overflow-y-auto pr-1">
                {isLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
                    ))}
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <div className="text-center py-12">
                    <FolderKanban className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {search || statusFilter !== "all" 
                        ? "Inga projekt hittades" 
                        : "Inga projekt skapade ännu"}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredProjects.map(project => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onClick={() => handleProjectClick(project.id)}
                        onDelete={() => handleDelete(project.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Jobs Column - takes 1/3 */}
        <div className="lg:col-span-1">
          <JobsListPanel />
        </div>
      </div>

      <CreateProjectWizard 
        open={isCreateOpen} 
        onOpenChange={setIsCreateOpen}
        preselectedBookingId={selectedBookingId}
        onSuccess={() => {
          setIsCreateOpen(false);
          setSelectedBookingId(null);
          queryClient.invalidateQueries({ queryKey: ['projects'] });
          queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
        }}
      />
    </div>
  );
};

export default ProjectManagement;
