import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, CheckCircle2, AlertTriangle, Clock, Filter, ArrowUpDown, FolderKanban, Building2 } from 'lucide-react';
import { useCurrentStaffId } from '@/hooks/useCurrentStaffId';
import { fetchMyProjects, MyProjectItem } from '@/services/myProjectsService';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { format, isPast, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';

const STATUS_LABELS: Record<string, string> = {
  planning: 'Planering',
  in_progress: 'Pågående',
  delivered: 'Levererat',
  completed: 'Avslutat',
  active: 'Aktiv',
};

const STATUS_BADGE: Record<string, string> = {
  planning: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-amber-50 text-amber-700',
  delivered: 'bg-purple-50 text-purple-700',
  completed: 'bg-emerald-50 text-emerald-700',
  active: 'bg-emerald-50 text-emerald-700',
};

const MyProjects: React.FC = () => {
  const navigate = useNavigate();
  const { staffId, isLoading: staffLoading } = useCurrentStaffId();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name');

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['my-projects', staffId],
    queryFn: () => fetchMyProjects(staffId!),
    enabled: !!staffId,
  });

  const isLoading = staffLoading || projectsLoading;

  const filtered = useMemo(() => {
    let list = [...projects];
    if (statusFilter !== 'all') list = list.filter(p => p.status === statusFilter);
    if (typeFilter !== 'all') list = list.filter(p => p.type === typeFilter);

    list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'sv');
      if (sortBy === 'date') return (a.eventDate || '').localeCompare(b.eventDate || '');
      if (sortBy === 'deadline') return (a.nextDeadline || '9999').localeCompare(b.nextDeadline || '9999');
      return 0;
    });
    return list;
  }, [projects, statusFilter, typeFilter, sortBy]);

  // Stats
  const activeCount = projects.filter(p => p.status !== 'completed').length;
  const openTasks = projects.reduce((sum, p) => sum + (p.totalTasks - p.completedTasks), 0);
  const overdueTasks = projects.reduce((sum, p) => {
    if (p.nextDeadline && isPast(parseISO(p.nextDeadline))) return sum + 1;
    return sum;
  }, 0);

  const handleClick = (project: MyProjectItem) => {
    if (project.type === 'large') {
      navigate(`/large-project/${project.id}`);
    } else {
      navigate(`/project/${project.id}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary text-primary-foreground shadow-md">
          <Briefcase className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Mina projekt</h1>
          <p className="text-sm text-muted-foreground">Samlad översikt över dina aktiva projekt</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-[3px] border-l-primary">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <FolderKanban className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold text-foreground">{isLoading ? '–' : activeCount}</p>
              <p className="text-sm text-muted-foreground">Aktiva projekt</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-[3px] border-l-primary">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold text-foreground">{isLoading ? '–' : openTasks}</p>
              <p className="text-sm text-muted-foreground">Öppna uppgifter</p>
            </div>
          </CardContent>
        </Card>
        <Card className={cn("border-l-[3px]", overdueTasks > 0 ? "border-l-destructive" : "border-l-primary")}>
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <AlertTriangle className={cn("h-5 w-5", overdueTasks > 0 ? "text-destructive" : "text-primary")} />
            <div>
              <p className={cn("text-2xl font-bold", overdueTasks > 0 ? "text-destructive" : "text-foreground")}>{isLoading ? '–' : overdueTasks}</p>
              <p className="text-sm text-muted-foreground">Försenade</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] bg-card">
            <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-card">
            <SelectItem value="all">Alla statusar</SelectItem>
            <SelectItem value="planning">Planering</SelectItem>
            <SelectItem value="in_progress">Pågående</SelectItem>
            <SelectItem value="delivered">Levererat</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px] bg-card">
            <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Typ" />
          </SelectTrigger>
          <SelectContent className="bg-card">
            <SelectItem value="all">Alla typer</SelectItem>
            <SelectItem value="standard">Projekt</SelectItem>
            <SelectItem value="large">Stora projekt</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[160px] bg-card">
            <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Sortera" />
          </SelectTrigger>
          <SelectContent className="bg-card">
            <SelectItem value="name">Namn</SelectItem>
            <SelectItem value="date">Eventdatum</SelectItem>
            <SelectItem value="deadline">Nästa deadline</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Project Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Briefcase className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {projects.length === 0
                ? 'Du har inga aktiva projekt just nu.'
                : 'Inga projekt matchar filtret.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(project => {
            const progress = project.totalTasks > 0
              ? Math.round((project.completedTasks / project.totalTasks) * 100)
              : 0;
            const isOverdue = project.nextDeadline && isPast(parseISO(project.nextDeadline));

            return (
              <Card
                key={`${project.type}-${project.id}`}
                className="cursor-pointer hover:shadow-md transition-shadow border-l-[3px] border-l-primary"
                onClick={() => handleClick(project)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + badges */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-base text-foreground truncate">{project.name}</h3>
                        <span className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          STATUS_BADGE[project.status] || 'bg-muted text-muted-foreground'
                        )}>
                          {STATUS_LABELS[project.status] || project.status}
                        </span>
                        {project.type === 'large' && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                            Stort projekt
                          </span>
                        )}
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          project.role === 'leader'
                            ? "bg-teal-50 text-teal-700"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {project.role === 'leader' ? 'Projektledare' : 'Tilldelad'}
                        </span>
                      </div>

                      {/* Row 2: Meta info */}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                        {project.clientName && <span>{project.clientName}</span>}
                        {project.eventDate && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {format(parseISO(project.eventDate), 'd MMM yyyy', { locale: sv })}
                          </span>
                        )}
                        {project.nextDeadline && (
                          <span className={cn("flex items-center gap-1", isOverdue && "text-destructive font-medium")}>
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {isOverdue ? 'Försenad: ' : 'Deadline: '}
                            {format(parseISO(project.nextDeadline), 'd MMM', { locale: sv })}
                          </span>
                        )}
                      </div>

                      {/* Row 3: Progress */}
                      {project.totalTasks > 0 && (
                        <div className="flex items-center gap-3">
                          <Progress value={progress} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {project.completedTasks}/{project.totalTasks} klara
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyProjects;
