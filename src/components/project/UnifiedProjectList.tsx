import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, Calendar, FolderKanban, AlertTriangle, Search } from 'lucide-react';
import { fetchJobs, deleteJob } from '@/services/jobService';
import { fetchProjects, deleteProject } from '@/services/projectService';
import { fetchLargeProjects, deleteLargeProject } from '@/services/largeProjectService';
import { convertToMedium, prepareConvertToLarge, getBookingIdForProject, type ProjectType } from '@/services/projectConversionService';
import ProjectActionMenu from '@/components/project/ProjectActionMenu';
import { AddToLargeProjectDialog } from '@/components/project/AddToLargeProjectDialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { GlobalStatusFilter } from '@/pages/ProjectManagement';

export type ProjectTypeFilter = 'all' | 'medium' | 'large';

interface UnifiedProject {
  id: string;
  name: string;
  type: 'small' | 'medium' | 'large';
  date: string | null;
  eventDate: string | null;
  status: string;
  subtitle: string | null;
  address: string | null;
  navigateTo: string;
  bookingCancelled?: boolean;
  bookingId?: string | null;
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
  small: 'bg-[hsl(var(--project-small))] text-[hsl(var(--project-small-foreground))] ring-1 ring-[hsl(var(--project-small-border))]',
  medium: 'bg-[hsl(var(--project-medium))] text-[hsl(var(--project-medium-foreground))] ring-1 ring-[hsl(var(--project-medium-border))]',
  large: 'bg-[hsl(var(--project-large))] text-[hsl(var(--project-large-foreground))] ring-1 ring-[hsl(var(--project-large-border))]',
};

