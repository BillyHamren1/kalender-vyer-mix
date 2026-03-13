import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { 
  Banknote, 
  CheckCircle2,
  Lock,
  PlayCircle,
  CalendarClock,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseISO, isAfter, startOfDay, format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { getDeviationStatus, getDeviationColor } from '@/types/projectEconomy';
import { StaffEconomyView } from '@/components/economy/StaffEconomyView';
import { useEconomyOverviewData, type ProjectWithEconomy, type ProjectSize } from '@/hooks/useEconomyOverviewData';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const EconomyTimeReportsContent = React.lazy(() => import('@/pages/EconomyTimeReports'));

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('sv-SE', { 
    style: 'currency', 
    currency: 'SEK',
    maximumFractionDigits: 0 
  }).format(value);
};

function categorizeProject(p: ProjectWithEconomy): 'ongoing' | 'completed' | 'upcoming' {
  if (p.economyClosed || p.status === 'completed') return 'completed';
  if (!p.eventdate) return 'ongoing';
  try {
    const eventDate = parseISO(p.eventdate);
    const today = startOfDay(new Date());
    if (isAfter(eventDate, today)) return 'upcoming';
  } catch {}
  return 'ongoing';
}

const ProjectEconomyView: React.FC = () => {
  const { data: projectsWithEconomy, isLoading } = useEconomyOverviewData();
  const queryClient = useQueryClient();
  const [closingProject, setClosingProject] = useState<ProjectWithEconomy | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const handleCloseProject = async () => {
    if (!closingProject) return;
    setIsClosing(true);
    try {
      if (closingProject.booking_id) {
        const { markReadyForInvoicing } = await import('@/services/planningApiService');
        await markReadyForInvoicing(closingProject.booking_id);
      }
      const { error } = await supabase
        .from('projects')
        .update({ status: 'completed' })
        .eq('id', closingProject.id);
      if (error) throw error;
      toast.success(`${closingProject.name} har markerats som avslutat`);
      queryClient.invalidateQueries({ queryKey: ['economy-overview'] });
    } catch (err) {
      console.error('Close project error:', err);
      toast.error('Kunde inte signalera faktureringssystemet — försök igen');
    } finally {
      setIsClosing(false);
      setClosingProject(null);
    }
  };

  // Categorize projects
  const categorized = React.useMemo(() => {
    if (!projectsWithEconomy?.length) return { all: [], ongoing: [], completed: [], upcoming: [] };
    const ongoing: ProjectWithEconomy[] = [];
    const completed: ProjectWithEconomy[] = [];
    const upcoming: ProjectWithEconomy[] = [];
    projectsWithEconomy.forEach(p => {
      const cat = categorizeProject(p);
      if (cat === 'ongoing') ongoing.push(p);
      else if (cat === 'completed') completed.push(p);
      else upcoming.push(p);
    });
    return { all: projectsWithEconomy, ongoing, completed, upcoming };
  }, [projectsWithEconomy]);

  // Sort each category by date
  const sortedOngoing = React.useMemo(() => 
    [...categorized.ongoing].sort((a, b) => {
      const da = a.eventdate ? new Date(a.eventdate).getTime() : 0;
      const db = b.eventdate ? new Date(b.eventdate).getTime() : 0;
      return da - db;
    }), [categorized.ongoing]);

  const sortedUpcoming = React.useMemo(() => 
    [...categorized.upcoming].sort((a, b) => {
      const da = a.eventdate ? new Date(a.eventdate).getTime() : Infinity;
      const db = b.eventdate ? new Date(b.eventdate).getTime() : Infinity;
      return da - db;
    }), [categorized.upcoming]);

  const sortedCompleted = React.useMemo(() => 
    [...categorized.completed].sort((a, b) => {
      const da = a.eventdate ? new Date(a.eventdate).getTime() : 0;
      const db = b.eventdate ? new Date(b.eventdate).getTime() : 0;
      return db - da; // Most recent first
    }), [categorized.completed]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const TYPE_BADGE_CLASSES: Record<string, string> = {
    small: 'bg-[hsl(var(--project-small))] text-[hsl(var(--project-small-foreground))] ring-1 ring-[hsl(var(--project-small-border))]',
    medium: 'bg-[hsl(var(--project-medium))] text-[hsl(var(--project-medium-foreground))] ring-1 ring-[hsl(var(--project-medium-border))]',
    large: 'bg-[hsl(var(--project-large))] text-[hsl(var(--project-large-foreground))] ring-1 ring-[hsl(var(--project-large-border))]',
  };
  const TYPE_LABELS: Record<string, string> = { small: 'Litet', medium: 'Medel', large: 'Stort' };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—';
    try { return format(new Date(dateStr), 'd MMM yyyy', { locale: sv }); } catch { return '—'; }
  };

  const navigate = useNavigate();

  const EconomyProjectRow = ({ project }: { project: ProjectWithEconomy }) => {
    const devStatus = getDeviationStatus(project.summary.totalDeviationPercent);
    const closed = project.economyClosed;
    const link = project.projectSize === 'medium' ? `/economy/${project.id}` : project.navigateTo;
    return (
      <div
        onClick={() => navigate(link)}
        className={cn(
          "flex items-center justify-between py-2.5 px-1 cursor-pointer hover:bg-muted/40 rounded-md transition-colors group",
          closed && "opacity-60"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium shrink-0 ${TYPE_BADGE_CLASSES[project.projectSize]}`}>
            {TYPE_LABELS[project.projectSize]}
          </Badge>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{project.name}</p>
            <p className="text-xs text-muted-foreground truncate">{formatDate(project.eventdate)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground">{formatDate(project.eventdate)}</span>
          <span className={cn("text-xs font-mono font-semibold", getDeviationColor(devStatus))}>
            {project.summary.totalDeviation > 0 ? '+' : ''}{formatCurrency(project.summary.totalDeviation)}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Three category containers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pågående */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <PlayCircle className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Pågående</h3>
              <Badge variant="secondary" className="text-[10px] ml-auto">{sortedOngoing.length}</Badge>
            </div>
            <div className="divide-y divide-border/50">
              {sortedOngoing.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Inga pågående projekt</p>
              ) : sortedOngoing.map(p => <EconomyProjectRow key={p.id} project={p} />)}
            </div>
          </CardContent>
        </Card>

        {/* Kommande */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Kommande</h3>
              <Badge variant="secondary" className="text-[10px] ml-auto">{sortedUpcoming.length}</Badge>
            </div>
            <div className="divide-y divide-border/50">
              {sortedUpcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Inga kommande projekt</p>
              ) : sortedUpcoming.map(p => <EconomyProjectRow key={p.id} project={p} />)}
            </div>
          </CardContent>
        </Card>

        {/* Senast avslutade */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Senast avslutade</h3>
              <Badge variant="secondary" className="text-[10px] ml-auto">{sortedCompleted.length}</Badge>
            </div>
            <div className="divide-y divide-border/50">
              {sortedCompleted.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Inga avslutade projekt</p>
              ) : sortedCompleted.map(p => <EconomyProjectRow key={p.id} project={p} />)}
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Close project dialog */}
      <AlertDialog open={!!closingProject} onOpenChange={() => setClosingProject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stäng projekt</AlertDialogTitle>
            <AlertDialogDescription>
              Vill du markera <strong>{closingProject?.name}</strong> som avslutat? Projektet kommer fortfarande synas i listan men markeras som stängt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClosing}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleCloseProject} disabled={isClosing}>
              {isClosing ? 'Stänger...' : 'Markera som avslutat'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const tabTriggerClass =
  "relative px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-primary font-medium transition-colors hover:text-foreground";

const EconomyOverview: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 py-8 max-w-[1600px]">
        {/* Premium Header */}
        <div className="relative mb-8">
          <div className="absolute inset-0 -z-10 overflow-hidden rounded-3xl">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-primary/3 rounded-full blur-2xl" />
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 p-6 rounded-2xl bg-gradient-to-r from-card/80 via-card to-card/80 backdrop-blur-sm border border-border/50 shadow-lg">
            <div className="flex items-center gap-4">
              <div 
                className="relative p-3.5 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg"
                style={{ boxShadow: '0 8px 32px hsl(var(--primary) / 0.3)' }}
              >
                <Banknote className="h-7 w-7 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  Ekonomiöversikt
                </h1>
                <p className="text-muted-foreground mt-0.5">
                  Översikt över projekt- och personalekonomi
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabbed content */}
        <Tabs defaultValue="projects" className="space-y-6">
          <div className="rounded-xl border border-border/40 bg-card px-2 py-1" style={{ boxShadow: '0 1px 3px hsl(200 15% 15% / 0.04)' }}>
            <TabsList className="h-auto p-0 bg-transparent gap-0 w-full grid grid-cols-3">
              <TabsTrigger value="projects" className={tabTriggerClass}>
                Projekt
              </TabsTrigger>
              <TabsTrigger value="staff" className={tabTriggerClass}>
                Personal
              </TabsTrigger>
              <TabsTrigger value="time-reports" className={tabTriggerClass}>
                Utlägg
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="projects">
            <ProjectEconomyView />
          </TabsContent>

          <TabsContent value="staff">
            <StaffEconomyView />
          </TabsContent>

          <TabsContent value="time-reports">
            <React.Suspense fallback={<Skeleton className="h-96" />}>
              <EconomyTimeReportsContent />
            </React.Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default EconomyOverview;