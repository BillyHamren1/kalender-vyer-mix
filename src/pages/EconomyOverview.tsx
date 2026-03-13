import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseISO, isAfter, startOfDay } from 'date-fns';
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

  const renderProjectRow = (project: ProjectWithEconomy) => {
    const devStatus = getDeviationStatus(project.summary.totalDeviationPercent);
    const closed = project.economyClosed;
    const dateStr = project.eventdate 
      ? new Date(project.eventdate).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—';
    return (
      <div key={project.id} className={cn("flex items-center justify-between py-2.5 px-3 border-b border-border/30 last:border-0 hover:bg-muted/40 transition-colors", closed && "opacity-60")}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link
            to={project.projectSize === 'medium' ? `/economy/${project.id}` : project.navigateTo}
            className="text-sm font-medium text-primary hover:underline truncate"
          >
            {project.name}
          </Link>
          <Badge variant="outline" className={cn(
            "text-[10px] font-medium shrink-0",
            project.projectSize === 'small' && "bg-[hsl(var(--project-small))] text-[hsl(var(--project-small-foreground))] ring-1 ring-[hsl(var(--project-small-border))]",
            project.projectSize === 'medium' && "bg-[hsl(var(--project-medium))] text-[hsl(var(--project-medium-foreground))] ring-1 ring-[hsl(var(--project-medium-border))]",
            project.projectSize === 'large' && "bg-[hsl(var(--project-large))] text-[hsl(var(--project-large-foreground))] ring-1 ring-[hsl(var(--project-large-border))]",
          )}>
            {project.projectSize === 'small' ? 'Litet' : project.projectSize === 'medium' ? 'Medel' : 'Stort'}
          </Badge>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-xs text-muted-foreground w-20 text-right">{dateStr}</span>
          <span className="text-xs font-medium w-20 text-right">{formatCurrency(project.summary.totalBudget)}</span>
          <span className={cn("text-xs font-mono font-bold w-20 text-right", getDeviationColor(devStatus))}>
            {project.summary.totalDeviation > 0 ? '+' : ''}{formatCurrency(project.summary.totalDeviation)}
          </span>
          {!closed && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => setClosingProject(project)}
            >
              <Lock className="h-3 w-3 mr-1" />
              Stäng
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Three category containers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pågående */}
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-blue-600" />
              Pågående
              <Badge variant="secondary" className="text-[10px] ml-auto">{sortedOngoing.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-[400px] overflow-y-auto">
            {sortedOngoing.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Inga pågående projekt</p>
            ) : sortedOngoing.map(renderProjectRow)}
          </CardContent>
        </Card>

        {/* Kommande */}
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-amber-600" />
              Kommande
              <Badge variant="secondary" className="text-[10px] ml-auto">{sortedUpcoming.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-[400px] overflow-y-auto">
            {sortedUpcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Inga kommande projekt</p>
            ) : sortedUpcoming.map(renderProjectRow)}
          </CardContent>
        </Card>

        {/* Senast avslutade */}
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Senast avslutade
              <Badge variant="secondary" className="text-[10px] ml-auto">{sortedCompleted.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-[400px] overflow-y-auto">
            {sortedCompleted.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Inga avslutade projekt</p>
            ) : sortedCompleted.map(renderProjectRow)}
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