const UnifiedProjectList = ({ search, statusFilter, typeFilter }: UnifiedProjectListProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [largeProjectBookingId, setLargeProjectBookingId] = useState<string | null>(null);

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({ queryKey: ['jobs'], queryFn: fetchJobs });
  const { data: projects = [], isLoading: projectsLoading } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects });
  const { data: largeProjects = [], isLoading: largeLoading } = useQuery({ queryKey: ['large-projects'], queryFn: fetchLargeProjects });

  const isLoading = jobsLoading || projectsLoading || largeLoading;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['large-projects'] });
    queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
  };

  const deleteJobMutation = useMutation({
    mutationFn: deleteJob,
    onSuccess: () => { invalidateAll(); toast.success('Litet projekt borttaget'); },
    onError: (err: any) => toast.error(err.message || 'Kunde inte ta bort projekt'),
  });
  const deleteProjectMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => { invalidateAll(); toast.success('Medelprojekt borttaget'); },
    onError: (err: any) => toast.error(err.message || 'Kunde inte ta bort projekt'),
  });
  const deleteLargeMutation = useMutation({
    mutationFn: deleteLargeProject,
    onSuccess: () => { invalidateAll(); toast.success('Stort projekt borttaget'); },
    onError: (err: any) => toast.error(err.message || 'Kunde inte ta bort projekt'),
  });

  const unified = useMemo<UnifiedProject[]>(() => {
    const items: UnifiedProject[] = [];

    jobs.forEach(j => items.push({
      id: j.id,
      name: j.booking?.client ? `${j.booking.client}${j.booking.bookingNumber ? ' #' + j.booking.bookingNumber : ''}` : j.name,
      type: 'small',
      date: j.booking?.eventDate ?? null,
      eventDate: j.booking?.eventDate ?? null,
      status: j.status === 'planned' ? 'planning' : j.status,
      subtitle: j.booking?.deliveryAddress ?? null,
      address: j.booking?.deliveryAddress ?? null,
      navigateTo: `/jobs/${j.id}`,
      bookingCancelled: j.booking?.status === 'CANCELLED',
      bookingId: j.bookingId,
    }));

    projects.forEach(p => {
      const client = p.booking?.client;
      const bookingNum = p.booking?.booking_number;
      const displayName = client ? `${client}${bookingNum ? ' #' + bookingNum : ''}` : p.name;
      const addressParts = [p.booking?.deliveryaddress, p.booking?.delivery_city].filter(Boolean);
      const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : null;
      items.push({
        id: p.id,
        name: displayName,
        type: 'medium',
        date: p.booking?.eventdate ?? null,
        eventDate: p.booking?.eventdate ?? p.eventdate ?? null,
        status: p.status,
        subtitle: fullAddress,
        address: fullAddress,
        navigateTo: `/project/${p.id}`,
        bookingCancelled: (p.booking as any)?.status === 'CANCELLED',
        bookingId: p.booking_id,
      });
    });

    largeProjects.forEach(lp => items.push({
      id: lp.id,
      name: lp.name,
      type: 'large',
      date: lp.start_date ?? null,
      eventDate: lp.end_date ?? lp.start_date ?? null,
      status: lp.status,
      subtitle: lp.location ?? `${lp.bookingCount ?? 0} bokningar`,
      address: lp.location ?? null,
      navigateTo: `/large-project/${lp.id}`,
      bookingId: null,
    }));

    return items;
  }, [jobs, projects, largeProjects]);

  const hasActiveFilters = search.trim().length > 0 || statusFilter !== 'all_active' || typeFilter !== 'all';

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const filtered = useMemo(() => {
    if (!hasActiveFilters) return [];
    return unified
      .filter(p => {
        if (typeFilter !== 'all' && p.type !== typeFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!p.name.toLowerCase().includes(q) && !(p.subtitle?.toLowerCase().includes(q))) return false;
        }
        if (statusFilter === 'all') return true;
        if (statusFilter === 'all_active') return p.status !== 'completed';
        if (statusFilter === 'planning') return p.status === 'planning';
        if (statusFilter === 'in_progress') return p.status === 'in_progress';
        if (statusFilter === 'closing') {
          // Projects past event date but not yet completed
          return p.status !== 'completed' && p.eventDate && p.eventDate < today;
        }
        if (statusFilter === 'completed') return p.status === 'completed';
        return p.status !== 'completed';
      })
      .sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
  }, [unified, search, statusFilter, typeFilter, hasActiveFilters]);

  const handleDelete = (project: UnifiedProject) => {
    const typeLabel = TYPE_LABELS[project.type];
    if (!confirm(`Ta bort ${typeLabel} projekt: "${project.name}"?\n\nBokningen kommer att frigöras och kan tilldelas ett nytt projekt.`)) return;
    if (project.type === 'small') deleteJobMutation.mutate(project.id);
    else if (project.type === 'medium') deleteProjectMutation.mutate(project.id);
    else deleteLargeMutation.mutate(project.id);
  };

  const handleConvert = async (project: UnifiedProject, targetType: ProjectType) => {
    // Large projects can't be converted (they have multiple bookings)
    if (project.type === 'large') {
      toast.error('Stora projekt med flera bokningar kan inte konverteras direkt');
      return;
    }

    const bookingId = project.bookingId;
    if (!bookingId) {
      toast.error('Projektet har ingen kopplad bokning att konvertera');
      return;
    }

    if (!confirm(`Ändra till ${targetType === 'medium' ? 'medel' : 'stort'} projekt? Det befintliga projektet raderas och ett nytt skapas.`)) return;

    const current = { type: project.type, id: project.id };

    try {
      if (targetType === 'medium') {
        const newId = await convertToMedium(current, bookingId);
        invalidateAll();
        toast.success('Projekt konverterat till medel');
        navigate(`/project/${newId}`);
      } else {
        await prepareConvertToLarge(current, bookingId);
        invalidateAll();
        setLargeProjectBookingId(bookingId);
      }
    } catch (err: any) {
      console.error('Conversion error:', err);
      toast.error(err.message || 'Kunde inte konvertera projekt');
    }
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

  if (!hasActiveFilters) {
    return null;
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
    <>
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
        <div className="divide-y divide-border/40">
          {filtered.map(project => {
            const isPending = 
              (project.type === 'small' && deleteJobMutation.isPending && deleteJobMutation.variables === project.id) ||
              (project.type === 'medium' && deleteProjectMutation.isPending && deleteProjectMutation.variables === project.id) ||
              (project.type === 'large' && deleteLargeMutation.isPending && deleteLargeMutation.variables === project.id);

            return (
            <div
              key={`${project.type}-${project.id}`}
              onClick={() => !isPending && navigate(project.navigateTo)}
              className={`group/row flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-all ${project.bookingCancelled ? 'bg-red-50/60 dark:bg-red-950/20' : ''} ${isPending ? 'opacity-40 pointer-events-none' : ''}`}
            >
              <Badge className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md ${TYPE_BADGE_CLASSES[project.type]}`}>
                {TYPE_LABELS[project.type]}
              </Badge>

              {project.bookingCancelled && (
                <Badge className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 ring-1 ring-red-300 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-700 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  AVBOKAD
                </Badge>
              )}

              <div className="flex-1 min-w-0">
                <h4 className={`text-sm font-medium truncate group-hover/row:text-primary transition-colors ${project.bookingCancelled ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {project.name}
                </h4>
                {project.subtitle && (
                  <p className={`text-[11px] truncate mt-0.5 ${project.bookingCancelled ? 'line-through text-muted-foreground/60' : 'text-muted-foreground'}`}>{project.subtitle}</p>
                )}
              </div>

              <span className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {formatDate(project.date)}
              </span>

              <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                <ProjectActionMenu
                  currentType={project.type}
                  onConvert={(targetType) => handleConvert(project, targetType)}
                  onDelete={() => handleDelete(project)}
                  triggerClassName="p-1 h-7 w-7 rounded opacity-0 group-hover/row:opacity-100 transition-opacity"
                  disabled={isPending}
                />
                <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover/row:text-primary/50 transition-colors" />
              </div>
            </div>
            );
          })}
        </div>
      </div>

      <AddToLargeProjectDialog
        open={!!largeProjectBookingId}
        onOpenChange={(open) => !open && setLargeProjectBookingId(null)}
        bookingId={largeProjectBookingId || ''}
      />
    </>
  );
};

export default UnifiedProjectList;
