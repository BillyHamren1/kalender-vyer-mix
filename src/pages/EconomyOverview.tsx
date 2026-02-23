import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  DollarSign, 
  Clock, 
  Users, 
  ArrowRight,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EconomySummary } from '@/types/projectEconomy';
import { getDeviationStatus, getDeviationColor, getDeviationBgColor } from '@/types/projectEconomy';
import { StaffEconomyView } from '@/components/economy/StaffEconomyView';
import { useEconomyOverviewData, type ProjectWithEconomy } from '@/hooks/useEconomyOverviewData';

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

const ProjectEconomyView: React.FC = () => {
  const { data: projectsWithEconomy, isLoading } = useEconomyOverviewData();

  // Calculate aggregated KPIs
  const kpis: AggregatedKPIs = React.useMemo(() => {
    if (!projectsWithEconomy?.length) {
      return {
        totalProjects: 0,
        projectsWithDeviation: 0,
        totalBudget: 0,
        totalActual: 0,
        totalDeviation: 0,
        totalHoursBudgeted: 0,
        totalHoursActual: 0,
        avgDeviationPercent: 0
      };
    }

    const totalBudget = projectsWithEconomy.reduce((sum, p) => sum + p.summary.totalBudget, 0);
    const totalActual = projectsWithEconomy.reduce((sum, p) => sum + p.summary.totalActual, 0);
    const totalHoursBudgeted = projectsWithEconomy.reduce((sum, p) => sum + p.summary.budgetedHours, 0);
    const totalHoursActual = projectsWithEconomy.reduce((sum, p) => sum + p.summary.actualHours, 0);
    const projectsWithDeviation = projectsWithEconomy.filter(
      p => p.summary.totalDeviationPercent > 100
    ).length;

    return {
      totalProjects: projectsWithEconomy.length,
      projectsWithDeviation,
      totalBudget,
      totalActual,
      totalDeviation: totalActual - totalBudget,
      totalHoursBudgeted,
      totalHoursActual,
      avgDeviationPercent: totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0
    };
  }, [projectsWithEconomy]);

  // Separate projects with issues
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
                <DollarSign className="w-6 h-6 text-primary" />
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
                          {/* Staff breakdown */}
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

      {/* All Projects Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            Alla projekt ({projectsWithEconomy?.length || 0})
          </CardTitle>
        </CardHeader>
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
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {projectsWithEconomy?.map(project => {
                  const status = getDeviationStatus(project.summary.totalDeviationPercent);
                  return (
                    <tr key={project.id} className="border-b hover:bg-muted/50 transition-colors">
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
                      <td className={cn("text-right py-3 px-2 font-medium", getDeviationColor(status))}>
                        {project.summary.totalDeviation > 0 ? '+' : ''}
                        {formatCurrency(project.summary.totalDeviation)}
                      </td>
                      <td className="text-right py-3 px-2">
                        {formatHours(project.summary.actualHours)} / {formatHours(project.summary.budgetedHours)}
                      </td>
                      <td className="text-right py-3 px-2 text-muted-foreground">
                        {project.timeReports.length} personer
                      </td>
                      <td className="text-right py-3 px-2">
                        <Badge 
                          className={cn(
                            "text-xs",
                            status === 'ok' && "bg-green-100 text-green-700",
                            status === 'warning' && "bg-yellow-100 text-yellow-700",
                            status === 'danger' && "bg-red-100 text-red-700"
                          )}
                        >
                          {project.summary.totalDeviationPercent.toFixed(0)}%
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
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
                <DollarSign className="h-7 w-7 text-primary-foreground" />
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
