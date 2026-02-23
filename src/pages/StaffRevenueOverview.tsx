import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { 
  Users, 
  TrendingUp,
  TrendingDown,
  Banknote,
  Clock,
  Award,
  Target,
  CalendarIcon,
  ArrowUpDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { 
  fetchStaffRevenueData, 
  type TimeFilterType, 
  type StaffRevenueData,
  type StaffRevenueKPIs
} from '@/services/staffRevenueService';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('sv-SE', { 
    style: 'currency', 
    currency: 'SEK',
    maximumFractionDigits: 0 
  }).format(value);
};

const formatHours = (hours: number) => `${hours.toFixed(1)} tim`;

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

type SortField = 'revenue' | 'margin' | 'hours' | 'jobs';
type SortDirection = 'asc' | 'desc';

export default function StaffRevenueOverview() {
  const [filterType, setFilterType] = useState<TimeFilterType>('month');
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();
  const [sortField, setSortField] = useState<SortField>('revenue');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { data, isLoading, error } = useQuery({
    queryKey: ['staff-revenue', filterType, customStart?.toISOString(), customEnd?.toISOString()],
    queryFn: () => fetchStaffRevenueData(filterType, customStart, customEnd)
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedStaff = React.useMemo(() => {
    if (!data?.staff) return [];
    
    return [...data.staff].sort((a, b) => {
      let aVal: number, bVal: number;
      
      switch (sortField) {
        case 'revenue':
          aVal = a.revenue_contribution;
          bVal = b.revenue_contribution;
          break;
        case 'margin':
          aVal = a.margin;
          bVal = b.margin;
          break;
        case 'hours':
          aVal = a.total_hours + a.overtime_hours;
          bVal = b.total_hours + b.overtime_hours;
          break;
        case 'jobs':
          aVal = a.jobs_count;
          bVal = b.jobs_count;
          break;
        default:
          aVal = a.revenue_contribution;
          bVal = b.revenue_contribution;
      }
      
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [data?.staff, sortField, sortDirection]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardContent className="pt-6 text-center text-destructive">
            Ett fel uppstod vid hämtning av data.
          </CardContent>
        </Card>
      </div>
    );
  }

  const kpis = data?.kpis || {} as StaffRevenueKPIs;

  return (
    <PageContainer>
      <PageHeader
        icon={Users}
        title="Personalekonomi"
        subtitle="Intäkt och marginal per personal"
      >
        {/* Time filter buttons */}
        <div className="flex flex-wrap gap-2">
          {(['day', 'week', 'month', 'year'] as TimeFilterType[]).map(type => (
            <Button
              key={type}
              variant={filterType === type ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType(type)}
            >
              {type === 'day' && 'Dag'}
              {type === 'week' && 'Vecka'}
              {type === 'month' && 'Månad'}
              {type === 'year' && 'År'}
            </Button>
          ))}
          
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant={filterType === 'custom' ? 'default' : 'outline'} 
                size="sm"
              >
                <CalendarIcon className="h-4 w-4 mr-2" />
                Period
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-sm font-medium">Från</label>
                  <Calendar
                    mode="single"
                    selected={customStart}
                    onSelect={(date) => {
                      setCustomStart(date);
                      if (date && customEnd) setFilterType('custom');
                    }}
                    locale={sv}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Till</label>
                  <Calendar
                    mode="single"
                    selected={customEnd}
                    onSelect={(date) => {
                      setCustomEnd(date);
                      if (customStart && date) setFilterType('custom');
                    }}
                    locale={sv}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total intäkt</p>
                <p className="text-2xl font-bold">{formatCurrency(kpis.total_revenue || 0)}</p>
              </div>
              <div className="p-3 bg-primary/20 rounded-full">
                <Banknote className="w-6 h-6 text-primary" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Snitt per person: {formatCurrency(kpis.avg_revenue_per_staff || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className={cn(
          (kpis.total_margin || 0) >= 0 ? "bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20" : "bg-destructive/10 border-destructive/20"
        )}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total marginal</p>
                <p className={cn(
                  "text-2xl font-bold",
                  (kpis.total_margin || 0) >= 0 ? "text-primary" : "text-destructive"
                )}>
                  {formatCurrency(kpis.total_margin || 0)}
                </p>
              </div>
              <div className={cn(
                "p-3 rounded-full",
                (kpis.total_margin || 0) >= 0 ? "bg-primary/20" : "bg-destructive/20"
              )}>
                {(kpis.total_margin || 0) >= 0 ? (
                  <TrendingUp className="w-6 h-6 text-primary" />
                ) : (
                  <TrendingDown className="w-6 h-6 text-destructive" />
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {formatPercent(kpis.margin_percentage || 0)} marginal
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Arbetade timmar</p>
                <p className="text-2xl font-bold">{formatHours(kpis.total_hours || 0)}</p>
              </div>
              <div className="p-3 bg-muted rounded-full">
                <Clock className="w-6 h-6 text-muted-foreground" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {kpis.jobs_completed || 0} jobb genomförda
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Aktiv personal</p>
                <p className="text-2xl font-bold">{kpis.active_staff_count || 0}</p>
              </div>
              <div className="p-3 bg-muted rounded-full">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Med registrerad tid
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top Performers */}
      {sortedStaff.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Revenue */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-primary">
                <Award className="w-5 h-5" />
                Högst intäkt
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sortedStaff.slice(0, 3).map((staff, idx) => (
                  <div key={staff.staff_id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
                        idx === 0 ? "bg-primary text-primary-foreground" :
                        idx === 1 ? "bg-muted-foreground text-white" :
                        "bg-primary/70 text-primary-foreground"
                      )}>
                        {idx + 1}
                      </div>
                      <div>
                        <Link to={`/staff/${staff.staff_id}`} className="font-medium hover:underline">
                          {staff.staff_name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{staff.role || 'Ingen roll'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(staff.revenue_contribution)}</p>
                      <p className="text-xs text-muted-foreground">{staff.jobs_count} jobb</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Margin */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-primary">
                <Target className="w-5 h-5" />
                Högst marginal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[...sortedStaff]
                  .sort((a, b) => b.margin - a.margin)
                  .slice(0, 3)
                  .map((staff, idx) => (
                  <div key={staff.staff_id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
                        idx === 0 ? "bg-primary text-primary-foreground" :
                        idx === 1 ? "bg-muted-foreground text-white" :
                        "bg-primary/70 text-primary-foreground"
                      )}>
                        {idx + 1}
                      </div>
                      <div>
                        <Link to={`/staff/${staff.staff_id}`} className="font-medium hover:underline">
                          {staff.staff_name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{staff.role || 'Ingen roll'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{formatCurrency(staff.margin)}</p>
                      <p className="text-xs text-muted-foreground">{formatPercent(staff.margin_percentage)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Full Staff Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            All personal ({sortedStaff.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Namn</th>
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Roll</th>
                  <th 
                    className="text-right py-3 px-2 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => handleSort('hours')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Timmar
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th 
                    className="text-right py-3 px-2 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => handleSort('jobs')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Jobb
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th 
                    className="text-right py-3 px-2 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => handleSort('revenue')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Intäkt
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Kostnad</th>
                  <th 
                    className="text-right py-3 px-2 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => handleSort('margin')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Marginal
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Rang</th>
                </tr>
              </thead>
              <tbody>
                {sortedStaff.map(staff => (
                  <tr key={staff.staff_id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-2">
                      <Link 
                        to={`/staff/${staff.staff_id}`}
                        className="text-primary hover:underline font-medium"
                      >
                        {staff.staff_name}
                      </Link>
                    </td>
                    <td className="py-3 px-2 text-muted-foreground">
                      {staff.role || '-'}
                    </td>
                    <td className="text-right py-3 px-2">
                      {formatHours(staff.total_hours)}
                      {staff.overtime_hours > 0 && (
                        <span className="text-primary text-xs ml-1">
                          (+{staff.overtime_hours.toFixed(1)})
                        </span>
                      )}
                    </td>
                    <td className="text-right py-3 px-2">
                      {staff.jobs_count}
                    </td>
                    <td className="text-right py-3 px-2 font-medium">
                      {formatCurrency(staff.revenue_contribution)}
                    </td>
                    <td className="text-right py-3 px-2 text-muted-foreground">
                      {formatCurrency(staff.labor_cost)}
                    </td>
                    <td className="text-right py-3 px-2">
                      <span className={cn(
                        "font-medium",
                        staff.margin >= 0 ? "text-primary" : "text-destructive"
                      )}>
                        {formatCurrency(staff.margin)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">
                        ({formatPercent(staff.margin_percentage)})
                      </span>
                    </td>
                    <td className="text-right py-3 px-2">
                      <div className="flex justify-end gap-1">
                        <Badge variant="outline" className="text-xs">
                          #{staff.revenue_rank} intäkt
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          #{staff.margin_rank} marginal
                        </Badge>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 font-medium">
                  <td className="py-3 px-2" colSpan={2}>Totalt</td>
                  <td className="text-right py-3 px-2">{formatHours(kpis.total_hours || 0)}</td>
                  <td className="text-right py-3 px-2">{kpis.jobs_completed || 0}</td>
                  <td className="text-right py-3 px-2">{formatCurrency(kpis.total_revenue || 0)}</td>
                  <td className="text-right py-3 px-2">{formatCurrency(kpis.total_labor_cost || 0)}</td>
                  <td className="text-right py-3 px-2">
                    <span className={cn(
                      (kpis.total_margin || 0) >= 0 ? "text-primary" : "text-destructive"
                    )}>
                      {formatCurrency(kpis.total_margin || 0)}
                    </span>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
