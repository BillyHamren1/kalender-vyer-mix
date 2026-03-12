import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Progress } from '@/components/ui/progress';
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
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Banknote, 
  Clock, 
  CheckCircle2,
  Lock,
  PlayCircle,
  CalendarClock,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Users,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseISO, isAfter, isBefore, startOfDay } from 'date-fns';
import { getDeviationStatus, getDeviationColor } from '@/types/projectEconomy';
import { StaffEconomyView } from '@/components/economy/StaffEconomyView';
import { useEconomyOverviewData, type ProjectWithEconomy, type ProjectSize } from '@/hooks/useEconomyOverviewData';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const EconomyTimeReportsContent = React.lazy(() => import('@/pages/EconomyTimeReports'));

type StatusFilter = 'all' | 'ongoing' | 'completed' | 'upcoming';

interface AggregatedKPIs {
  totalProjects: number;
  projectsWithDeviation: number;
  totalBudget: number;
  totalActual: number;
  totalDeviation: number;
  totalHoursBudgeted: number;
  totalHoursActual: number;
  avgDeviationPercent: number;
  totalPurchases: number;
  avgMargin: number;
  projectsOnBudget: number;
  projectsOverBudget: number;
  projectsUnderBudget: number;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('sv-SE', { 
    style: 'currency', 
    currency: 'SEK',
    maximumFractionDigits: 0 
  }).format(value);
};

const formatHours = (hours: number) => {
  return `${hours.toFixed(1)} tim`;
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

function aggregateProjects(projects: ProjectWithEconomy[]): AggregatedKPIs {
  if (!projects.length) {
    return { totalProjects: 0, projectsWithDeviation: 0, totalBudget: 0, totalActual: 0, totalDeviation: 0, totalHoursBudgeted: 0, totalHoursActual: 0, avgDeviationPercent: 0, totalPurchases: 0, avgMargin: 0, projectsOnBudget: 0, projectsOverBudget: 0, projectsUnderBudget: 0 };
  }
  const totalBudget = projects.reduce((s, p) => s + p.summary.totalBudget, 0);
  const totalActual = projects.reduce((s, p) => s + p.summary.totalActual, 0);
  const totalHoursBudgeted = projects.reduce((s, p) => s + p.summary.budgetedHours, 0);
  const totalHoursActual = projects.reduce((s, p) => s + p.summary.actualHours, 0);
  const totalPurchases = projects.reduce((s, p) => s + p.summary.purchasesTotal, 0);
  const projectsWithDeviation = projects.filter(p => p.summary.totalDeviationPercent > 100).length;
  const projectsOverBudget = projects.filter(p => p.summary.totalDeviation > 0).length;
  const projectsUnderBudget = projects.filter(p => p.summary.totalDeviation < 0 && p.summary.totalBudget > 0).length;
  const projectsOnBudget = projects.length - projectsOverBudget - projectsUnderBudget;
  
  return {
    totalProjects: projects.length,
    projectsWithDeviation,
    totalBudget,
    totalActual,
    totalDeviation: totalActual - totalBudget,
    totalHoursBudgeted,
    totalHoursActual,
    avgDeviationPercent: totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0,
    totalPurchases,
    avgMargin: totalBudget > 0 ? ((totalBudget - totalActual) / totalBudget) * 100 : 0,
    projectsOnBudget,
    projectsOverBudget,
    projectsUnderBudget,
  };
}

const StatusFilterButton: React.FC<{
  filter: StatusFilter;
  active: boolean;
  count: number;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  color: string;
}> = ({ active, count, icon, label, onClick, color }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 text-left min-w-[140px]",
      active
        ? "border-primary/30 bg-primary/5 shadow-sm ring-1 ring-primary/20"
        : "border-border/50 bg-card hover:bg-muted/50 hover:border-border"
    )}
  >
    <div className={cn("p-2 rounded-lg", color)}>
      {icon}
    </div>
    <div>
      <p className="text-xl font-bold text-foreground">{count}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  </button>
);

const MiniWidget: React.FC<{
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}> = ({ title, value, subtitle, icon, trend, className }) => (
  <Card className={cn("border-border/40", className)}>
    <CardContent className="pt-5 pb-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {subtitle && (
            <p className={cn(
              "text-xs flex items-center gap-1",
              trend === 'up' ? "text-destructive" : trend === 'down' ? "text-green-600" : "text-muted-foreground"
            )}>
              {trend === 'up' && <ArrowUpRight className="h-3 w-3" />}
              {trend === 'down' && <ArrowDownRight className="h-3 w-3" />}
              {subtitle}
            </p>
          )}
        </div>
        <div className="p-2.5 rounded-xl bg-muted/60">
          {icon}
        </div>
      </div>
    </CardContent>
  </Card>
);

