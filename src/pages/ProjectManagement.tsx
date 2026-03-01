import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, FolderKanban, Archive, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import CreateProjectWizard from "@/components/project/CreateProjectWizard";
import { IncomingBookingsList } from "@/components/project/IncomingBookingsList";
import { AddToLargeProjectDialog } from "@/components/project/AddToLargeProjectDialog";
import JobsListPanel from "@/components/project/JobsListPanel";
import LargeProjectsListPanel from "@/components/project/LargeProjectsListPanel";
import MediumProjectsListPanel from "@/components/project/MediumProjectsListPanel";
import { deleteProject } from "@/services/projectService";
import { toast } from "sonner";

export type GlobalStatusFilter = 'all_active' | 'planning' | 'in_progress' | 'completed' | 'all';

const GLOBAL_STATUS_OPTIONS: Record<GlobalStatusFilter, string> = {
  all_active: 'Alla aktiva',
  planning: 'Planering',
  in_progress: 'Pågående',
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
    <PageContainer>
        {/* Header */}
        <PageHeader
          icon={FolderKanban}
          title="Projekthantering"
          subtitle="Hantera små, medelstora och stora projekt"
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

        {/* Incoming Bookings - compact */}
        <div className="mb-6">
          <IncomingBookingsList 
            onCreateProject={handleCreateProject}
            onCreateLargeProject={handleCreateLargeProject}
          />
        </div>

        {/* Global Search & Filter */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input
              placeholder="Sök i alla projekt..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="pl-9 h-9 rounded-lg"
            />
          </div>
          <Select value={globalStatusFilter} onValueChange={(v) => setGlobalStatusFilter(v as GlobalStatusFilter)}>
            <SelectTrigger className="h-9 w-[160px] rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(GLOBAL_STATUS_OPTIONS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Three Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <JobsListPanel externalSearch={globalSearch} externalStatusFilter={globalStatusFilter} />
          <MediumProjectsListPanel externalSearch={globalSearch} externalStatusFilter={globalStatusFilter} />
          <LargeProjectsListPanel externalSearch={globalSearch} externalStatusFilter={globalStatusFilter} />
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

        <AddToLargeProjectDialog
          open={!!largeProjectBookingId}
          onOpenChange={(open) => !open && setLargeProjectBookingId(null)}
          bookingId={largeProjectBookingId || ''}
        />
    </PageContainer>
  );
};

export default ProjectManagement;
