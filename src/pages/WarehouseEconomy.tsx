import { useState, useMemo } from "react";
import { RefreshCw, TrendingUp, TrendingDown, Clock, Package, DollarSign, Target, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { sv } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PackingEconomyData {
  id: string;
  name: string;
  status: string;
  budgetedHours: number;
  budgetedAmount: number;
  actualHours: number;
  actualCost: number;
  purchases: number;
  deviation: number;
  deviationPercent: number;
}

const WarehouseEconomy = () => {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const monthEnd = endOfMonth(currentMonth);

  const goToPreviousMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const goToNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const goToCurrentMonth = () => setCurrentMonth(startOfMonth(new Date()));

  // Fetch all packing economy data
  const economyQuery = useQuery({
    queryKey: ['warehouse-economy', format(currentMonth, 'yyyy-MM')],
    queryFn: async () => {
      const startStr = format(currentMonth, 'yyyy-MM-dd');
      const endStr = format(monthEnd, 'yyyy-MM-dd');
      const { data: packings, error: packingsError } = await supabase
        .from('packing_projects')
        .select(`id, name, status, created_at, updated_at`)
        .gte('created_at', startStr)
        .lte('created_at', endStr + 'T23:59:59')
        .order('created_at', { ascending: false });
      if (packingsError) throw packingsError;
      const packingIds = (packings || []).map(p => p.id);
      const [budgetsRes, laborRes, purchasesRes] = await Promise.all([
        supabase.from('packing_budget').select('*').in('packing_id', packingIds),
        supabase.from('packing_labor_costs').select('*').in('packing_id', packingIds),
        supabase.from('packing_purchases').select('*').in('packing_id', packingIds)
      ]);
      const budgetsByPacking = (budgetsRes.data || []).reduce((acc, b) => { acc[b.packing_id] = b; return acc; }, {} as Record<string, any>);
      const laborByPacking = (laborRes.data || []).reduce((acc, l) => {
        if (!acc[l.packing_id]) acc[l.packing_id] = { hours: 0, cost: 0 };
        acc[l.packing_id].hours += l.hours || 0;
        acc[l.packing_id].cost += (l.hours || 0) * (l.hourly_rate || 0);
        return acc;
      }, {} as Record<string, { hours: number; cost: number }>);
      const purchasesByPacking = (purchasesRes.data || []).reduce((acc, p) => { acc[p.packing_id] = (acc[p.packing_id] || 0) + (p.amount || 0); return acc; }, {} as Record<string, number>);
      const economyData: PackingEconomyData[] = (packings || []).map(packing => {
        const budget = budgetsByPacking[packing.id];
        const labor = laborByPacking[packing.id] || { hours: 0, cost: 0 };
        const purchases = purchasesByPacking[packing.id] || 0;
        const budgetedHours = budget?.budgeted_hours || 0;
        const hourlyRate = budget?.hourly_rate || 350;
        const budgetedAmount = budgetedHours * hourlyRate;
        const actualCost = labor.cost + purchases;
        const deviation = budgetedAmount - actualCost;
        const deviationPercent = budgetedAmount > 0 ? Math.round((deviation / budgetedAmount) * 100) : 0;
        return { id: packing.id, name: packing.name, status: packing.status, budgetedHours, budgetedAmount, actualHours: labor.hours, actualCost, purchases, deviation, deviationPercent };
      });
      return economyData;
    }
  });

  const staffSummaryQuery = useQuery({
    queryKey: ['warehouse-staff-summary', format(currentMonth, 'yyyy-MM')],
    queryFn: async () => {
      const startStr = format(currentMonth, 'yyyy-MM-dd');
      const endStr = format(monthEnd, 'yyyy-MM-dd');
      const { data, error } = await supabase.from('packing_labor_costs').select(`staff_id, staff_name, hours, hourly_rate`).gte('work_date', startStr).lte('work_date', endStr);
      if (error) throw error;
      const staffMap = (data || []).reduce((acc, row) => {
        const key = row.staff_id || row.staff_name;
        if (!acc[key]) { acc[key] = { name: row.staff_name, hours: 0, cost: 0 }; }
        acc[key].hours += row.hours || 0;
        acc[key].cost += (row.hours || 0) * (row.hourly_rate || 0);
        return acc;
      }, {} as Record<string, { name: string; hours: number; cost: number }>);
      return Object.values(staffMap).sort((a, b) => b.hours - a.hours);
    }
  });

  const isLoading = economyQuery.isLoading || staffSummaryQuery.isLoading;
  const economyData = economyQuery.data || [];
  const staffSummary = staffSummaryQuery.data || [];

  const totals = useMemo(() => {
    const totalBudget = economyData.reduce((sum, p) => sum + p.budgetedAmount, 0);
    const totalActual = economyData.reduce((sum, p) => sum + p.actualCost, 0);
    const totalDeviation = totalBudget - totalActual;
    const totalHoursBudgeted = economyData.reduce((sum, p) => sum + p.budgetedHours, 0);
    const totalHoursActual = economyData.reduce((sum, p) => sum + p.actualHours, 0);
    return {
      budget: totalBudget, actual: totalActual, deviation: totalDeviation,
      deviationPercent: totalBudget > 0 ? Math.round((totalDeviation / totalBudget) * 100) : 0,
      hoursBudgeted: totalHoursBudgeted, hoursActual: totalHoursActual
    };
  }, [economyData]);

  const refetchAll = () => { economyQuery.refetch(); staffSummaryQuery.refetch(); };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount);
  };

  const getDeviationStyles = (deviation: number, deviationPercent: number) => {
    if (deviation >= 0) return { color: 'text-primary', bg: 'bg-primary/10', icon: TrendingUp };
    if (deviationPercent > -10) return { color: 'text-amber-600', bg: 'bg-amber-100', icon: TrendingDown };
    return { color: 'text-destructive', bg: 'bg-destructive/10', icon: TrendingDown };
  };

  const statusLabels: Record<string, string> = { planning: 'Planering', in_progress: 'Pågående', completed: 'Slutförd' };
  const statusColors: Record<string, string> = { planning: 'bg-blue-100 text-blue-800', in_progress: 'bg-amber-100 text-amber-800', completed: 'bg-primary/10 text-primary' };

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--gradient-page)' }}>
      <div className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(184_60%_38%/0.04),transparent)]" />

        <div className="relative p-6 max-w-[1600px] mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 p-7 rounded-2xl bg-card border border-border/40 shadow-2xl">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg shadow-warehouse/15"
                style={{ background: 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)' }}
              >
                <DollarSign className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--heading))]">Lagerekonomi</h1>
                <p className="text-muted-foreground text-[0.925rem] leading-relaxed">
                  Budget och kostnadsuppföljning för packningsarbete
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={refetchAll}
              disabled={isLoading}
              className="border-border/60"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Uppdatera
            </Button>
          </div>

          {/* Month Navigation */}
          <div className="mb-6 rounded-2xl border border-border/40 shadow-2xl bg-card p-4">
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" size="icon" onClick={goToPreviousMonth} className="border-border/60 rounded-xl">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="text-center min-w-[160px]">
                <span className="text-lg font-semibold capitalize tracking-tight text-[hsl(var(--heading))]">
                  {format(currentMonth, 'MMMM yyyy', { locale: sv })}
                </span>
              </div>
              <Button variant="outline" size="icon" onClick={goToNextMonth} className="border-border/60 rounded-xl">
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={goToCurrentMonth} className="font-medium">
                Idag
              </Button>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[
              { icon: Target, label: 'Total budget', value: formatCurrency(totals.budget), iconGradient: 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)' },
              { icon: DollarSign, label: 'Faktisk kostnad', value: formatCurrency(totals.actual), iconGradient: 'var(--gradient-icon)' },
              { icon: totals.deviation >= 0 ? TrendingUp : TrendingDown, label: 'Avvikelse', value: `${totals.deviation >= 0 ? '+' : ''}${formatCurrency(totals.deviation)}`, iconGradient: 'var(--gradient-icon)', valueColor: getDeviationStyles(totals.deviation, totals.deviationPercent).color },
              { icon: Clock, label: 'Timmar', value: `${totals.hoursActual}h / ${totals.hoursBudgeted}h`, iconGradient: 'var(--gradient-icon)' },
            ].map((kpi, i) => (
              <div key={i} className="rounded-2xl border border-border/40 shadow-2xl bg-card p-7">
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shadow-lg shadow-primary/15"
                    style={{ background: kpi.iconGradient }}
                  >
                    <kpi.icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
                    <p className={cn("text-xl font-bold tracking-tight text-[hsl(var(--heading))]", kpi.valueColor)}>{kpi.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Packings Economy List */}
            <div className="lg:col-span-2">
              <div className="rounded-2xl border border-border/40 shadow-2xl bg-card overflow-hidden">
                <div className="p-5 pb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shadow-md shadow-warehouse/15"
                      style={{ background: 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)' }}
                    >
                      <Package className="w-4.5 h-4.5 text-white" />
                    </div>
                    <h3 className="font-semibold text-lg text-[hsl(var(--heading))]">
                      Packningar denna månad ({economyData.length})
                    </h3>
                  </div>
                </div>
                <div className="px-0">
                  {isLoading ? (
                    <div className="px-5 pb-5 space-y-2">
                      {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
                    </div>
                  ) : economyData.length === 0 ? (
                    <p className="text-[0.925rem] text-muted-foreground text-center py-8">
                      Inga packningar denna månad
                    </p>
                  ) : (
                    <ScrollArea className="h-[500px]">
                      <div className="px-5 pb-5 space-y-2">
                        {economyData.map(packing => {
                          const styles = getDeviationStyles(packing.deviation, packing.deviationPercent);
                          const usagePercent = packing.budgetedAmount > 0 
                            ? Math.min(Math.round((packing.actualCost / packing.budgetedAmount) * 100), 150)
                            : 0;

                          return (
                            <div
                              key={packing.id}
                              className="p-4 rounded-xl border border-border/30 bg-background/60 backdrop-blur-sm cursor-pointer hover:-translate-y-0.5 hover:border-warehouse/40 hover:shadow-md transition-all duration-200"
                              onClick={() => navigate(`/warehouse/packing/${packing.id}`)}
                            >
                              <div className="flex items-start justify-between gap-4 mb-3">
                                <div className="min-w-0 flex-1">
                                  <h4 className="font-medium truncate">{packing.name}</h4>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge className={`text-xs ${statusColors[packing.status] || 'bg-muted'}`}>
                                      {statusLabels[packing.status] || packing.status}
                                    </Badge>
                                  </div>
                                </div>
                                <div className={cn("text-right", styles.color)}>
                                  <div className="flex items-center gap-1 justify-end">
                                    <styles.icon className="w-4 h-4" />
                                    <span className="font-semibold">
                                      {packing.deviation >= 0 ? '+' : ''}{formatCurrency(packing.deviation)}
                                    </span>
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {packing.deviationPercent >= 0 ? '+' : ''}{packing.deviationPercent}%
                                  </span>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">
                                    Budget: {formatCurrency(packing.budgetedAmount)} ({packing.budgetedHours}h)
                                  </span>
                                  <span>
                                    Faktisk: {formatCurrency(packing.actualCost)} ({packing.actualHours}h)
                                  </span>
                                </div>
                                <Progress value={usagePercent} className="h-2" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </div>
            </div>

            {/* Staff Summary */}
            <div className="lg:col-span-1">
              <div className="rounded-2xl border border-border/40 shadow-2xl bg-card overflow-hidden">
                <div className="p-5 pb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shadow-md shadow-warehouse/15"
                      style={{ background: 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)' }}
                    >
                      <Users className="w-4.5 h-4.5 text-white" />
                    </div>
                    <h3 className="font-semibold text-lg text-[hsl(var(--heading))]">
                      Personal denna månad
                    </h3>
                  </div>
                </div>
                <div className="px-0">
                  {isLoading ? (
                    <div className="px-5 pb-5 space-y-2">
                      {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
                    </div>
                  ) : staffSummary.length === 0 ? (
                    <p className="text-[0.925rem] text-muted-foreground text-center py-6">
                      Ingen tid registrerad
                    </p>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <div className="px-5 pb-5 space-y-2">
                        {staffSummary.map((staff, index) => (
                          <div key={index} className="p-4 rounded-xl border border-border/30 bg-background/60 backdrop-blur-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm truncate">{staff.name}</span>
                              <span className="text-sm text-muted-foreground">{staff.hours}h</span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {formatCurrency(staff.cost)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WarehouseEconomy;
