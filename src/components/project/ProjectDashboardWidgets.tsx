import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FolderKanban, Clock, CalendarClock, CheckCircle2, ChevronRight } from 'lucide-react';
import { fetchJobs } from '@/services/jobService';
import { fetchProjects } from '@/services/projectService';
import { fetchLargeProjects } from '@/services/largeProjectService';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface UnifiedItem {
  id: string;
  name: string;
  type: 'small' | 'medium' | 'large';
  date: string | null;
  status: string;
  subtitle: string | null;
  navigateTo: string;
  updatedAt: string;
}

const TYPE_LABELS: Record<string, string> = { small: 'Litet', medium: 'Medel', large: 'Stort' };
const TYPE_BADGE_CLASSES: Record<string, string> = {
  small: 'bg-[hsl(var(--project-small))] text-[hsl(var(--project-small-foreground))] ring-1 ring-[hsl(var(--project-small-border))]',
  medium: 'bg-[hsl(var(--project-medium))] text-[hsl(var(--project-medium-foreground))] ring-1 ring-[hsl(var(--project-medium-border))]',
  large: 'bg-[hsl(var(--project-large))] text-[hsl(var(--project-large-foreground))] ring-1 ring-[hsl(var(--project-large-border))]',
};

const ProjectDashboardWidgets = () => {
  const navigate = useNavigate();
  const { data: jobs = [], isLoading: jL } = useQuery({ queryKey: ['jobs'], queryFn: fetchJobs });
  const { data: projects = [], isLoading: pL } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects });
  const { data: largeProjects = [], isLoading: lL } = useQuery({ queryKey: ['large-projects'], queryFn: fetchLargeProjects });

  const isLoading = jL || pL || lL;

  const unified = useMemo<UnifiedItem[]>(() => {
    const items: UnifiedItem[] = [];
    jobs.forEach(j => items.push({
      id: j.id, name: j.name, type: 'small',
      date: j.booking?.eventDate ?? null,
      status: j.status === 'planned' ? 'planning' : j.status,
      subtitle: j.booking?.client ?? null,
      navigateTo: `/jobs/${j.id}`,
      updatedAt: j.updatedAt,
    }));
    projects.forEach(p => items.push({
      id: p.id, name: p.name, type: 'medium',
      date: p.booking?.eventdate ?? null,
      status: p.status,
      subtitle: p.booking?.client ?? p.project_leader ?? null,
      navigateTo: `/project/${p.id}`,
      updatedAt: p.updated_at,
    }));
    largeProjects.forEach(lp => items.push({
      id: lp.id, name: lp.name, type: 'large',
      date: lp.start_date ?? null,
      status: lp.status,
      subtitle: lp.location ?? `${lp.bookingCount ?? 0} bokningar`,
      navigateTo: `/large-project/${lp.id}`,
      updatedAt: lp.updated_at,
    }));
    return items;
  }, [jobs, projects, largeProjects]);

  const activeCount = unified.filter(p => p.status !== 'completed').length;
  const planningCount = unified.filter(p => p.status === 'planning').length;
  const inProgressCount = unified.filter(p => p.status === 'in_progress').length;
  const completedCount = unified.filter(p => p.status === 'completed').length;

  const recentlyUpdated = useMemo(() =>
    [...unified].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5),
    [unified]
  );

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return unified
      .filter(p => p.date && p.date >= today && p.status !== 'completed')
      .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())
      .slice(0, 5);
  }, [unified]);

  const statItems = [
    { label: 'Aktiva', value: activeCount, icon: FolderKanban, color: 'text-primary', bgColor: 'bg-primary/10' },
    { label: 'Planering', value: planningCount, icon: Clock, color: 'text-primary', bgColor: 'bg-primary/5' },
    { label: 'Pågående', value: inProgressCount, icon: CalendarClock, color: 'text-primary', bgColor: 'bg-primary/10' },
    { label: 'Avslutade', value: completedCount, icon: CheckCircle2, color: 'text-muted-foreground', bgColor: 'bg-muted' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card><CardContent className="p-4"><Skeleton className="h-48 w-full" /></CardContent></Card>
          <Card><CardContent className="p-4"><Skeleton className="h-48 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try { return format(new Date(dateStr), 'd MMM', { locale: sv }); } catch { return '—'; }
  };

  const ProjectRow = ({ item }: { item: UnifiedItem }) => (
    <div
      onClick={() => navigate(item.navigateTo)}
      className="flex items-center justify-between py-2.5 px-1 cursor-pointer hover:bg-muted/40 rounded-md transition-colors group"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium shrink-0 ${TYPE_BADGE_CLASSES[item.type]}`}>
          {TYPE_LABELS[item.type]}
        </Badge>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{item.name}</p>
          <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">{formatDate(item.date)}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statItems.map(item => (
          <Card key={item.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${item.bgColor}`}>
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Two Widget Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Senast uppdaterade projekt</h3>
            </div>
            <div className="divide-y divide-border/50">
              {recentlyUpdated.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Inga projekt ännu</p>
              ) : recentlyUpdated.map(item => <ProjectRow key={`recent-${item.id}-${item.type}`} item={item} />)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Kommande projekt</h3>
            </div>
            <div className="divide-y divide-border/50">
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Inga kommande projekt</p>
              ) : upcoming.map(item => <ProjectRow key={`upcoming-${item.id}-${item.type}`} item={item} />)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProjectDashboardWidgets;
