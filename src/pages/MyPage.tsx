import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { UserRound, FolderKanban, CalendarDays, ListChecks, ArrowRight, Briefcase, CheckCircle2, AlertTriangle } from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { isPast, parseISO } from 'date-fns';
import { useCurrentStaffId } from '@/hooks/useCurrentStaffId';
import { fetchMyProjects } from '@/services/myProjectsService';

const SHORTCUTS = [
  {
    title: 'Mina projekt',
    description: 'Projekt där du är tilldelad eller projektledare',
    url: '/my-page/projects',
    icon: FolderKanban,
    accent: 'from-purple-500/15 to-fuchsia-500/10',
  },
  {
    title: 'Min kalender',
    description: 'Dina pass, rig och eventdagar',
    url: '/my-page/calendar',
    icon: CalendarDays,
    accent: 'from-indigo-500/15 to-purple-500/10',
  },
  {
    title: 'Mina todos',
    description: 'Uppgifter tilldelade dig',
    url: '/my-page/todos',
    icon: ListChecks,
    accent: 'from-emerald-500/15 to-teal-500/10',
  },
];

const MyPage: React.FC = () => {
  const navigate = useNavigate();
  const { staffId, isLoading: staffLoading } = useCurrentStaffId();

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['my-projects', staffId],
    queryFn: () => fetchMyProjects(staffId!),
    enabled: !!staffId,
  });

  const isLoading = staffLoading || projectsLoading;
  const activeCount = projects.filter(p => p.status !== 'completed').length;
  const openTasks = projects.reduce((sum, p) => sum + (p.totalTasks - p.completedTasks), 0);
  const overdueTasks = projects.reduce(
    (sum, p) => (p.nextDeadline && isPast(parseISO(p.nextDeadline)) ? sum + 1 : sum),
    0,
  );

  return (
    <PageContainer theme="purple">
      <PageHeader
        icon={UserRound}
        title="Min sida"
        variant="purple"
        subtitle="Din personliga översikt – projekt, kalender och uppgifter"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-[3px] border-l-primary">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <Briefcase className="h-5 w-5 text-primary" />
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
        <Card className={cn('border-l-[3px]', overdueTasks > 0 ? 'border-l-destructive' : 'border-l-primary')}>
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <AlertTriangle className={cn('h-5 w-5', overdueTasks > 0 ? 'text-destructive' : 'text-primary')} />
            <div>
              <p className={cn('text-2xl font-bold', overdueTasks > 0 ? 'text-destructive' : 'text-foreground')}>
                {isLoading ? '–' : overdueTasks}
              </p>
              <p className="text-sm text-muted-foreground">Försenade</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SHORTCUTS.map(s => (
          <button
            key={s.url}
            onClick={() => navigate(s.url)}
            className={cn(
              'group relative text-left rounded-xl p-5 overflow-hidden',
              'bg-gradient-to-br', s.accent,
              'border border-border hover:border-primary/40 transition-all',
              'hover:shadow-md',
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="h-10 w-10 rounded-lg bg-white/70 backdrop-blur flex items-center justify-center shadow-sm">
                <s.icon className="h-5 w-5 text-primary" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">{s.title}</h3>
            <p className="text-xs text-muted-foreground">{s.description}</p>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="py-4 px-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Senaste projekt</h3>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
            </div>
          ) : projects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Du har inga aktiva projekt just nu.</p>
          ) : (
            <ul className="divide-y divide-border">
              {projects.slice(0, 5).map(p => (
                <li
                  key={`${p.type}-${p.id}`}
                  className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-muted/40 -mx-2 px-2 rounded-md"
                  onClick={() => navigate(p.type === 'large' ? `/large-project/${p.id}` : `/project/${p.id}`)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.clientName || p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.address || 'Ingen adress'}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
};

export default MyPage;
