import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, FolderKanban, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProjectCard from "@/components/project/ProjectCard";
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
      <div className="container mx-auto px-4 py-8 max-w-[1600px]">
        {/* Premium Header */}
        <div className="relative mb-10">
          {/* Decorative background */}
          <div className="absolute inset-0 -z-10 overflow-hidden rounded-3xl">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-primary/3 rounded-full blur-2xl" />
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 p-6 rounded-2xl bg-gradient-to-r from-card/80 via-card to-card/80 backdrop-blur-sm border border-border/50 shadow-lg">
            <div className="flex items-center gap-4">
              <div 
                className="relative p-3.5 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg"
                style={{ boxShadow: '0 8px 32px hsl(var(--primary) / 0.3)' }}
              >
                <FolderKanban className="h-7 w-7 text-primary-foreground" />
                <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-primary-foreground/80" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  Projekthantering
                </h1>
                <p className="text-muted-foreground mt-0.5">
                  Hantera små, medelstora och stora projekt
                </p>
              </div>
            </div>
            <Button 
              onClick={() => { setSelectedBookingId(null); setIsCreateOpen(true); }}
              size="lg"
              className="shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 rounded-xl px-6"
              style={{ boxShadow: '0 4px 20px hsl(var(--primary) / 0.25)' }}
            >
              <Plus className="h-5 w-5 mr-2" />
              Nytt projekt
            </Button>
          </div>
        </div>

        {/* Incoming Bookings Section */}
        <div className="mb-10">
          <IncomingBookingsList 
            onCreateProject={handleCreateProject}
            onCreateLargeProject={handleCreateLargeProject}
          />
        </div>

        {/* Three Column Layout: Litet, Medel, Stort */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
