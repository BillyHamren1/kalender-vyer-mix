import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { mobileApi, MobileTimeReport } from '@/services/mobileApiService';
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, getDay, isSameDay, addMonths, subMonths, addWeeks, subWeeks, isWithinInterval } from 'date-fns';
import { sv } from 'date-fns/locale';
import { ArrowLeft, Calendar, List, ChevronLeft, ChevronRight, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type ViewMode = 'calendar' | 'list';
type ListFilter = 'week' | 'month';

const MobileTimeHistory = () => {
  const navigate = useNavigate();
  const [reports, setReports] = useState<MobileTimeReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [listFilter, setListFilter] = useState<ListFilter>('week');
  const [listPeriod, setListPeriod] = useState(new Date());

  useEffect(() => {
    mobileApi.getTimeReports()
      .then(res => setReports(res.time_reports))
      .catch(() => toast.error('Kunde inte ladda rapporter'))
      .finally(() => setIsLoading(false));
  }, []);

  const totalHours = reports.reduce((sum, r) => sum + r.hours_worked, 0);

  // Group reports by date for calendar
  const reportsByDate = useMemo(() => {
    const map = new Map<string, MobileTimeReport[]>();
    reports.forEach(r => {
      const key = r.report_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return map;
  }, [reports]);

  // Calendar data
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = (getDay(monthStart) + 6) % 7; // Monday = 0

  const selectedDateReports = selectedDate
    ? reports.filter(r => isSameDay(parseISO(r.report_date), selectedDate))
    : [];

  // List view: filter by period
  const listInterval = useMemo(() => {
    if (listFilter === 'week') {
      const s = startOfWeek(listPeriod, { weekStartsOn: 1 });
      const e = endOfWeek(listPeriod, { weekStartsOn: 1 });
      return { start: s, end: e };
    }
    return { start: startOfMonth(listPeriod), end: endOfMonth(listPeriod) };
  }, [listFilter, listPeriod]);

  const filteredListReports = useMemo(() => {
    return reports.filter(r => {
      const d = parseISO(r.report_date);
      return isWithinInterval(d, listInterval);
    });
  }, [reports, listInterval]);

  // Build all days in interval with their reports (ascending order)
  const groupedListReports = useMemo(() => {
    const days = eachDayOfInterval(listInterval);
    const reportMap = new Map<string, MobileTimeReport[]>();
    filteredListReports.forEach(r => {
      const key = r.report_date;
      if (!reportMap.has(key)) reportMap.set(key, []);
      reportMap.get(key)!.push(r);
    });
    return days.map(day => {
      const key = format(day, 'yyyy-MM-dd');
      return { dateKey: key, day, reports: reportMap.get(key) || [] };
    });
  }, [filteredListReports, listInterval]);

  const filteredTotalHours = filteredListReports.reduce((s, r) => s + r.hours_worked, 0);

  const listPeriodLabel = listFilter === 'week'
    ? `${format(listInterval.start, 'd MMM', { locale: sv })} – ${format(listInterval.end, 'd MMM yyyy', { locale: sv })}`
    : format(listPeriod, 'MMMM yyyy', { locale: sv });

  const navigateListPeriod = (dir: 1 | -1) => {
    setListPeriod(p => listFilter === 'week'
      ? (dir === 1 ? addWeeks(p, 1) : subWeeks(p, 1))
      : (dir === 1 ? addMonths(p, 1) : subMonths(p, 1))
    );
  };

  const weekDays = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary px-4 pt-12 pb-4 safe-area-top rounded-b-3xl shadow-md">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/m/profile')} className="p-2 -ml-1 rounded-xl active:scale-95 transition-all">
            <ArrowLeft className="w-5 h-5 text-primary-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold text-primary-foreground tracking-tight">Tidrapporter</h1>
            <p className="text-[11px] text-primary-foreground/50 font-medium">
              {reports.length} st · {totalHours}h totalt
            </p>
          </div>
        </div>
      </div>

      {/* Tabs under header */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex bg-muted rounded-2xl p-1 gap-1">
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
              viewMode === 'list' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <List className="w-4 h-4" />
            Lista
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
              viewMode === 'calendar' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <Calendar className="w-4 h-4" />
            Kalender
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : viewMode === 'calendar' ? (
          <div className="space-y-3">
            {/* Month navigation */}
            <div className="flex items-center justify-between px-1">
              <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="p-2 rounded-xl active:scale-95 transition-all">
                <ChevronLeft className="w-5 h-5 text-foreground" />
              </button>
              <h2 className="text-sm font-bold text-foreground capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: sv })}
              </h2>
              <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="p-2 rounded-xl active:scale-95 transition-all">
                <ChevronRight className="w-5 h-5 text-foreground" />
              </button>
            </div>

            {/* Calendar grid */}
            <div className="rounded-2xl border border-border/50 bg-card p-3 shadow-sm">
              <div className="grid grid-cols-7 gap-1 mb-1">
                {weekDays.map(d => (
                  <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground uppercase py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: startDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {daysInMonth.map(day => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const dayReports = reportsByDate.get(dateKey);
                  const hasReports = !!dayReports && dayReports.length > 0;
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const dayHours = dayReports?.reduce((s, r) => s + r.hours_worked, 0) || 0;

                  return (
                    <button
                      key={dateKey}
                      onClick={() => setSelectedDate(isSelected ? null : day)}
                      className={cn(
                        "aspect-square rounded-xl flex flex-col items-center justify-center text-xs transition-all active:scale-95 relative",
                        isSelected
                          ? "bg-primary text-primary-foreground font-bold"
                          : hasReports
                            ? "bg-primary/10 text-foreground font-semibold"
                            : "text-muted-foreground"
                      )}
                    >
                      <span>{format(day, 'd')}</span>
                      {hasReports && !isSelected && (
                        <span className="text-[8px] font-bold text-primary mt-[-2px]">{dayHours}h</span>
                      )}
                      {hasReports && isSelected && (
                        <span className="text-[8px] font-bold text-primary-foreground/70 mt-[-2px]">{dayHours}h</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected date reports */}
            {selectedDate && (
              <div className="space-y-1.5">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground px-1">
                  {format(selectedDate, 'd MMMM yyyy', { locale: sv })}
                </h3>
                {selectedDateReports.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground">Inga rapporter denna dag</p>
                  </div>
                ) : (
                  selectedDateReports.map(report => (
                    <ReportCard key={report.id} report={report} />
                  ))
                )}
              </div>
            )}
          </div>
        ) : (
          /* List view */
          <div className="space-y-3">
            {/* Period filter: week / month toggle */}
            <div className="flex bg-muted rounded-xl p-0.5 gap-0.5">
              <button
                onClick={() => setListFilter('week')}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  listFilter === 'week' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                Vecka
              </button>
              <button
                onClick={() => setListFilter('month')}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  listFilter === 'month' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                Månad
              </button>
            </div>

            {/* Period navigation */}
            <div className="flex items-center justify-between">
              <button onClick={() => navigateListPeriod(-1)} className="p-2 rounded-xl active:scale-95 transition-all">
                <ChevronLeft className="w-5 h-5 text-foreground" />
              </button>
              <div className="text-center">
                <p className="text-sm font-bold text-foreground capitalize">{listPeriodLabel}</p>
                <p className="text-[11px] text-muted-foreground">{filteredListReports.length} rapporter · {filteredTotalHours}h</p>
              </div>
              <button onClick={() => navigateListPeriod(1)} className="p-2 rounded-xl active:scale-95 transition-all">
                <ChevronRight className="w-5 h-5 text-foreground" />
              </button>
            </div>

            {/* Grouped reports */}
            {groupedListReports.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-2">
                  <Clock className="w-6 h-6 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-medium text-foreground/60">Inga rapporter denna period</p>
              </div>
            ) : (
              groupedListReports.map(({ dateKey, reports: dateReports }) => {
                const dayTotal = dateReports.reduce((s, r) => s + r.hours_worked, 0);
                const hasReports = dateReports.length > 0;
                return (
                  <div key={dateKey}>
                    <div className="flex items-center justify-between px-1 mb-1.5">
                      <h3 className={cn(
                        "text-[11px] font-bold uppercase tracking-widest",
                        hasReports ? "text-muted-foreground" : "text-muted-foreground/40"
                      )}>
                        {format(parseISO(dateKey), 'EEEE d MMM', { locale: sv })}
                      </h3>
                      {hasReports && <span className="text-[11px] font-bold text-primary">{dayTotal}h</span>}
                    </div>
                    {hasReports && (
                      <div className="space-y-1.5">
                        {dateReports.map(report => (
                          <ReportCard key={report.id} report={report} showDate={false} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const ReportCard = ({ report, showDate = true }: { report: MobileTimeReport; showDate?: boolean }) => (
  <div className="rounded-xl border border-border/40 bg-card p-3 shadow-sm">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm truncate text-foreground">
          {report.bookings?.client || 'Okänt jobb'}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {showDate && format(parseISO(report.report_date), 'd MMM yyyy', { locale: sv })}
          {showDate && report.start_time && report.end_time && ' · '}
          {report.start_time && report.end_time && (
            <span>{report.start_time.slice(0, 5)}–{report.end_time.slice(0, 5)}</span>
          )}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-extrabold text-sm tabular-nums">{report.hours_worked}h</p>
        {report.overtime_hours > 0 && (
          <p className="text-[10px] text-primary font-bold">+{report.overtime_hours}h öt</p>
        )}
      </div>
    </div>
    {report.description && (
      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{report.description}</p>
    )}
  </div>
);

export default MobileTimeHistory;
