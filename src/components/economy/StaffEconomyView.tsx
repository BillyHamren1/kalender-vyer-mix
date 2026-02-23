import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Users, 
  Clock, 
  Banknote,
  TrendingUp,
  Briefcase,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { sv } from 'date-fns/locale';

interface StaffEconomyData {
  id: string;
  name: string;
  role: string | null;
  hourly_rate: number | null;
  overtime_rate: number | null;
  totalHours: number;
  overtimeHours: number;
  totalCost: number;
  projectCount: number;
  projects: { id: string; name: string; hours: number }[];
}

interface StaffEconomyKPIs {
  totalStaff: number;
  activeStaff: number;
  totalHoursThisMonth: number;
  totalOvertimeThisMonth: number;
  totalCostThisMonth: number;
  avgHoursPerStaff: number;
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

export const StaffEconomyView: React.FC = () => {
  const currentMonth = new Date();
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: staffEconomy, isLoading } = useQuery({
    queryKey: ['staff-economy-overview', format(monthStart, 'yyyy-MM')],
    queryFn: async (): Promise<StaffEconomyData[]> => {
      // Fetch all active staff members
      const { data: staff, error: staffError } = await supabase
        .from('staff_members')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (staffError) throw staffError;
      if (!staff?.length) return [];

      // Fetch all time reports for current month
      const { data: timeReports, error: reportsError } = await supabase
        .from('time_reports')
        .select(`
          staff_id,
          booking_id,
          hours_worked,
          overtime_hours,
          report_date,
          bookings!inner(client, assigned_project_id)
        `)
        .gte('report_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('report_date', format(monthEnd, 'yyyy-MM-dd'));

      if (reportsError) throw reportsError;

      // Fetch all projects for linking
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name, booking_id');

      const projectMap = new Map(
        (projects || []).map(p => [p.booking_id, { id: p.id, name: p.name }])
      );

      // Aggregate data per staff member
      const staffData = staff.map(member => {
        const memberReports = (timeReports || []).filter(r => r.staff_id === member.id);
        
        const hourlyRate = Number(member.hourly_rate) || 0;
        const overtimeRate = Number(member.overtime_rate) || hourlyRate * 1.5;
        
        const totalHours = memberReports.reduce((sum, r) => sum + (Number(r.hours_worked) || 0), 0);
        const overtimeHours = memberReports.reduce((sum, r) => sum + (Number(r.overtime_hours) || 0), 0);
        const totalCost = (totalHours * hourlyRate) + (overtimeHours * overtimeRate);

        // Group by project
        const projectHoursMap = new Map<string, { id: string; name: string; hours: number }>();
        memberReports.forEach(report => {
          const bookingData = report.bookings as any;
          const project = projectMap.get(report.booking_id);
          const key = project?.id || report.booking_id;
          const name = project?.name || bookingData?.client || 'Okänt projekt';
          
          const existing = projectHoursMap.get(key);
          if (existing) {
            existing.hours += Number(report.hours_worked) || 0;
          } else {
            projectHoursMap.set(key, {
              id: key,
              name,
              hours: Number(report.hours_worked) || 0
            });
          }
        });

        return {
          id: member.id,
          name: member.name,
          role: member.role,
          hourly_rate: hourlyRate,
          overtime_rate: overtimeRate,
          totalHours,
          overtimeHours,
          totalCost,
          projectCount: projectHoursMap.size,
          projects: Array.from(projectHoursMap.values()).sort((a, b) => b.hours - a.hours)
        };
      });

      // Sort by total hours worked (descending)
      return staffData.sort((a, b) => b.totalHours - a.totalHours);
    }
  });

  // Calculate KPIs
  const kpis: StaffEconomyKPIs = React.useMemo(() => {
    if (!staffEconomy?.length) {
      return {
        totalStaff: 0,
        activeStaff: 0,
        totalHoursThisMonth: 0,
        totalOvertimeThisMonth: 0,
        totalCostThisMonth: 0,
        avgHoursPerStaff: 0
      };
    }

    const activeStaff = staffEconomy.filter(s => s.totalHours > 0);
    const totalHours = staffEconomy.reduce((sum, s) => sum + s.totalHours, 0);
    const totalOvertime = staffEconomy.reduce((sum, s) => sum + s.overtimeHours, 0);
    const totalCost = staffEconomy.reduce((sum, s) => sum + s.totalCost, 0);

    return {
      totalStaff: staffEconomy.length,
      activeStaff: activeStaff.length,
      totalHoursThisMonth: totalHours,
      totalOvertimeThisMonth: totalOvertime,
      totalCostThisMonth: totalCost,
      avgHoursPerStaff: activeStaff.length > 0 ? totalHours / activeStaff.length : 0
    };
  }, [staffEconomy]);

  // Separate active and inactive staff
  const activeStaff = staffEconomy?.filter(s => s.totalHours > 0) || [];
  const inactiveStaff = staffEconomy?.filter(s => s.totalHours === 0) || [];

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
      {/* Month indicator */}
      <div className="flex items-center gap-2 text-muted-foreground">
        <Calendar className="w-4 h-4" />
        <span className="text-sm">
          Visar data för {format(currentMonth, 'MMMM yyyy', { locale: sv })}
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total kostnad</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(kpis.totalCostThisMonth)}</p>
              </div>
              <div className="p-3 bg-primary/20 rounded-full">
                <Banknote className="w-6 h-6 text-primary" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Denna månad
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Totala timmar</p>
                <p className="text-2xl font-bold text-foreground">{formatHours(kpis.totalHoursThisMonth)}</p>
              </div>
              <div className="p-3 bg-muted rounded-full">
                <Clock className="w-6 h-6 text-muted-foreground" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Övertid: {formatHours(kpis.totalOvertimeThisMonth)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Aktiv personal</p>
                <p className="text-2xl font-bold text-foreground">
                  {kpis.activeStaff} / {kpis.totalStaff}
                </p>
              </div>
              <div className="p-3 bg-muted rounded-full">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Personal med rapporterad tid
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Snitt per person</p>
                <p className="text-2xl font-bold text-foreground">{formatHours(kpis.avgHoursPerStaff)}</p>
              </div>
              <div className="p-3 bg-muted rounded-full">
                <TrendingUp className="w-6 h-6 text-muted-foreground" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Bland aktiv personal
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active Staff with Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Personal med registrerad tid ({activeStaff.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Namn</th>
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Roll</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Timmar</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Övertid</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Timpris</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Kostnad</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Projekt</th>
                </tr>
              </thead>
              <tbody>
                {activeStaff.map(staff => (
                  <tr key={staff.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-2">
                      <Link 
                        to={`/staff/${staff.id}`}
                        className="text-primary hover:underline font-medium"
                      >
                        {staff.name}
                      </Link>
                    </td>
                    <td className="py-3 px-2 text-muted-foreground">
                      {staff.role || '-'}
                    </td>
                    <td className="text-right py-3 px-2 font-medium">
                      {formatHours(staff.totalHours)}
                    </td>
                    <td className="text-right py-3 px-2">
                      {staff.overtimeHours > 0 ? (
                        <span className="text-amber-600">{formatHours(staff.overtimeHours)}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="text-right py-3 px-2 text-muted-foreground">
                      {formatCurrency(staff.hourly_rate || 0)}/tim
                    </td>
                    <td className="text-right py-3 px-2 font-medium">
                      {formatCurrency(staff.totalCost)}
                    </td>
                    <td className="text-right py-3 px-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        {staff.projects.slice(0, 2).map((project, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {project.name.length > 15 
                              ? project.name.substring(0, 15) + '...' 
                              : project.name}
                          </Badge>
                        ))}
                        {staff.projects.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{staff.projects.length - 2}
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 font-medium">
                  <td className="py-3 px-2" colSpan={2}>Totalt</td>
                  <td className="text-right py-3 px-2">{formatHours(kpis.totalHoursThisMonth)}</td>
                  <td className="text-right py-3 px-2 text-amber-600">{formatHours(kpis.totalOvertimeThisMonth)}</td>
                  <td className="text-right py-3 px-2">-</td>
                  <td className="text-right py-3 px-2">{formatCurrency(kpis.totalCostThisMonth)}</td>
                  <td className="text-right py-3 px-2">-</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

    </div>
  );
};
