import React, { useState, useMemo } from 'react';
import { Clock, ChevronRight, Search, ChevronLeft } from 'lucide-react';
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

  return (
    <PremiumCard
      icon={Clock}
      title="Tidrapporter"
      subtitle={`${staffList.length} personer · ${monthLabel}`}
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

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {search ? 'Inga träffar' : 'Ingen personal hittades'}
          </div>
        ) : (
          filtered.map(staff => (
            <button
              key={staff.id}
              onClick={() => onSelectStaff(staff.id, staff.name)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left group"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                style={{
                  backgroundColor: staff.color ? `${staff.color}20` : 'hsl(var(--muted))',
                  color: staff.color || 'hsl(var(--muted-foreground))',
                }}
              >
                {staff.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground truncate">{staff.name}</span>
                  {staff.role && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {staff.role}
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
                {staff.total_hours_this_month > 0 ? (
                  <>
                    <div className="text-sm font-semibold text-foreground">
                      {formatHoursMinutes(staff.total_hours_this_month)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {staff.reports_count} rapporter
                    </div>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">0h</span>
                )}
              </div>

              <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0" />
            </button>
          ))
        )}
      </div>
    </PremiumCard>
  );
};
