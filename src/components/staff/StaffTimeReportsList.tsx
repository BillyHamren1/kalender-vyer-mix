import React, { useState, useMemo } from 'react';
import { Clock, ChevronRight, Search, ChevronLeft, Activity, CheckCircle2, CalendarDays } from 'lucide-react';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, addDays, subDays, isToday, isYesterday } from 'date-fns';
import { sv } from 'date-fns/locale';
import { formatHoursMinutes } from '@/utils/formatHours';

interface ProjectInfo {
  booking_id: string;
  label: string;
  is_open: boolean;
  total_hours: number;
}

interface StaffWithDayReport {
  id: string;
  name: string;
  role: string | null;
  color: string | null;
  total_hours: number;
  reports_count: number;
  has_open_report: boolean;
  earliest_start: string | null;
  latest_end: string | null;
  projects: ProjectInfo[];
}

interface StaffTimeReportsListProps {
  staffList: StaffWithDayReport[];
  isLoading: boolean;
  onSelectStaff: (id: string, name: string) => void;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

const formatRelativeDate = (date: Date): string => {
  if (isToday(date)) return 'Idag';
  if (isYesterday(date)) return 'Igår';
  return format(date, 'EEEE d MMMM', { locale: sv });
};

export const StaffTimeReportsList: React.FC<StaffTimeReportsListProps> = ({
  staffList,
  isLoading,
  onSelectStaff,
  selectedDate,
  onDateChange,
}) => {
  const [search, setSearch] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return staffList;
    const q = search.toLowerCase();
    return staffList.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.role && s.role.toLowerCase().includes(q))
    );
  }, [staffList, search]);

  const dateLabel = formatRelativeDate(selectedDate);
  const subLabel = format(selectedDate, "d MMMM yyyy", { locale: sv });
  const openCount = staffList.filter(s => s.has_open_report).length;
  const totalHours = staffList.reduce((s, x) => s + x.total_hours, 0);

  return (
    <PremiumCard
      icon={Clock}
      title="Tidrapporter"
      subtitle={`${staffList.length} ${staffList.length === 1 ? 'person rapporterade' : 'personer rapporterade'} · ${subLabel}`}
      count={staffList.length}
    >
      {/* Date navigation */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDateChange(subDays(selectedDate, 1))}
          className="rounded-xl shrink-0"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Förra
        </Button>

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl flex-1 max-w-[280px] gap-2 font-medium capitalize"
            >
              <CalendarDays className="h-4 w-4 text-primary" />
              {dateLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => {
                if (d) {
                  onDateChange(d);
                  setCalendarOpen(false);
                }
              }}
              locale={sv}
              initialFocus
              className="pointer-events-auto"
            />
            <div className="p-2 border-t flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onDateChange(new Date());
                  setCalendarOpen(false);
                }}
                className="rounded-xl text-xs"
              >
                Idag
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onDateChange(addDays(selectedDate, 1))}
          className="rounded-xl shrink-0"
        >
          Nästa
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Summary badges */}
      {!isLoading && staffList.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <Badge variant="secondary" className="text-[11px] gap-1">
            <Clock className="h-3 w-3" />
            {formatHoursMinutes(totalHours)} totalt
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

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {search
                ? 'Inga träffar'
                : `Ingen personal har rapporterat tid ${dateLabel.toLowerCase()}`}
            </div>
          ) : (
            filtered.map(staff => (
              <button
                key={staff.id}
                onClick={() => onSelectStaff(staff.id, staff.name)}
                className={`w-full flex items-stretch gap-2.5 px-3 py-2 rounded-lg border transition-all text-left group ${
                  staff.has_open_report
                    ? 'border-orange-200 bg-orange-50/30 hover:bg-orange-50/60 dark:border-orange-900/40 dark:bg-orange-950/10 dark:hover:bg-orange-950/20'
                    : 'border-transparent hover:bg-muted/50 hover:border-border'
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 relative self-start mt-0.5"
                  style={{
                    backgroundColor: staff.color ? `${staff.color}20` : 'hsl(var(--muted))',
                    color: staff.color || 'hsl(var(--muted-foreground))',
                  }}
                >
                  {staff.name.charAt(0).toUpperCase()}
                  {staff.has_open_report && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-orange-500 border-2 border-background animate-pulse" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Header row: name + status + day total */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
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
                    <div className="text-right shrink-0">
                      <div className="text-base font-semibold text-foreground tabular-nums leading-tight">
                        {formatHoursMinutes(staff.total_hours)}
                      </div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        {staff.earliest_start && (
                          <>
                            {staff.earliest_start.slice(0, 5)}
                            {' – '}
                            {staff.has_open_report
                              ? <span className="text-orange-600">pågår</span>
                              : (staff.latest_end?.slice(0, 5) || '—')}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Project list — one row per project */}
                  {(staff.projects?.length ?? 0) > 0 && (
                    <div className="mt-2 space-y-0.5 border-l-2 border-border/60 pl-2.5">
                      {staff.projects!.map(p => (
                        <div
                          key={p.booking_id}
                          className="flex items-center justify-between gap-3 text-xs"
                        >
                          <span
                            className={`truncate ${
                              p.is_open ? 'text-orange-700 dark:text-orange-400 font-medium' : 'text-foreground/80'
                            }`}
                            title={p.label}
                          >
                            {p.label}
                            {p.is_open && (
                              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-orange-500 align-middle animate-pulse" />
                            )}
                          </span>
                          <span className="text-muted-foreground tabular-nums shrink-0">
                            {formatHoursMinutes(p.total_hours)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0 self-center" />
              </button>
            ))
          )}
        </div>
      )}
    </PremiumCard>
  );
};
