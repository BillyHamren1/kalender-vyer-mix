import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Search, Filter, X, CalendarDays, ChevronRight, FolderKanban } from 'lucide-react';

import { fetchJobs } from '@/services/jobService';
import { fetchProjects } from '@/services/projectService';
import { fetchLargeProjects } from '@/services/largeProjectService';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface UnifiedProject {
  id: string;
  name: string;
  type: 'small' | 'medium' | 'large';
  date: string | null;
  status: string;
  subtitle: string | null;
  navigateTo: string;
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

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Alla statusar' },
  { value: 'planning', label: 'Planering' },
  { value: 'in_progress', label: 'Under arbete' },
  { value: 'completed', label: 'Avslutade' },
];

const STATUS_LABELS: Record<string, string> = {
  planning: 'Planering',
  in_progress: 'Under arbete',
  completed: 'Avslutad',
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'd MMM yyyy', { locale: sv });
  } catch {
    return dateStr;
  }
};

const DashboardAllProjects: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({ queryKey: ['jobs'], queryFn: fetchJobs });
  const { data: projects = [], isLoading: projectsLoading } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects });
  const { data: largeProjects = [], isLoading: largeLoading } = useQuery({ queryKey: ['large-projects'], queryFn: fetchLargeProjects });

  const isLoading = jobsLoading || projectsLoading || largeLoading;

  const unified = useMemo<UnifiedProject[]>(() => {
    const items: UnifiedProject[] = [];

    jobs.forEach(j => items.push({
      id: j.id,
      name: j.name,
      type: 'small',
      date: j.booking?.eventDate ?? null,
      status: j.status === 'planned' ? 'planning' : j.status,
      subtitle: j.booking?.client ?? null,
      navigateTo: `/jobs/${j.id}`,
    }));

    projects.forEach(p => items.push({
      id: p.id,
      name: p.name,
      type: 'medium',
      date: p.booking?.eventdate ?? null,
      status: p.status,
      subtitle: p.booking?.client ?? p.project_leader ?? null,
      navigateTo: `/project/${p.id}`,
    }));

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
    const q = search.toLowerCase().trim();
    return unified
      .filter(p => {
        if (q && !p.name.toLowerCase().includes(q) && !(p.subtitle?.toLowerCase().includes(q))) return false;
        if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
        if (dateFrom && p.date && new Date(p.date) < dateFrom) return false;
        if (dateTo && p.date) {
          const endOfDay = new Date(dateTo);
          endOfDay.setHours(23, 59, 59, 999);
          if (new Date(p.date) > endOfDay) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
  }, [unified, search, statusFilter, dateFrom, dateTo]);

  const hasActiveFilters = search || statusFilter !== 'ALL' || dateFrom || dateTo;

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  return (
    <div className="rounded-2xl bg-gradient-to-br from-card to-card/80 shadow border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FolderKanban className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Alla projekt
          </h2>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {filtered.length}
            {filtered.length !== unified.length && ` / ${unified.length}`}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 w-52 text-sm rounded-xl"
              placeholder="Sök projekt, klient…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-40 text-sm rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-8 text-sm rounded-xl gap-1.5', dateFrom ? 'text-foreground' : 'text-muted-foreground')}>
                <CalendarDays className="w-3.5 h-3.5" />
                {dateFrom ? format(dateFrom, 'd MMM', { locale: sv }) : 'Från'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-8 text-sm rounded-xl gap-1.5', dateTo ? 'text-foreground' : 'text-muted-foreground')}>
                <CalendarDays className="w-3.5 h-3.5" />
                {dateTo ? format(dateTo, 'd MMM', { locale: sv }) : 'Till'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-sm rounded-xl text-muted-foreground hover:text-foreground gap-1" onClick={resetFilters}>
              <X className="w-3.5 h-3.5" />
              Rensa
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="max-h-[600px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            Hämtar projekt…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-muted-foreground text-sm">Inga projekt hittades</span>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" className="rounded-xl text-sm" onClick={resetFilters}>
                <X className="w-3.5 h-3.5 mr-1.5" />
                Rensa filter
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Typ</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Namn</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Klient</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Datum</th>
                <th className="w-8 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((project, idx) => (
                <tr
                  key={`${project.type}-${project.id}`}
                  onClick={() => navigate(project.navigateTo)}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-muted/40 border-b border-border/20',
                    idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/10'
                  )}
                >
                  <td className="px-4 py-3">
                    <Badge className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${TYPE_BADGE_CLASSES[project.type]}`}>
                      {TYPE_LABELS[project.type]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground max-w-[220px] truncate">
                    {project.name}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">
                    {project.subtitle || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">
                      {STATUS_LABELS[project.status] || project.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(project.date)}
                  </td>
                  <td className="px-2 py-3">
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-40" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default DashboardAllProjects;
