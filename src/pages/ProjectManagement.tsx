import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, FolderKanban, Archive, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import CreateProjectWizard from "@/components/project/CreateProjectWizard";
import { IncomingBookingsList } from "@/components/project/IncomingBookingsList";
import { AddToLargeProjectDialog } from "@/components/project/AddToLargeProjectDialog";
import UnifiedProjectList, { type ProjectTypeFilter } from "@/components/project/UnifiedProjectList";
import ProjectDashboardWidgets from "@/components/project/ProjectDashboardWidgets";
import OrphanBookingsWarning from "@/components/project/OrphanBookingsWarning";
import { deleteProject } from "@/services/projectService";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { toast } from "sonner";

export type GlobalStatusFilter = 'all_active' | 'planning' | 'in_progress' | 'closing' | 'completed' | 'all';

const GLOBAL_STATUS_OPTIONS: Record<GlobalStatusFilter, string> = {
  all_active: 'Alla aktiva',
  planning: 'Planering',
  in_progress: 'Pågående',
  closing: 'Under slutförande',
  completed: 'Avslutade',
  all: 'Alla inkl. gamla',
};

const ProjectManagement = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [largeProjectBookingId, setLargeProjectBookingId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalStatusFilter, setGlobalStatusFilter] = useState<GlobalStatusFilter>('all_active');
  const [typeFilter, setTypeFilter] = useState<ProjectTypeFilter>('all');

  useRealtimeInvalidation({
    channelName: 'project-mgmt-bookings',
    tables: ['bookings'],
    queryKeys: [['bookings-without-project'], ['bookings'], ['projects'], ['dashboard-stats']],
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Projekt borttaget');
    },
    onError: () => toast.error('Kunde inte ta bort projekt')
  });

  const handleCreateProject = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setIsCreateOpen(true);
  };

  const handleCreateLargeProject = (bookingId: string) => {
    setLargeProjectBookingId(bookingId);
  };

  return (
    <PageContainer theme="purple">
        <PageHeader
          icon={FolderKanban}
          title="Projekthantering"
          subtitle="Hantera små, medelstora och stora projekt"
          variant="purple"
        >
          <Button 
            onClick={() => navigate('/projects/archive')}
            variant="outline"
            size="sm"
            className="rounded-lg h-8"
          >
            <Archive className="h-4 w-4 mr-1.5" />
            Arkiv
          </Button>
          <Button 
            onClick={() => { setSelectedBookingId(null); setIsCreateOpen(true); }}
            size="sm"
            className="rounded-lg h-8 shadow-sm bg-primary hover:bg-[hsl(var(--primary-hover))]"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nytt projekt
          </Button>
        </PageHeader>

        {/* Search, Status Filter & Type Filter - moved to top */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input
              placeholder="Sök i alla projekt..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="pl-9 h-9 rounded-lg bg-card"
            />
          </div>
          <Select value={globalStatusFilter} onValueChange={(v) => setGlobalStatusFilter(v as GlobalStatusFilter)}>
            <SelectTrigger className="h-9 w-[160px] rounded-lg bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(GLOBAL_STATUS_OPTIONS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup 
            type="single" 
            value={typeFilter} 
            onValueChange={(v) => v && setTypeFilter(v as ProjectTypeFilter)}
            className="bg-muted/40 rounded-lg p-0.5"
          >
            <ToggleGroupItem value="all" className="h-8 px-3 text-xs rounded-md data-[state=on]:bg-card data-[state=on]:shadow-sm">Alla</ToggleGroupItem>
            <ToggleGroupItem value="medium" className="h-8 px-3 text-xs rounded-md data-[state=on]:bg-[hsl(var(--project-medium))] data-[state=on]:text-[hsl(var(--project-medium-foreground))]">Medel</ToggleGroupItem>
            <ToggleGroupItem value="large" className="h-8 px-3 text-xs rounded-md data-[state=on]:bg-[hsl(var(--project-large))] data-[state=on]:text-[hsl(var(--project-large-foreground))]">Stort</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {!globalSearch.trim() && (
          <>
            <div className="mb-6">
              <IncomingBookingsList 
                onCreateProject={handleCreateProject}
                onCreateLargeProject={handleCreateLargeProject}
              />
            </div>

            <div className="mb-6">
              <ProjectDashboardWidgets />
            </div>

            <div className="mb-6">
              <OrphanBookingsWarning />
            </div>
          </>
        )}

        <UnifiedProjectList
          search={globalSearch}
          statusFilter={globalStatusFilter}
          typeFilter={typeFilter}
        />


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

        <AddToLargeProjectDialog
          open={!!largeProjectBookingId}
          onOpenChange={(open) => !open && setLargeProjectBookingId(null)}
          bookingId={largeProjectBookingId || ''}
        />
    </PageContainer>
  );
};

export default ProjectManagement;
