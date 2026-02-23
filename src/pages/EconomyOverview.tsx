import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
  Users, 
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { startOfDay, startOfWeek, startOfMonth, format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { EconomySummary } from '@/types/projectEconomy';
import { getDeviationStatus, getDeviationColor, getDeviationBgColor } from '@/types/projectEconomy';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, type ProjectStatus } from '@/types/project';
import { StaffEconomyView } from '@/components/economy/StaffEconomyView';
import { useEconomyOverviewData, type ProjectWithEconomy } from '@/hooks/useEconomyOverviewData';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type TimePeriod = 'day' | 'week' | 'month';

interface AggregatedKPIs {
  totalProjects: number;
  projectsWithDeviation: number;
  totalBudget: number;
  totalActual: number;
  totalDeviation: number;
  totalHoursBudgeted: number;
  totalHoursActual: number;
  avgDeviationPercent: number;
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

function getGroupKey(dateStr: string | null, period: TimePeriod): string {
  if (!dateStr) return 'no-date';
  try {
    const date = parseISO(dateStr);
    if (period === 'day') return format(startOfDay(date), 'yyyy-MM-dd');
    if (period === 'week') return format(startOfWeek(date, { locale: sv, weekStartsOn: 1 }), 'yyyy-MM-dd');
    return format(startOfMonth(date), 'yyyy-MM');
  } catch {
    return 'no-date';
  }
}

function getGroupLabel(key: string, period: TimePeriod): string {
  if (key === 'no-date') return 'Utan datum';
  try {
    const date = parseISO(key);
    if (period === 'day') return format(date, 'd MMMM yyyy', { locale: sv });
    if (period === 'week') return `Vecka ${format(date, 'w', { locale: sv })}, ${format(date, 'yyyy')}`;
    return format(date, 'MMMM yyyy', { locale: sv });
  } catch {
    return key;
  }
}

function aggregateProjects(projects: ProjectWithEconomy[]): AggregatedKPIs {
  if (!projects.length) {
    return { totalProjects: 0, projectsWithDeviation: 0, totalBudget: 0, totalActual: 0, totalDeviation: 0, totalHoursBudgeted: 0, totalHoursActual: 0, avgDeviationPercent: 0 };
  }
  const totalBudget = projects.reduce((s, p) => s + p.summary.totalBudget, 0);
  const totalActual = projects.reduce((s, p) => s + p.summary.totalActual, 0);
  const totalHoursBudgeted = projects.reduce((s, p) => s + p.summary.budgetedHours, 0);
  const totalHoursActual = projects.reduce((s, p) => s + p.summary.actualHours, 0);
  const projectsWithDeviation = projects.filter(p => p.summary.totalDeviationPercent > 100).length;
  return {
    totalProjects: projects.length,
    projectsWithDeviation,
    totalBudget,
    totalActual,
    totalDeviation: totalActual - totalBudget,
    totalHoursBudgeted,
    totalHoursActual,
    avgDeviationPercent: totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0,
  };
}

const ProjectEconomyView: React.FC = () => {
  const { data: projectsWithEconomy, isLoading } = useEconomyOverviewData();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<TimePeriod>('month');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [closingProject, setClosingProject] = useState<ProjectWithEconomy | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleCloseProject = async () => {
    if (!closingProject) return;
    setIsClosing(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({ status: 'completed' })
        .eq('id', closingProject.id);
      if (error) throw error;
      toast.success(`${closingProject.name} har markerats som avslutat`);
      queryClient.invalidateQueries({ queryKey: ['economy-overview'] });
    } catch (err) {
      console.error(err);
      toast.error('Kunde inte stänga projektet');
    } finally {
      setIsClosing(false);
      setClosingProject(null);
    }
  };

  // Group projects by period
  const grouped = React.useMemo(() => {
    if (!projectsWithEconomy?.length) return [];
    const map = new Map<string, ProjectWithEconomy[]>();
    projectsWithEconomy.forEach(p => {
      const key = getGroupKey(p.eventdate, period);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => (a === 'no-date' ? 1 : b === 'no-date' ? -1 : b.localeCompare(a)));
  }, [projectsWithEconomy, period]);

  // Calculate aggregated KPIs across all projects
  const kpis = React.useMemo(
    () => aggregateProjects(projectsWithEconomy || []),
    [projectsWithEconomy]
  );

  const projectsWithIssues = projectsWithEconomy?.filter(
    p => p.summary.totalDeviationPercent > 100
  ).sort((a, b) => b.summary.totalDeviationPercent - a.summary.totalDeviationPercent) || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const isProjectClosed = (status: string) => status === 'completed' || status === 'delivered';

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total budget</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(kpis.totalBudget)}</p>
              </div>
              <div className="p-3 bg-primary/20 rounded-full">
                <Banknote className="w-6 h-6 text-primary" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Faktisk: {formatCurrency(kpis.totalActual)}
            </p>
          </CardContent>
        </Card>

        <Card className={cn(
          "border",
          kpis.totalDeviation > 0 ? "bg-destructive/10 border-destructive/20" : "bg-green-50 border-green-200"
        )}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total avvikelse</p>
                <p className={cn(
                  "text-2xl font-bold",
                  kpis.totalDeviation > 0 ? "text-destructive" : "text-green-600"
                )}>
                  {kpis.totalDeviation > 0 ? '+' : ''}{formatCurrency(kpis.totalDeviation)}
                </p>
              </div>
              <div className={cn(
                "p-3 rounded-full",
                kpis.totalDeviation > 0 ? "bg-destructive/20" : "bg-green-200"
              )}>
                {kpis.totalDeviation > 0 ? (
                  <TrendingUp className="w-6 h-6 text-destructive" />
                ) : (
                  <TrendingDown className="w-6 h-6 text-green-600" />
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {kpis.avgDeviationPercent.toFixed(0)}% av budget
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Timmar</p>
                <p className="text-2xl font-bold text-foreground">{formatHours(kpis.totalHoursActual)}</p>
              </div>
              <div className="p-3 bg-muted rounded-full">
                <Clock className="w-6 h-6 text-muted-foreground" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Budget: {formatHours(kpis.totalHoursBudgeted)}
            </p>
          </CardContent>
        </Card>

        <Card className={cn(
          kpis.projectsWithDeviation > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"
        )}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Projekt med avvikelse</p>
                <p className="text-2xl font-bold text-foreground">
                  {kpis.projectsWithDeviation} / {kpis.totalProjects}
                </p>
              </div>
              <div className={cn(
                "p-3 rounded-full",
                kpis.projectsWithDeviation > 0 ? "bg-amber-200" : "bg-green-200"
              )}>
                {kpis.projectsWithDeviation > 0 ? (
                  <AlertTriangle className="w-6 h-6 text-amber-600" />
                ) : (
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {kpis.totalProjects - kpis.projectsWithDeviation} inom budget
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Time period toggle */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Gruppera per:</span>
        <ToggleGroup type="single" value={period} onValueChange={(v) => v && setPeriod(v as TimePeriod)}>
          <ToggleGroupItem value="day" className="text-sm">Dag</ToggleGroupItem>
          <ToggleGroupItem value="week" className="text-sm">Vecka</ToggleGroupItem>
          <ToggleGroupItem value="month" className="text-sm">Månad</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Projects with Issues */}
      {projectsWithIssues.length > 0 && (
        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              Projekt med avvikelser ({projectsWithIssues.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {projectsWithIssues.map(project => {
                const status = getDeviationStatus(project.summary.totalDeviationPercent);
                return (
                  <Link 
                    key={project.id} 
                    to={`/economy/${project.id}`}
                    className="block"
                  >
                    <div className={cn(
                      "p-4 rounded-lg border transition-all hover:shadow-md",
                      getDeviationBgColor(status),
                      "border-destructive/20"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-foreground">{project.name}</h3>
                            <Badge variant="destructive">
                              +{(project.summary.totalDeviationPercent - 100).toFixed(0)}%
                            </Badge>
                            <Badge className={cn("text-xs", PROJECT_STATUS_COLORS[project.status as ProjectStatus] || 'bg-muted text-muted-foreground')}>
                              {PROJECT_STATUS_LABELS[project.status as ProjectStatus] || project.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3 text-sm">
                            <div>
                              <p className="text-muted-foreground">Budget</p>
                              <p className="font-medium">{formatCurrency(project.summary.totalBudget)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Faktisk</p>
                              <p className="font-medium">{formatCurrency(project.summary.totalActual)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Avvikelse</p>
                              <p className={cn("font-medium", getDeviationColor(status))}>
                                +{formatCurrency(project.summary.totalDeviation)}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Timmar</p>
                              <p className="font-medium">
                                {formatHours(project.summary.actualHours)} / {formatHours(project.summary.budgetedHours)}
                              </p>
                            </div>
                          </div>
                          {project.timeReports.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-destructive/20">
                              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                                <Users className="w-3 h-3" /> Registrerad tid
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {project.timeReports.slice(0, 5).map((staff, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    {staff.staff_name}: {formatHours(staff.total_hours)}
                                  </Badge>
                                ))}
                                {project.timeReports.length > 5 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{project.timeReports.length - 5} fler
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <ArrowRight className="w-5 h-5 text-muted-foreground ml-4" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grouped Projects */}
      {grouped.map(([groupKey, projects]) => {
        const groupKpis = aggregateProjects(projects);
        const isExpanded = expandedGroups.has(groupKey);
        const label = getGroupLabel(groupKey, period);

        return (
          <Card key={groupKey}>
            <CardHeader className="cursor-pointer select-none" onClick={() => toggleGroup(groupKey)}>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-3 text-base">
                  {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                  {label}
                  <Badge variant="secondary" className="text-xs">{projects.length} projekt</Badge>
                </CardTitle>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Budget: {formatCurrency(groupKpis.totalBudget)}</span>
                  <span>Faktisk: {formatCurrency(groupKpis.totalActual)}</span>
                  <span className={cn(
                    "font-medium",
                    groupKpis.totalDeviation > 0 ? "text-destructive" : "text-green-600"
                  )}>
                    {groupKpis.totalDeviation > 0 ? '+' : ''}{formatCurrency(groupKpis.totalDeviation)}
                  </span>
                </div>
              </div>
            </CardHeader>
            {isExpanded && (
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 font-medium text-muted-foreground">Projekt</th>
                        <th className="text-right py-3 px-2 font-medium text-muted-foreground">Budget</th>
                        <th className="text-right py-3 px-2 font-medium text-muted-foreground">Faktisk</th>
                        <th className="text-right py-3 px-2 font-medium text-muted-foreground">Inköp</th>
                        <th className="text-right py-3 px-2 font-medium text-muted-foreground">Avvikelse</th>
                        <th className="text-right py-3 px-2 font-medium text-muted-foreground">Timmar</th>
                        <th className="text-right py-3 px-2 font-medium text-muted-foreground">Personal</th>
                        <th className="text-center py-3 px-2 font-medium text-muted-foreground">Status</th>
                        <th className="text-center py-3 px-2 font-medium text-muted-foreground"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map(project => {
                        const devStatus = getDeviationStatus(project.summary.totalDeviationPercent);
                        const closed = isProjectClosed(project.status);
                        return (
                          <tr key={project.id} className={cn("border-b hover:bg-muted/50 transition-colors", closed && "opacity-60")}>
                            <td className="py-3 px-2">
                              <Link 
                                to={`/economy/${project.id}`}
                                className="text-primary hover:underline font-medium"
                              >
                                {project.name}
                              </Link>
                            </td>
                            <td className="text-right py-3 px-2">
                              {formatCurrency(project.summary.totalBudget)}
                            </td>
                            <td className="text-right py-3 px-2">
                              {formatCurrency(project.summary.totalActual)}
                            </td>
                            <td className="text-right py-3 px-2 text-muted-foreground">
                              {formatCurrency(project.summary.purchasesTotal)}
                            </td>
                            <td className={cn("text-right py-3 px-2 font-medium", getDeviationColor(devStatus))}>
                              {project.summary.totalDeviation > 0 ? '+' : ''}
                              {formatCurrency(project.summary.totalDeviation)}
                            </td>
                            <td className="text-right py-3 px-2">
                              {formatHours(project.summary.actualHours)} / {formatHours(project.summary.budgetedHours)}
                            </td>
                            <td className="text-right py-3 px-2 text-muted-foreground">
                              {project.timeReports.length} personer
                            </td>
                            <td className="text-center py-3 px-2">
                              <Badge className={cn(
                                "text-xs",
                                PROJECT_STATUS_COLORS[project.status as ProjectStatus] || 'bg-muted text-muted-foreground'
                              )}>
                                {PROJECT_STATUS_LABELS[project.status as ProjectStatus] || project.status}
                              </Badge>
                            </td>
                            <td className="text-center py-3 px-2">
                              {!closed && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-green-600"
                                  title="Markera som avslutat"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setClosingProject(project);
                                  }}
                                >
                                  <CheckCircle className="w-4 h-4" />
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
            )}
          </Card>
        );
      })}

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

interface EconomyOverviewProps {
  view?: 'projects' | 'staff';
}

const EconomyOverview: React.FC<EconomyOverviewProps> = ({ view = 'projects' }) => {
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
                  {view === 'projects' ? 'Översikt över projektekonomi' : 'Översikt över personalekonomi'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Content based on view */}
        {view === 'projects' ? <ProjectEconomyView /> : <StaffEconomyView />}
      </div>
    </div>
  );
};

export default EconomyOverview;