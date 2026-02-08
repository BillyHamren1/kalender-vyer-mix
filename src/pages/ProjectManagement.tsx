import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, FolderKanban, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 py-6 max-w-[1600px]">
        {/* Compact Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-md">
              <FolderKanban className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Projekthantering</h1>
              <p className="text-sm text-muted-foreground">Hantera små, medelstora och stora projekt</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              onClick={() => navigate('/projects/archive')}
              variant="outline"
              size="sm"
              className="rounded-lg h-9"
            >
              <Archive className="h-4 w-4 mr-1.5" />
              Arkiv
            </Button>
            <Button 
              onClick={() => { setSelectedBookingId(null); setIsCreateOpen(true); }}
              size="sm"
              className="rounded-lg h-9 shadow-sm"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Nytt projekt
            </Button>
          </div>
        </div>

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
      </div>
    </div>
  );
};

export default ProjectManagement;