const ProjectEconomyView: React.FC = () => {
  const { data: projectsWithEconomy, isLoading } = useEconomyOverviewData();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
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

  const filteredProjects = categorized[statusFilter];
  const kpis = React.useMemo(() => aggregateProjects(filteredProjects), [filteredProjects]);
  const allKpis = React.useMemo(() => aggregateProjects(categorized.all), [categorized.all]);

  // Top deviating projects — only completed projects are meaningful
  const topDeviating = React.useMemo(() => {
    return [...categorized.completed]
      .filter(p => p.summary.totalBudget > 0)
      .sort((a, b) => b.summary.totalDeviationPercent - a.summary.totalDeviationPercent)
      .slice(0, 5);
  }, [categorized.completed]);

  // Budget health distribution
  const budgetHealth = React.useMemo(() => {
    if (!filteredProjects.length) return { onBudget: 0, warning: 0, critical: 0 };
    const onBudget = filteredProjects.filter(p => p.summary.totalDeviationPercent <= 100).length;
    const warning = filteredProjects.filter(p => p.summary.totalDeviationPercent > 100 && p.summary.totalDeviationPercent <= 110).length;
    const critical = filteredProjects.filter(p => p.summary.totalDeviationPercent > 110).length;
    return { onBudget, warning, critical };
  }, [filteredProjects]);

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

  const filterLabels: Record<StatusFilter, string> = {
    all: 'Alla projekt',
    ongoing: 'Pågående',
    completed: 'Avslutade',
    upcoming: 'Kommande',
  };

  return (
    <div className="space-y-6">
      {/* Status filter cards */}
      <div className="flex flex-wrap gap-3">
        <StatusFilterButton
          filter="all"
          active={statusFilter === 'all'}
          count={categorized.all.length}
          icon={<BarChart3 className="h-4 w-4 text-primary" />}
          label="Alla"
          onClick={() => setStatusFilter('all')}
          color="bg-primary/10"
        />
        <StatusFilterButton
          filter="ongoing"
          active={statusFilter === 'ongoing'}
          count={categorized.ongoing.length}
          icon={<PlayCircle className="h-4 w-4 text-blue-600" />}
          label="Pågående"
          onClick={() => setStatusFilter('ongoing')}
          color="bg-blue-100"
        />
        <StatusFilterButton
          filter="upcoming"
          active={statusFilter === 'upcoming'}
          count={categorized.upcoming.length}
          icon={<CalendarClock className="h-4 w-4 text-amber-600" />}
          label="Kommande"
          onClick={() => setStatusFilter('upcoming')}
          color="bg-amber-100"
        />
        <StatusFilterButton
          filter="completed"
          active={statusFilter === 'completed'}
          count={categorized.completed.length}
          icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
          label="Avslutade"
          onClick={() => setStatusFilter('completed')}
          color="bg-green-100"
        />
      </div>

      {/* KPI Widgets Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniWidget
          title="Total budget"
          value={formatCurrency(kpis.totalBudget)}
          subtitle={`Faktisk: ${formatCurrency(kpis.totalActual)}`}
          icon={<Banknote className="w-5 h-5 text-primary" />}
          trend={kpis.totalActual > kpis.totalBudget ? 'up' : 'down'}
        />
        <MiniWidget
          title="Avvikelse"
          value={`${kpis.totalDeviation > 0 ? '+' : ''}${formatCurrency(kpis.totalDeviation)}`}
          subtitle={`${kpis.avgDeviationPercent.toFixed(0)}% av budget`}
          icon={kpis.totalDeviation > 0 
            ? <TrendingUp className="w-5 h-5 text-destructive" /> 
            : <TrendingDown className="w-5 h-5 text-green-600" />}
          trend={kpis.totalDeviation > 0 ? 'up' : 'down'}
        />
        <MiniWidget
          title="Timmar"
          value={formatHours(kpis.totalHoursActual)}
          subtitle={`Budget: ${formatHours(kpis.totalHoursBudgeted)}`}
          icon={<Clock className="w-5 h-5 text-muted-foreground" />}
          trend={kpis.totalHoursActual > kpis.totalHoursBudgeted ? 'up' : 'neutral'}
        />
        <MiniWidget
          title="Inköp totalt"
          value={formatCurrency(kpis.totalPurchases)}
          subtitle={`${kpis.totalProjects} projekt`}
          icon={<Wallet className="w-5 h-5 text-muted-foreground" />}
        />
      </div>

      {/* Dashboard Widgets Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Budget Health Widget */}
        <Card className="border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              Budgetstatus
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-green-600 font-medium">Inom budget</span>
                <span className="font-bold">{budgetHealth.onBudget}</span>
              </div>
              <Progress value={filteredProjects.length ? (budgetHealth.onBudget / filteredProjects.length) * 100 : 0} className="h-2 [&>div]:bg-green-500" />
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-amber-600 font-medium">Varning (0-10%)</span>
                <span className="font-bold">{budgetHealth.warning}</span>
              </div>
              <Progress value={filteredProjects.length ? (budgetHealth.warning / filteredProjects.length) * 100 : 0} className="h-2 [&>div]:bg-amber-500" />
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-destructive font-medium">Kritisk (&gt;10%)</span>
                <span className="font-bold">{budgetHealth.critical}</span>
              </div>
              <Progress value={filteredProjects.length ? (budgetHealth.critical / filteredProjects.length) * 100 : 0} className="h-2 [&>div]:bg-destructive" />
            </div>
          </CardContent>
        </Card>

        {/* Top Deviating Projects Widget */}
        <Card className="border-border/40 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Största avvikelser — Avslutade projekt
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topDeviating.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Inga projekt med budgetdata</p>
            ) : (
              <div className="space-y-2.5">
                {topDeviating.map(p => {
                  const devPercent = p.summary.totalDeviationPercent;
                  const devStatus = getDeviationStatus(devPercent);
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <Link 
                        to={p.navigateTo}
                        className="text-sm font-medium text-primary hover:underline truncate flex-1 min-w-0"
                      >
                        {p.name}
                      </Link>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-24">
                          <Progress 
                            value={Math.min(devPercent, 150)} 
                            className={cn(
                              "h-2",
                              devPercent <= 100 ? "[&>div]:bg-green-500" :
                              devPercent <= 110 ? "[&>div]:bg-amber-500" :
                              "[&>div]:bg-destructive"
                            )}
                          />
                        </div>
                        <span className={cn("text-xs font-mono font-bold w-12 text-right", getDeviationColor(devStatus))}>
                          {devPercent.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Margin & Summary Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className={cn(
          "border-border/40",
          kpis.avgMargin >= 0 ? "bg-green-50/50 border-green-200/50" : "bg-destructive/5 border-destructive/20"
        )}>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Genomsnittlig marginal</p>
            <p className={cn("text-3xl font-bold mt-1", kpis.avgMargin >= 0 ? "text-green-600" : "text-destructive")}>
              {kpis.avgMargin.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.projectsOverBudget} projekt över budget
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Personal kostnader</p>
            <p className="text-3xl font-bold text-foreground mt-1">
              {formatCurrency(filteredProjects.reduce((s, p) => s + p.summary.staffActual, 0))}
            </p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Users className="h-3 w-3" />
              Budget: {formatCurrency(filteredProjects.reduce((s, p) => s + p.summary.staffBudget, 0))}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Leverantörsfakturor</p>
            <p className="text-3xl font-bold text-foreground mt-1">
              {formatCurrency(filteredProjects.reduce((s, p) => s + p.summary.supplierInvoicesTotal, 0))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Offerter: {formatCurrency(filteredProjects.reduce((s, p) => s + p.summary.quotesTotal, 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Project table */}
      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span>{filterLabels[statusFilter]} — Projektlista</span>
            <Badge variant="secondary" className="text-xs font-normal">
              {filteredProjects.length} projekt
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Projekt</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Budget</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Faktisk</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Inköp</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Avvikelse</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Timmar</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground">Fas</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground">Status</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-muted-foreground">
                      Inga projekt i kategorin "{filterLabels[statusFilter]}"
                    </td>
                  </tr>
                )}
                {filteredProjects.map(project => {
                  const devStatus = getDeviationStatus(project.summary.totalDeviationPercent);
                  const closed = project.economyClosed;
                  const category = categorizeProject(project);
                  return (
                    <tr key={project.id} className={cn("border-b hover:bg-muted/50 transition-colors", closed && "opacity-60")}>
                      <td className="py-3 px-4">
                        <Link
                          to={`/economy/${project.id}`}
                          className="text-primary hover:underline font-medium"
                        >
                          {project.name}
                        </Link>
                      </td>
                      <td className="text-right py-3 px-4">
                        {formatCurrency(project.summary.totalBudget)}
                      </td>
                      <td className="text-right py-3 px-4">
                        {formatCurrency(project.summary.totalActual)}
                      </td>
                      <td className="text-right py-3 px-4 text-muted-foreground">
                        {formatCurrency(project.summary.purchasesTotal)}
                      </td>
                      <td className={cn("text-right py-3 px-4 font-medium", getDeviationColor(devStatus))}>
                        {project.summary.totalDeviation > 0 ? '+' : ''}
                        {formatCurrency(project.summary.totalDeviation)}
                      </td>
                      <td className="text-right py-3 px-4">
                        {formatHours(project.summary.actualHours)} / {formatHours(project.summary.budgetedHours)}
                      </td>
                      <td className="text-center py-3 px-4">
                        <Badge variant="outline" className={cn(
                          "text-[10px] font-medium",
                          category === 'ongoing' && "border-blue-300 text-blue-700 bg-blue-50",
                          category === 'upcoming' && "border-amber-300 text-amber-700 bg-amber-50",
                          category === 'completed' && "border-green-300 text-green-700 bg-green-50",
                        )}>
                          {category === 'ongoing' ? 'PÅGÅENDE' : category === 'upcoming' ? 'KOMMANDE' : 'AVSLUTAD'}
                        </Badge>
                      </td>
                      <td className="text-center py-3 px-4">
                        <Badge variant={closed ? "secondary" : "outline"} className={cn(
                          "text-xs",
                          closed ? "bg-muted text-muted-foreground" : "border-green-300 text-green-700 bg-green-50"
                        )}>
                          {closed ? 'STÄNGD' : 'ÖPPEN'}
                        </Badge>
                      </td>
                      <td className="text-center py-3 px-4">
                        {!closed && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              setClosingProject(project);
                            }}
                          >
                            <Lock className="h-3.5 w-3.5 mr-1" />
                            Stäng
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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