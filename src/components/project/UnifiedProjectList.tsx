import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Trash2, ChevronRight, Calendar, FolderKanban } from 'lucide-react';
import { fetchJobs, deleteJob } from '@/services/jobService';
import { fetchProjects, deleteProject } from '@/services/projectService';
import { fetchLargeProjects, deleteLargeProject } from '@/services/largeProjectService';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { GlobalStatusFilter } from '@/pages/ProjectManagement';

export type ProjectTypeFilter = 'all' | 'small' | 'medium' | 'large';

interface UnifiedProject {
  id: string;
  name: string;
  type: 'small' | 'medium' | 'large';
  date: string | null;
  status: string;
  subtitle: string | null;
  navigateTo: string;
}

interface UnifiedProjectListProps {
  search: string;
  statusFilter: GlobalStatusFilter;
  typeFilter: ProjectTypeFilter;
}

const TYPE_LABELS: Record<UnifiedProject['type'], string> = {
  small: 'Litet',
  medium: 'Medel',
  large: 'Stort',
};

const TYPE_BADGE_CLASSES: Record<UnifiedProject['type'], string> = {
  small: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
  medium: 'bg-teal-100 text-teal-700 ring-1 ring-teal-200',
  large: 'bg-purple-100 text-purple-700 ring-1 ring-purple-200',
};

const UnifiedProjectList = ({ search, statusFilter, typeFilter }: UnifiedProjectListProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({ queryKey: ['jobs'], queryFn: fetchJobs });
  const { data: projects = [], isLoading: projectsLoading } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects });
  const { data: largeProjects = [], isLoading: largeLoading } = useQuery({ queryKey: ['large-projects'], queryFn: fetchLargeProjects });

  const isLoading = jobsLoading || projectsLoading || largeLoading;

  const deleteJobMutation = useMutation({
    mutationFn: deleteJob,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['jobs'] }); queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] }); toast.success('Projekt borttaget'); },
    onError: () => toast.error('Kunde inte ta bort projekt'),
  });
  const deleteProjectMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['projects'] }); queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] }); toast.success('Projekt borttaget'); },
    onError: () => toast.error('Kunde inte ta bort projekt'),
  });
  const deleteLargeMutation = useMutation({
    mutationFn: deleteLargeProject,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['large-projects'] }); queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] }); toast.success('Projekt borttaget'); },
    onError: () => toast.error('Kunde inte ta bort projekt'),
  });

  const unified = useMemo<UnifiedProject[]>(() => {
    const items: UnifiedProject[] = [];

    // Jobs (small)
    jobs.forEach(j => items.push({
      id: j.id,
      name: j.name,
      type: 'small',
      date: j.booking?.eventDate ?? null,
      status: j.status === 'planned' ? 'planning' : j.status,
      subtitle: j.booking?.client ?? null,
      navigateTo: `/jobs/${j.id}`,
    }));

    // Medium projects
    projects.forEach(p => items.push({
      id: p.id,
      name: p.name,
      type: 'medium',
      date: p.booking?.eventdate ?? null,
      status: p.status,
      subtitle: p.booking?.client ?? p.project_leader ?? null,
      navigateTo: `/project/${p.id}`,
    }));

    // Large projects
    largeProjects.forEach(lp => items.push({
      id: lp.id,
      name: lp.name,
      type: 'large',
      date: lp.start_date ?? null,
      status: lp.status,
      subtitle: lp.location ?? `${lp.bookingCount ?? 0} bokningar`,
      navigateTo: `/large-project/${lp.id}`,
    }));

    return items;
  }, [jobs, projects, largeProjects]);

  const filtered = useMemo(() => {
    return unified
      .filter(p => {
        // Type filter
        if (typeFilter !== 'all' && p.type !== typeFilter) return false;

        // Search
        if (search) {
          const q = search.toLowerCase();
          if (!p.name.toLowerCase().includes(q) && !(p.subtitle?.toLowerCase().includes(q))) return false;
        }

        // Status filter
        if (statusFilter === 'all') return true;
        if (statusFilter === 'all_active') return p.status !== 'completed';
        if (statusFilter === 'planning') return p.status === 'planning';
        if (statusFilter === 'in_progress') return p.status === 'in_progress';
        if (statusFilter === 'completed') return p.status === 'completed';
        return p.status !== 'completed';
      })
      .sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
  }, [unified, search, statusFilter, typeFilter]);

  const handleDelete = (e: React.MouseEvent, project: UnifiedProject) => {
    e.stopPropagation();
    if (!confirm('Är du säker på att du vill ta bort detta projekt?')) return;
    if (project.type === 'small') deleteJobMutation.mutate(project.id);
    else if (project.type === 'medium') deleteProjectMutation.mutate(project.id);
    else deleteLargeMutation.mutate(project.id);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try { return format(new Date(dateStr), 'd MMM yyyy', { locale: sv }); }
    catch { return dateStr; }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-12 bg-muted/40 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card text-center py-16 px-4">
        <FolderKanban className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm font-medium text-muted-foreground">Inga projekt hittades</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Prova att ändra sök eller filter</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
      <div className="divide-y divide-border/40">
        {filtered.map(project => (
          <div
            key={`${project.type}-${project.id}`}
            onClick={() => navigate(project.navigateTo)}
            className="group/row flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
          >
            {/* Type badge */}
            <Badge className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md ${TYPE_BADGE_CLASSES[project.type]}`}>
              {TYPE_LABELS[project.type]}
            </Badge>

            {/* Name + subtitle */}
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-foreground truncate group-hover/row:text-primary transition-colors">
                {project.name}
              </h4>
              {project.subtitle && (
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{project.subtitle}</p>
              )}
            </div>

            {/* Date */}
            <span className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {formatDate(project.date)}
            </span>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={(e) => handleDelete(e, project)}
                className="p-1 rounded opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover/row:text-primary/50 transition-colors" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UnifiedProjectList;
