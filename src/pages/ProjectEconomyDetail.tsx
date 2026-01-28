import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectEconomyTab } from '@/components/project/ProjectEconomyTab';

const ProjectEconomyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: project, isLoading } = useQuery({
    queryKey: ['project-economy-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, booking:bookings(id, client, eventdate)')
        .eq('id', id!)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Projektet kunde inte hittas.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ekonomi: {project.name}</h1>
          <p className="text-muted-foreground">Projektets ekonomiska översikt</p>
        </div>
      </div>

      {/* Economy Tab Content */}
      <ProjectEconomyTab 
        projectId={project.id} 
        projectName={project.name}
        bookingId={project.booking_id}
      />
    </div>
  );
};

export default ProjectEconomyDetail;
