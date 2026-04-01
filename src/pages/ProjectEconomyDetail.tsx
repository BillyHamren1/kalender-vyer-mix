import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Unlock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ProjectEconomyTab } from '@/components/project/ProjectEconomyTab';
import { toast } from 'sonner';

const ProjectEconomyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isReopening, setIsReopening] = useState(false);

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

  const handleReopenProject = async () => {
    if (!project) return;
    setIsReopening(true);
    try {
      if (project.booking_id) {
        const { reopenBookingsInInvoicing } = await import('@/services/bookingCloseSyncService');
        const result = await reopenBookingsInInvoicing([project.booking_id]);
        if (result.failedIds.length > 0) {
          toast.error('Kunde inte återöppna i Booking — projektet förblir stängt');
          setIsReopening(false);
          return;
        }
      }
      const { error } = await supabase
        .from('projects')
        .update({ status: 'delivered' })
        .eq('id', project.id);
      if (error) throw error;
      toast.success(`${project.name} har återöppnats`);
      queryClient.invalidateQueries({ queryKey: ['project-economy-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['economy-overview'] });
    } catch (err) {
      console.error('Reopen project error:', err);
      toast.error('Kunde inte återöppna projektet');
    } finally {
      setIsReopening(false);
    }
  };

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

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/economy');
    }
  };

  const isClosed = project.status === 'completed';

  return (
    <div className="p-6 space-y-6 theme-purple">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={handleBack}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">Ekonomi: {project.name}</h1>
            <Badge variant="outline" className={
              isClosed
                ? "border-red-200 text-red-600 bg-red-50 text-[11px] px-2 py-0.5 font-medium"
                : "border-primary/30 text-primary bg-primary/5 text-[11px] px-2 py-0.5 font-medium"
            }>
              {isClosed ? 'STÄNGD' : 'ÖPPEN'}
            </Badge>
          </div>
          <p className="text-muted-foreground">Projektets ekonomiska översikt</p>
        </div>
        {isClosed && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleReopenProject}
            disabled={isReopening}
            className="border-amber-300 text-amber-700 hover:bg-amber-50"
          >
            {isReopening ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Återöppnar...</>
            ) : (
              <><Unlock className="h-4 w-4 mr-1.5" /> Återöppna</>
            )}
          </Button>
        )}
      </div>

      {/* Economy Tab Content — single source of close logic */}
      <ProjectEconomyTab 
        projectId={project.id} 
        projectName={project.name}
        bookingId={project.booking_id}
      />
    </div>
  );
};

export default ProjectEconomyDetail;
