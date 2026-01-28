import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  DollarSign, 
  Clock, 
  Users, 
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Briefcase
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateEconomySummary } from '@/services/projectEconomyService';
import type { EconomySummary, StaffTimeReport } from '@/types/projectEconomy';
import { getDeviationStatus, getDeviationColor, getDeviationBgColor } from '@/types/projectEconomy';
import { StaffEconomyView } from '@/components/economy/StaffEconomyView';

interface ProjectWithEconomy {
  id: string;
  name: string;
  status: string;
  booking_id: string | null;
  summary: EconomySummary;
  timeReports: StaffTimeReport[];
}

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
  const { data: projectsWithEconomy, isLoading } = useQuery({
    queryKey: ['economy-overview'],
    queryFn: async (): Promise<ProjectWithEconomy[]> => {
      // Fetch all active projects
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .in('status', ['planning', 'active', 'in_progress'])
        .order('created_at', { ascending: false });

      if (projectsError) throw projectsError;
      if (!projects?.length) return [];

      // Fetch economy data for each project
      const projectsWithData = await Promise.all(
        projects.map(async (project) => {
          // Fetch budget
          const { data: budget } = await supabase
            .from('project_budget')
            .select('*')
            .eq('project_id', project.id)
            .maybeSingle();

          // Fetch purchases
          const { data: purchases } = await supabase
            .from('project_purchases')
            .select('*')
            .eq('project_id', project.id);

          // Fetch quotes
          const { data: quotes } = await supabase
            .from('project_quotes')
            .select('*')
            .eq('project_id', project.id);

          // Fetch invoices
          const { data: invoices } = await supabase
            .from('project_invoices')
            .select('*')
            .eq('project_id', project.id);

          // Fetch time reports if booking_id exists
          let timeReports: StaffTimeReport[] = [];
          if (project.booking_id) {
            const { data: reports } = await supabase
              .from('time_reports')
              .select(`
                staff_id,
                hours_worked,
                overtime_hours,
                staff_members!inner(name, hourly_rate, overtime_rate)
              `)
              .eq('booking_id', project.booking_id);

            // Aggregate by staff member
            const staffMap = new Map<string, StaffTimeReport>();
            (reports || []).forEach((report: any) => {
              const staffId = report.staff_id;
              const existing = staffMap.get(staffId);
              const staffData = report.staff_members;
              const hourlyRate = Number(staffData?.hourly_rate) || 0;
              const overtimeRate = Number(staffData?.overtime_rate) || hourlyRate * 1.5;

              if (existing) {
                existing.total_hours += Number(report.hours_worked) || 0;
                existing.overtime_hours += Number(report.overtime_hours) || 0;
                existing.total_cost = (existing.total_hours * existing.hourly_rate) + 
                                     (existing.overtime_hours * existing.overtime_rate);
              } else {
                const totalHours = Number(report.hours_worked) || 0;
                const overtimeHours = Number(report.overtime_hours) || 0;
                staffMap.set(staffId, {
                  staff_id: staffId,
                  staff_name: staffData?.name || 'Okänd',
                  total_hours: totalHours,
                  overtime_hours: overtimeHours,
                  hourly_rate: hourlyRate,
                  overtime_rate: overtimeRate,
                  total_cost: (totalHours * hourlyRate) + (overtimeHours * overtimeRate)
                });
              }
            });
            timeReports = Array.from(staffMap.values());
          }

          // Fetch labor costs
          const { data: laborCosts } = await supabase
            .from('project_labor_costs')
            .select('*')
            .eq('project_id', project.id);

          // Add labor costs to time reports
          (laborCosts || []).forEach((cost: any) => {
            timeReports.push({
              staff_id: cost.staff_id || 'manual',
              staff_name: cost.staff_name,
              total_hours: Number(cost.hours) || 0,
              overtime_hours: 0,
              hourly_rate: Number(cost.hourly_rate) || 0,
              overtime_rate: 0,
              total_cost: (Number(cost.hours) || 0) * (Number(cost.hourly_rate) || 0)
            });
          });

          const summary = calculateEconomySummary(
            budget,
            timeReports,
            purchases || [],
            (quotes || []) as any,
            (invoices || []) as any
          );

          return {
            id: project.id,
            name: project.name,
            status: project.status,
            booking_id: project.booking_id,
            summary,
            timeReports
          };
        })
      );

      return projectsWithData;
    }
  });

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

const EconomyOverview: React.FC = () => {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Ekonomiöversikt</h1>
        <p className="text-muted-foreground">Översikt över projekt- och personalekonomi</p>
      </div>

      {/* Tabs for Project vs Staff Economy */}
      <Tabs defaultValue="projects" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="projects" className="flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            Projekt
          </TabsTrigger>
          <TabsTrigger value="staff" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Personal
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="projects" className="mt-6">
          <ProjectEconomyView />
        </TabsContent>
        
        <TabsContent value="staff" className="mt-6">
          <StaffEconomyView />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EconomyOverview;
