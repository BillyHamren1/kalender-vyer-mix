import { useState, useMemo } from "react";
import { RefreshCw, TrendingUp, TrendingDown, Clock, Package, DollarSign, Target, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

      // Fetch packing projects with budgets
      const { data: packings, error: packingsError } = await supabase
        .from('packing_projects')
        .select(`
          id,
          name,
          status,
          created_at,
          updated_at
        `)
        .gte('created_at', startStr)
        .lte('created_at', endStr + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (packingsError) throw packingsError;

      const packingIds = (packings || []).map(p => p.id);

      // Fetch budgets, labor costs, and purchases in parallel
      const [budgetsRes, laborRes, purchasesRes] = await Promise.all([
        supabase.from('packing_budget').select('*').in('packing_id', packingIds),
        supabase.from('packing_labor_costs').select('*').in('packing_id', packingIds),
        supabase.from('packing_purchases').select('*').in('packing_id', packingIds)
      ]);

      // Build lookup maps
      const budgetsByPacking = (budgetsRes.data || []).reduce((acc, b) => {
        acc[b.packing_id] = b;
        return acc;
      }, {} as Record<string, any>);

      const laborByPacking = (laborRes.data || []).reduce((acc, l) => {
        if (!acc[l.packing_id]) acc[l.packing_id] = { hours: 0, cost: 0 };
        acc[l.packing_id].hours += l.hours || 0;
        acc[l.packing_id].cost += (l.hours || 0) * (l.hourly_rate || 0);
        return acc;
      }, {} as Record<string, { hours: number; cost: number }>);

      const purchasesByPacking = (purchasesRes.data || []).reduce((acc, p) => {
        acc[p.packing_id] = (acc[p.packing_id] || 0) + (p.amount || 0);
        return acc;
      }, {} as Record<string, number>);

      // Calculate economy data for each packing
      const economyData: PackingEconomyData[] = (packings || []).map(packing => {
        const budget = budgetsByPacking[packing.id];
        const labor = laborByPacking[packing.id] || { hours: 0, cost: 0 };
        const purchases = purchasesByPacking[packing.id] || 0;

        const budgetedHours = budget?.budgeted_hours || 0;
        const hourlyRate = budget?.hourly_rate || 350;
        const budgetedAmount = budgetedHours * hourlyRate;
        
        const actualCost = labor.cost + purchases;
        const deviation = budgetedAmount - actualCost;
        const deviationPercent = budgetedAmount > 0 
          ? Math.round((deviation / budgetedAmount) * 100) 
          : 0;

        return {
          id: packing.id,
          name: packing.name,
          status: packing.status,
          budgetedHours,
          budgetedAmount,
          actualHours: labor.hours,
          actualCost,
          purchases,
          deviation,
          deviationPercent
        };
      });

      return economyData;
    }
  });

  // Fetch staff labor summary
  const staffSummaryQuery = useQuery({
    queryKey: ['warehouse-staff-summary', format(currentMonth, 'yyyy-MM')],
    queryFn: async () => {
      const startStr = format(currentMonth, 'yyyy-MM-dd');
      const endStr = format(monthEnd, 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('packing_labor_costs')
        .select(`
          staff_id,
          staff_name,
          hours,
          hourly_rate
        `)
        .gte('work_date', startStr)
        .lte('work_date', endStr);

      if (error) throw error;

      // Aggregate by staff
      const staffMap = (data || []).reduce((acc, row) => {
        const key = row.staff_id || row.staff_name;
        if (!acc[key]) {
          acc[key] = {
            name: row.staff_name,
            hours: 0,
            cost: 0
          };
        }
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

  // Calculate totals
  const totals = useMemo(() => {
    const totalBudget = economyData.reduce((sum, p) => sum + p.budgetedAmount, 0);
    const totalActual = economyData.reduce((sum, p) => sum + p.actualCost, 0);
    const totalDeviation = totalBudget - totalActual;
    const totalHoursBudgeted = economyData.reduce((sum, p) => sum + p.budgetedHours, 0);
    const totalHoursActual = economyData.reduce((sum, p) => sum + p.actualHours, 0);
    
    return {
      budget: totalBudget,
      actual: totalActual,
      deviation: totalDeviation,
      deviationPercent: totalBudget > 0 ? Math.round((totalDeviation / totalBudget) * 100) : 0,
      hoursBudgeted: totalHoursBudgeted,
      hoursActual: totalHoursActual
    };
  }, [economyData]);

  const refetchAll = () => {
    economyQuery.refetch();
    staffSummaryQuery.refetch();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount);
  };

  const getDeviationStyles = (deviation: number, deviationPercent: number) => {
    if (deviation >= 0) {
      return { 
        color: 'text-primary', 
        bg: 'bg-primary/10',
        icon: TrendingUp
      };
    } else if (deviationPercent > -10) {
      return { 
        color: 'text-amber-600', 
        bg: 'bg-amber-100',
        icon: TrendingDown
      };
    }
    return { 
      color: 'text-destructive', 
      bg: 'bg-destructive/10',
      icon: TrendingDown
    };
  };

  const statusLabels: Record<string, string> = {
    planning: 'Planering',
    in_progress: 'Pågående',
    completed: 'Slutförd'
  };

  const statusColors: Record<string, string> = {
    planning: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-amber-100 text-amber-800',
    completed: 'bg-primary/10 text-primary'
  };

  return (
    <div className="h-full overflow-y-auto bg-muted/30 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Lagerekonomi</h1>
          <p className="text-muted-foreground">
            Budget och kostnadsuppföljning för packningsarbete
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={refetchAll}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Uppdatera
          </Button>
        </div>
      </div>

      {/* Month Navigation */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="text-center min-w-[160px]">
              <span className="text-lg font-semibold capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: sv })}
              </span>
            </div>
            <Button variant="outline" size="icon" onClick={goToNextMonth}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToCurrentMonth}>
              Idag
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warehouse/10">
                <Target className="w-5 h-5 text-warehouse" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total budget</p>
                <p className="text-xl font-bold">{formatCurrency(totals.budget)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <DollarSign className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Faktisk kostnad</p>
                <p className="text-xl font-bold">{formatCurrency(totals.actual)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn(getDeviationStyles(totals.deviation, totals.deviationPercent).bg)}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-background">
                {totals.deviation >= 0 ? (
                  <TrendingUp className="w-5 h-5 text-primary" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-destructive" />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avvikelse</p>
                <p className={cn("text-xl font-bold", getDeviationStyles(totals.deviation, totals.deviationPercent).color)}>
                  {totals.deviation >= 0 ? '+' : ''}{formatCurrency(totals.deviation)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Clock className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Timmar</p>
                <p className="text-xl font-bold">{totals.hoursActual}h / {totals.hoursBudgeted}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Packings Economy List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-warehouse" />
                Packningar denna månad ({economyData.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16" />)}
                </div>
              ) : economyData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Inga packningar denna månad
                </p>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="divide-y">
                    {economyData.map(packing => {
                      const styles = getDeviationStyles(packing.deviation, packing.deviationPercent);
                      const usagePercent = packing.budgetedAmount > 0 
                        ? Math.min(Math.round((packing.actualCost / packing.budgetedAmount) * 100), 150)
                        : 0;

                      return (
                        <div
                          key={packing.id}
                          className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
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
            </CardContent>
          </Card>
        </div>

        {/* Staff Summary */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="w-5 h-5 text-warehouse" />
                Personal denna månad
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : staffSummary.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Ingen tid registrerad
                </p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="divide-y">
                    {staffSummary.map((staff, index) => (
                      <div key={index} className="p-4">
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default WarehouseEconomy;
