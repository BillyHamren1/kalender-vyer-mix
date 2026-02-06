import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FolderKanban, Search, Calendar, Trash2, ArrowUpRight } from 'lucide-react';
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
    <div className="relative group">
      {/* Premium card container */}
      <div 
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--card) / 0.95) 100%)',
          boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.08), 0 0 0 1px hsl(var(--border) / 0.5)',
        }}
      >
        {/* Gradient accent bar */}
        <div className="h-1.5 bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
        
        {/* Header */}
        <div className="p-5 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20">
                <FolderKanban className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-foreground">Projekt medel</h3>
                <p className="text-xs text-muted-foreground">Full projekthantering</p>
              </div>
            </div>
            <Badge 
              variant="secondary" 
              className="h-7 px-3 text-sm font-medium bg-muted/80 hover:bg-muted"
            >
              {filteredProjects.length}
            </Badge>
          </div>

          {/* Filters */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                placeholder="Sök projekt..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-10 bg-muted/30 border-muted-foreground/10 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ProjectStatus | 'all')}>
              <SelectTrigger className="h-10 bg-muted/30 border-muted-foreground/10 rounded-xl">
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
        </div>

        {/* Project List */}
        <div className="px-5 pb-5">
          <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2.5 scrollbar-thin">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 bg-muted/50 animate-pulse rounded-xl" />
                ))}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-muted/50 flex items-center justify-center">
                  <FolderKanban className="h-7 w-7 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  {search || statusFilter !== 'all' 
                    ? 'Inga projekt hittades' 
                    : 'Inga medelstora projekt ännu'}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Skapa projekt från inkommande bokningar
                </p>
              </div>
            ) : (
              filteredProjects.map(project => (
                <div
                  key={project.id}
                  onClick={() => navigate(`/project/${project.id}`)}
                  className="group/card relative p-4 rounded-xl cursor-pointer transition-all duration-200 hover:-translate-y-0.5 border border-border bg-card shadow-sm hover:border-primary/50 hover:shadow-md"
                >
                  {/* Hover arrow indicator */}
                  <div className="absolute right-3 top-3 opacity-0 group-hover/card:opacity-100 transition-opacity">
                    <ArrowUpRight className="h-4 w-4 text-primary/60" />
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <FolderKanban className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                      <h4 className="font-medium text-foreground truncate mb-1 group-hover/card:text-primary transition-colors">
                        {project.name}
                      </h4>
                      {project.booking?.client && (
                        <p className="text-sm text-muted-foreground truncate mb-2">
                          {project.booking.client}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn("text-xs font-medium", PROJECT_STATUS_COLORS[project.status])}>
                          {PROJECT_STATUS_LABELS[project.status]}
                        </Badge>
                        {project.booking?.eventdate && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {formatDate(project.booking.eventdate)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Delete button */}
                  <button
                    onClick={(e) => handleDelete(e, project.id)}
                    className="absolute right-3 bottom-3 p-1.5 rounded-lg opacity-0 group-hover/card:opacity-100 transition-all hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MediumProjectsListPanel;
