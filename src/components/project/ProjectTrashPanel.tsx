import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchDeletedProjects, restoreProject } from '@/services/projectService';
import { fetchDeletedJobs, restoreJob } from '@/services/jobService';
import { fetchDeletedLargeProjects, restoreLargeProject } from '@/services/largeProjectService';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

const TYPE_LABELS: Record<string, string> = { small: 'Litet', medium: 'Medel', large: 'Stort' };

const ProjectTrashPanel = () => {
  const queryClient = useQueryClient();

  const { data: deletedJobs = [] } = useQuery({ queryKey: ['deleted-jobs'], queryFn: fetchDeletedJobs });
  const { data: deletedProjects = [] } = useQuery({ queryKey: ['deleted-projects'], queryFn: fetchDeletedProjects });
  const { data: deletedLarge = [] } = useQuery({ queryKey: ['deleted-large-projects'], queryFn: fetchDeletedLargeProjects });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['deleted-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['deleted-projects'] });
    queryClient.invalidateQueries({ queryKey: ['deleted-large-projects'] });
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['large-projects'] });
  };

  const restoreJobMutation = useMutation({
    mutationFn: restoreJob,
    onSuccess: () => { invalidateAll(); toast.success('Jobb återställt'); },
  });
  const restoreProjectMutation = useMutation({
    mutationFn: restoreProject,
    onSuccess: () => { invalidateAll(); toast.success('Projekt återställt'); },
  });
  const restoreLargeMutation = useMutation({
    mutationFn: restoreLargeProject,
    onSuccess: () => { invalidateAll(); toast.success('Stort projekt återställt'); },
  });

  const allDeleted = [
    ...deletedJobs.map(j => ({ id: j.id, name: j.name, type: 'small' as const, deletedAt: j.deleted_at, restore: () => restoreJobMutation.mutate(j.id) })),
    ...deletedProjects.map(p => ({ id: p.id, name: p.name, type: 'medium' as const, deletedAt: p.deleted_at, restore: () => restoreProjectMutation.mutate(p.id) })),
    ...deletedLarge.map(lp => ({ id: lp.id, name: lp.name, type: 'large' as const, deletedAt: lp.deleted_at, restore: () => restoreLargeMutation.mutate(lp.id) })),
  ].sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

  if (allDeleted.length === 0) return null;

  return (
    <Card className="border-destructive/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trash2 className="h-4 w-4 text-destructive" />
          Papperskorg
          <Badge variant="secondary" className="text-xs">{allDeleted.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {allDeleted.map(item => (
          <div key={`${item.type}-${item.id}`} className="flex items-center justify-between py-2 px-2 rounded-md bg-muted/30">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] shrink-0">{TYPE_LABELS[item.type]}</Badge>
                <span className="text-sm font-medium truncate">{item.name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Raderat {format(new Date(item.deletedAt), 'd MMM yyyy HH:mm', { locale: sv })}
              </p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 ml-2" onClick={item.restore}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Återställ
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default ProjectTrashPanel;
