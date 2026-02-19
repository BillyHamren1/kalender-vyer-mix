import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, FolderKanban, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const ProjectManagement = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [largeProjectBookingId, setLargeProjectBookingId] = useState<string | null>(null);

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

        {/* Three Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <JobsListPanel />
          <MediumProjectsListPanel />
          <LargeProjectsListPanel />
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
