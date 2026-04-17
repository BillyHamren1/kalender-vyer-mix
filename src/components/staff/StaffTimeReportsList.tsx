import React, { useState, useMemo } from 'react';
import { Clock, ChevronRight, Search, ChevronLeft, Activity, CheckCircle2 } from 'lucide-react';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { format, addMonths, subMonths } from 'date-fns';
import { sv } from 'date-fns/locale';
import { formatHoursMinutes } from '@/utils/formatHours';

interface StaffWithLatestReport {
  id: string;
  name: string;
  role: string | null;
  color: string | null;
  latest_report_date: string | null;
  latest_hours: number | null;
  total_hours_this_month: number;
  reports_count: number;
  has_open_report: boolean;
}

interface StaffTimeReportsListProps {
  staffList: StaffWithLatestReport[];
  isLoading: boolean;
  onSelectStaff: (id: string, name: string) => void;
  selectedMonth: Date;
  onMonthChange: (month: Date) => void;
}

export const StaffTimeReportsList: React.FC<StaffTimeReportsListProps> = ({
  staffList,
  isLoading,
  onSelectStaff,
  selectedMonth,
  onMonthChange,
}) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return staffList;
    const q = search.toLowerCase();
    return staffList.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.role && s.role.toLowerCase().includes(q))
    );
  }, [staffList, search]);

  if (isLoading) {
    return (
      <PremiumCard icon={Clock} title="Personal" subtitle="Laddar...">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </PremiumCard>
    );
  }

  const monthLabel = format(selectedMonth, 'MMMM yyyy', { locale: sv });
  const openCount = staffList.filter(s => s.has_open_report).length;

  return (
    <PremiumCard
      icon={Clock}
      title="Tidrapporter"
      subtitle={`${staffList.length} med rapport · ${monthLabel}`}
      count={staffList.length}
    >
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMonthChange(subMonths(selectedMonth, 1))}
          className="rounded-xl"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Förra
        </Button>
        <span className="text-sm font-medium capitalize">{monthLabel}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMonthChange(addMonths(selectedMonth, 1))}
          className="rounded-xl"
        >
          Nästa
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Summary badges */}
      {staffList.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <Badge variant="secondary" className="text-[11px] gap-1">
            <Clock className="h-3 w-3" />
            {staffList.length} {staffList.length === 1 ? 'person' : 'personer'}
          </Badge>
          {openCount > 0 && (
            <Badge
              variant="outline"
              className="text-[11px] gap-1 border-orange-300 text-orange-600 bg-orange-50 dark:bg-orange-950/20"
            >
              <Activity className="h-3 w-3" />
              {openCount} pågående
            </Badge>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Sök personal..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 rounded-xl"
        />
      </div>

      <div className="space-y-1.5">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {search
              ? 'Inga träffar'
              : 'Ingen personal har rapporterat tid denna månad'}
          </div>
        ) : (
          filtered.map(staff => (
            <button
              key={staff.id}
              onClick={() => onSelectStaff(staff.id, staff.name)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group ${
                staff.has_open_report
                  ? 'border-orange-200 bg-orange-50/30 hover:bg-orange-50/60 dark:border-orange-900/40 dark:bg-orange-950/10 dark:hover:bg-orange-950/20'
                  : 'border-transparent hover:bg-muted/50 hover:border-border'
              }`}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 relative"
                style={{
                  backgroundColor: staff.color ? `${staff.color}20` : 'hsl(var(--muted))',
                  color: staff.color || 'hsl(var(--muted-foreground))',
                }}
              >
                {staff.name.charAt(0).toUpperCase()}
                {staff.has_open_report && (
                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-orange-500 border-2 border-background animate-pulse" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-foreground truncate">{staff.name}</span>
                  {staff.role && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {staff.role}
                    </Badge>
                  )}
                  {staff.has_open_report ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 gap-1 border-orange-300 text-orange-600"
                    >
                      <Activity className="h-2.5 w-2.5" />
                      Pågående
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 gap-1 border-emerald-300 text-emerald-700 dark:text-emerald-500"
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      Stängd
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {staff.latest_report_date
                    ? `Senast: ${format(new Date(staff.latest_report_date), 'd MMM yyyy', { locale: sv })}`
                    : 'Ingen tidrapport'}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-foreground tabular-nums">
                  {formatHoursMinutes(staff.total_hours_this_month)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {staff.reports_count} {staff.reports_count === 1 ? 'rapport' : 'rapporter'}
                </div>
              </div>

              <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0" />
            </button>
          ))
        )}
      </div>
    </PremiumCard>
  );
};
