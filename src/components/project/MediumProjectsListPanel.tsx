import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FolderKanban, Search, Calendar, Trash2, ChevronRight } from 'lucide-react';
import { fetchProjects, deleteProject } from '@/services/projectService';
import { ProjectStatus, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS } from '@/types/project';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface MediumProjectsListPanelProps {
  completedOnly?: boolean;
}

const MediumProjectsListPanel = ({ completedOnly = false }: MediumProjectsListPanelProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');

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
    const matchesStatus = statusFilter === 'all'
      ? (completedOnly ? project.status === 'completed' : project.status !== 'completed')
      : project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDelete = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (confirm('Är du säker på att du vill ta bort detta projekt?')) {
      deleteMutation.mutate(projectId);
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), 'd MMM yyyy', { locale: sv });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
      {/* Compact header */}
      <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <FolderKanban className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">Projekt medel</h3>
              <p className="text-[11px] text-muted-foreground leading-none mt-0.5">Full projekthantering</p>
            </div>
          </div>
          <Badge variant="secondary" className="h-5 px-2 text-xs font-medium bg-muted/80">
            {filteredProjects.length}
          </Badge>
        </div>

        {/* Compact inline filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input
              placeholder="Sök..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-card border-border/50 rounded-lg"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ProjectStatus | 'all')}>
            <SelectTrigger className="h-8 w-[110px] text-xs bg-card border-border/50 rounded-lg">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla</SelectItem>
              {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Project List - compact */}
      <div className="max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-muted/40 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-10 px-4">
            <FolderKanban className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs font-medium text-muted-foreground">
              {search || statusFilter !== 'all' ? 'Inga projekt hittades' : 'Inga medelstora projekt ännu'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {filteredProjects.map(project => (
              <div
                key={project.id}
                onClick={() => navigate(`/project/${project.id}`)}
                className="group/card flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-foreground truncate group-hover/card:text-primary transition-colors">
                      {project.name}
                    </h4>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {project.booking?.client && (
                      <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
                        {project.booking.client}
                      </span>
                    )}
                    <Badge className={cn("text-[10px] px-1.5 py-0 h-4 font-medium", PROJECT_STATUS_COLORS[project.status])}>
                      {PROJECT_STATUS_LABELS[project.status]}
                    </Badge>
                    {project.booking?.eventdate && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {formatDate(project.booking.eventdate)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => handleDelete(e, project.id)}
                    className="p-1 rounded opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover/card:text-primary/50 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MediumProjectsListPanel;
