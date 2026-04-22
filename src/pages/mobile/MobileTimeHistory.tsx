import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileTimeReport, MobileTravelLog, mobileApi } from '@/services/mobileApiService';
import { useMobileTimeReports, useMobileTravelLogs, useInvalidateMobileData } from '@/hooks/useMobileData';
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, getDay, isSameDay, addMonths, subMonths, addWeeks, subWeeks, isWithinInterval } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { ArrowLeft, Calendar, List, ChevronLeft, ChevronRight, Loader2, Download, Check, Clock4, Pencil, Trash2 } from 'lucide-react';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { cn } from '@/lib/utils';
import { formatHoursMinutes } from '@/utils/formatHours';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/i18n/LanguageContext';

type ViewMode = 'calendar' | 'list';
type ListFilter = 'week' | 'month';

const MobileTimeHistory = () => {
  const { staff } = useMobileAuth();
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const dfLocale = locale === 'sv' ? sv : enUS;
  const { data: reports = [], isLoading } = useMobileTimeReports();
  const { data: travelLogs = [], isLoading: isLoadingTravel } = useMobileTravelLogs();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [listFilter] = useState<ListFilter>('month');
  const [listPeriod, setListPeriod] = useState(new Date());

  const totalHours = reports.reduce((sum, r) => sum + r.hours_worked, 0);

  const reportsByDate = useMemo(() => {
    const map = new Map<string, MobileTimeReport[]>();
    reports.forEach(r => {
      const key = r.report_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return map;
  }, [reports]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = (getDay(monthStart) + 6) % 7;

  const selectedDateReports = selectedDate
    ? reports.filter(r => isSameDay(parseISO(r.report_date), selectedDate))
    : [];

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

  const filteredTravelLogs = useMemo(() => {
    return travelLogs.filter(l => {
      if (!l.end_time) return false;
      const d = parseISO(l.report_date);
      return isWithinInterval(d, listInterval);
    });
  }, [travelLogs, listInterval]);

  const groupedListReports = useMemo(() => {
    const days = eachDayOfInterval(listInterval);
    const reportMap = new Map<string, MobileTimeReport[]>();
    filteredListReports.forEach(r => {
      const key = r.report_date;
      if (!reportMap.has(key)) reportMap.set(key, []);
      reportMap.get(key)!.push(r);
    });
    const travelMap = new Map<string, MobileTravelLog[]>();
    filteredTravelLogs.forEach(l => {
      const key = l.report_date;
      if (!travelMap.has(key)) travelMap.set(key, []);
      travelMap.get(key)!.push(l);
    });
    return days.map(day => {
      const key = format(day, 'yyyy-MM-dd');
      return { dateKey: key, day, reports: reportMap.get(key) || [], travels: travelMap.get(key) || [] };
    });
  }, [filteredListReports, filteredTravelLogs, listInterval]);

  const filteredTotalHours = filteredListReports.reduce((s, r) => s + r.hours_worked, 0);
  const filteredTravelHours = filteredTravelLogs.reduce((s, l) => s + l.hours_worked, 0);

  const listPeriodLabel = listFilter === 'week'
    ? `${format(listInterval.start, 'd MMM', { locale: dfLocale })} – ${format(listInterval.end, 'd MMM yyyy', { locale: dfLocale })}`
    : format(listPeriod, 'MMMM yyyy', { locale: dfLocale });

  const navigateListPeriod = (dir: 1 | -1) => {
    setListPeriod(p => listFilter === 'week'
      ? (dir === 1 ? addWeeks(p, 1) : subWeeks(p, 1))
      : (dir === 1 ? addMonths(p, 1) : subMonths(p, 1))
    );
  };

  const exportPdf = () => {
    const staffName = staff?.name || 'Staff';
    const rows = groupedListReports.map(({ dateKey, reports: dr }) => {
      const d = parseISO(dateKey);
      const dayNum = format(d, 'd');
      const dayName = format(d, 'EEE', { locale: dfLocale });
      if (dr.length === 0) {
        return `<tr class="empty"><td>${dayNum}</td><td>${dayName}</td><td>–</td><td>–</td><td>–</td><td>–</td></tr>`;
      }
      return dr.map((r, i) => {
        const client = r.bookings?.client || t('history.unknown');
        return `<tr class="report">
          <td>${i === 0 ? dayNum : ''}</td>
          <td>${i === 0 ? dayName : ''}</td>
          <td>${client}</td>
          <td>${r.start_time?.slice(0, 5) || '–'}</td>
          <td>${r.end_time?.slice(0, 5) || '–'}</td>
          <td style="font-weight:700">${r.hours_worked}</td>
        </tr>`;
      }).join('');
    }).join('');

    const totalOt = filteredListReports.reduce((s, r) => s + (r.overtime_hours || 0), 0);
    const otSuffix = totalOt > 0 ? t('history.totalOvertime', { n: totalOt.toFixed(0) }) : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${t('history.pdfTitle', { name: staffName })}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: -apple-system, system-ui, sans-serif; padding: 32px; color: #1a2a2a; background: #fff; }
      .card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); border: 1px solid #e2e8ea; }
      h1 { font-size: 20px; font-weight: 800; color: #0f3b3d; margin-bottom: 2px; letter-spacing: -0.3px; }
      .meta { font-size: 12px; color: #7a8f90; margin-bottom: 20px; }
      .brand { display: inline-block; background: #279B9E; color: #fff; font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 8px; margin-bottom: 16px; letter-spacing: 0.5px; text-transform: uppercase; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #7a8f90; padding: 8px 10px; border-bottom: 2px solid #d5dfe0; font-weight: 700; }
      td { padding: 8px 10px; border-bottom: 1px solid #eef2f3; vertical-align: top; }
      tr.empty td { color: #c0cccd; }
      tr.report td:first-child, tr.report td:nth-child(2) { color: #0f3b3d; font-weight: 600; }
      th:nth-child(4), th:nth-child(5), th:nth-child(6),
      td:nth-child(4), td:nth-child(5), td:nth-child(6) { text-align: center; }
      th:last-child, td:last-child { text-align: right; }
      td:last-child { font-weight: 700; }
      .total td { border-top: 2px solid #279B9E; border-bottom: none; font-weight: 800; font-size: 14px; color: #0f3b3d; padding-top: 12px; }
      .total td:last-child { color: #279B9E; font-size: 16px; }
      .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #aab8b9; }
      @media print { body { background: #fff; padding: 12px; } .card { box-shadow: none; border: none; padding: 0; } }
    </style></head><body>
    <div class="card">
      <div class="brand">EventFlow</div>
      <h1>${t('history.pdfTitle', { name: staffName })}</h1>
      <p class="meta">${listPeriodLabel} · ${filteredListReports.length} ${t('history.reports')}</p>
      <table>
        <thead><tr><th>${t('history.colDate')}</th><th></th><th>${t('history.colClient')}</th><th>${t('history.colStart')}</th><th>${t('history.colEnd')}</th><th>${t('history.colHours')}</th></tr></thead>
        <tbody>${rows}
          <tr class="total"><td colspan="5">${t('history.totalRow')}${otSuffix}</td><td>${filteredTotalHours}h</td></tr>
        </tbody>
      </table>
    </div>
    <p class="footer">${t('history.generated')} ${format(new Date(), 'yyyy-MM-dd HH:mm')}</p>
    </body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const weekDays = [t('history.day.mon'), t('history.day.tue'), t('history.day.wed'), t('history.day.thu'), t('history.day.fri'), t('history.day.sat'), t('history.day.sun')];

  return (
    <div className="flex flex-col min-h-screen bg-card pb-24">
      {/* Header */}
      <div className="bg-primary" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="pt-3" />
        <div className="px-4 pb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/m/profile')} className="p-2 -ml-1 rounded-xl active:scale-95 transition-all">
              <ArrowLeft className="w-5 h-5 text-primary-foreground" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-extrabold text-primary-foreground tracking-tight">{t('history.title')}</h1>
              <p className="text-[11px] text-primary-foreground/50 font-medium">
                {t('history.summary', { n: reports.length, hours: formatHoursMinutes(totalHours) })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
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
            {t('history.list')}
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
              viewMode === 'calendar' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <Calendar className="w-4 h-4" />
            {t('history.calendar')}
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
            <div className="flex items-center justify-between px-1">
              <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="p-2 rounded-xl active:scale-95 transition-all">
                <ChevronLeft className="w-5 h-5 text-foreground" />
              </button>
              <h2 className="text-sm font-bold text-foreground capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: dfLocale })}
              </h2>
              <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="p-2 rounded-xl active:scale-95 transition-all">
                <ChevronRight className="w-5 h-5 text-foreground" />
              </button>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-card p-3 shadow-md">
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

            {selectedDate && (
              <div className="space-y-1.5">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground px-1">
                  {format(selectedDate, 'd MMMM yyyy', { locale: dfLocale })}
                </h3>
                {selectedDateReports.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground">{t('history.noReportsThisDay')}</p>
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
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <button onClick={() => navigateListPeriod(-1)} className="p-2 rounded-xl active:scale-95 transition-all">
                <ChevronLeft className="w-5 h-5 text-foreground" />
              </button>
              <div className="text-center">
                <p className="text-sm font-bold text-foreground capitalize">{listPeriodLabel}</p>
                <p className="text-[11px] text-muted-foreground">{t('history.reportsSummary', { n: filteredListReports.length, hours: formatHoursMinutes(filteredTotalHours) })}</p>
              </div>
              <button onClick={() => navigateListPeriod(1)} className="p-2 rounded-xl active:scale-95 transition-all">
                <ChevronRight className="w-5 h-5 text-foreground" />
              </button>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-card shadow-md overflow-hidden">
              <div className="grid grid-cols-[1fr_60px_60px_50px] bg-muted/50 border-b border-border px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('history.colDate')}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">{t('history.colStart')}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">{t('history.colEnd')}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right">{t('history.colHours')}</span>
              </div>
              {groupedListReports.map(({ dateKey, reports: dateReports, travels: dateTravels }, idx) => {
                const hasContent = dateReports.length > 0 || dateTravels.length > 0;
                const isLast = idx === groupedListReports.length - 1;
                const dayNum = format(parseISO(dateKey), 'd');
                const dayName = format(parseISO(dateKey), 'EEE', { locale: dfLocale });
                const allEntries = [
                  ...dateReports.map(r => ({ type: 'report' as const, data: r })),
                  ...dateTravels.map(t => ({ type: 'travel' as const, data: t })),
                ];

                if (!hasContent) {
                  return (
                    <div key={dateKey} className={cn(
                      "grid grid-cols-[1fr_60px_60px_50px] px-3 py-2.5 items-center",
                      !isLast && "border-b border-border/50"
                    )}>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-bold text-foreground/30 tabular-nums w-5 text-right">{dayNum}</span>
                        <span className="text-xs text-muted-foreground/40 capitalize">{dayName}</span>
                      </div>
                      <span className="text-xs text-muted-foreground/30 text-center">–</span>
                      <span className="text-xs text-muted-foreground/30 text-center">–</span>
                      <span className="text-xs text-muted-foreground/30 text-right">–</span>
                    </div>
                  );
                }

                return allEntries.map((entry, rIdx) => {
                  const isLastRow = isLast && rIdx === allEntries.length - 1;
                  const isTravel = entry.type === 'travel';
                  const id = entry.data.id;
                  const hours = entry.data.hours_worked;
                  const startTime = isTravel
                    ? (entry.data as MobileTravelLog).start_time?.slice(11, 16)
                    : (entry.data as MobileTimeReport).start_time?.slice(0, 5);
                  const endTime = isTravel
                    ? (entry.data as MobileTravelLog).end_time?.slice(11, 16)
                    : (entry.data as MobileTimeReport).end_time?.slice(0, 5);
                  const label = isTravel
                    ? t('history.travelEmoji')
                    : ((entry.data as MobileTimeReport).bookings?.client || t('history.unknown'));

                  return (
                    <div key={id} className={cn(
                      "grid grid-cols-[1fr_60px_60px_50px] px-3 py-2.5 items-center",
                      !isLastRow && "border-b border-border/50",
                      isTravel && "bg-primary/5"
                    )}>
                      <div className="min-w-0">
                        {rIdx === 0 && (
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-sm font-bold text-foreground tabular-nums w-5 text-right">{dayNum}</span>
                            <span className="text-xs text-muted-foreground capitalize">{dayName}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <p className={cn("text-xs font-medium truncate", rIdx === 0 ? "mt-0.5 pl-[26px]" : "pl-[26px]", isTravel ? "text-primary" : "text-foreground")}>
                            {label}
                          </p>
                          {!isTravel && (
                            <span className={cn(
                              "shrink-0 w-1.5 h-1.5 rounded-full mt-0.5",
                              (entry.data as MobileTimeReport).approved ? "bg-green-500" : "bg-amber-400"
                            )} />
                          )}
                        </div>
                      </div>
                      <span className="text-xs font-medium text-foreground tabular-nums text-center">
                        {startTime || '–'}
                      </span>
                      <span className="text-xs font-medium text-foreground tabular-nums text-center">
                        {endTime || '–'}
                      </span>
                      <span className={cn("text-sm font-bold tabular-nums text-right", isTravel ? "text-primary" : "text-foreground")}>
                        {formatHoursMinutes(hours)}
                      </span>
                    </div>
                  );
                });
              })}
              <div className="grid grid-cols-[1fr_60px_60px_50px] px-3 py-2.5 border-t border-border bg-muted/50">
                <span className="text-xs font-bold text-foreground uppercase">
                  {t('history.totalRow')} {filteredTravelHours > 0 && <span className="text-primary font-normal">{t('history.inclTravel', { h: formatHoursMinutes(filteredTravelHours) })}</span>}
                </span>
                <span />
                <span />
                <span className="text-sm font-extrabold text-primary tabular-nums text-right">{formatHoursMinutes(filteredTotalHours + filteredTravelHours)}</span>
              </div>
            </div>

            <button
              onClick={exportPdf}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm active:scale-[0.98] transition-all shadow-sm"
            >
              <Download className="w-4 h-4" />
              {t('history.exportPdf')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const ReportCard = ({ report, showDate = true }: { report: MobileTimeReport; showDate?: boolean }) => {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editStart, setEditStart] = useState(report.start_time?.slice(0, 5) || '');
  const [editEnd, setEditEnd] = useState(report.end_time?.slice(0, 5) || '');
  const [editBreak, setEditBreak] = useState(String(report.break_time || 0));
  const [editOvertime, setEditOvertime] = useState(String(report.overtime_hours || 0));
  const [editDesc, setEditDesc] = useState(report.description || '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const { invalidateTimeReports } = useInvalidateMobileData();
  const isApproved = !!report.approved;

  const calculateEditHours = (): number => {
    if (!editStart || !editEnd) return 0;
    const [sh, sm] = editStart.split(':').map(Number);
    const [eh, em] = editEnd.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (endMin <= startMin) return 0;
    const breakMin = Math.max(0, parseInt(editBreak) || 0);
    return Math.round(((endMin - startMin - breakMin) / 60) * 100) / 100;
  };

  const getEditValidationError = (): string | null => {
    if (!editStart) return 'Start time is required';
    if (!editEnd) return 'End time is required';
    const [sh, sm] = editStart.split(':').map(Number);
    const [eh, em] = editEnd.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (endMin <= startMin) return 'End time must be after start time';
    const breakMin = parseInt(editBreak) || 0;
    if (breakMin < 0) return 'Break cannot be negative';
    if (breakMin > 240) return 'Break cannot exceed 240 minutes';
    const hours = calculateEditHours();
    if (hours <= 0) return 'Worked hours after break must be more than 0';
    if (hours > 16) return 'Worked hours cannot exceed 16 hours';
    const ot = parseFloat(editOvertime) || 0;
    if (ot < 0) return 'Overtime cannot be negative';
    
    return null;
  };

  const handleSave = async () => {
    const error = getEditValidationError();
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setSaving(true);
    try {
      const calculatedHours = calculateEditHours();
      await mobileApi.updateTimeReport({
        time_report_id: report.id,
        start_time: editStart || undefined,
        end_time: editEnd || undefined,
        hours_worked: calculatedHours,
        overtime_hours: parseFloat(editOvertime) || 0,
        break_time: parseInt(editBreak) || 0,
        description: editDesc || undefined,
      });
      toast.success('Time report updated');
      setEditing(false);
      invalidateTimeReports();
    } catch (err: any) {
      toast.error(err.message || 'Could not update');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await mobileApi.deleteTimeReport(report.id);
      toast.success('Time report deleted');
      invalidateTimeReports();
    } catch (err: any) {
      toast.error(err.message || 'Could not delete');
    } finally {
      setSaving(false);
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-card p-3 shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-sm truncate text-foreground">
              {report.large_project_name || report.bookings?.client || 'Unknown job'}
            </p>
            {isApproved ? (
              <span className="shrink-0 flex items-center gap-0.5 text-[9px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">
                <Check className="w-2.5 h-2.5" /> Approved
              </span>
            ) : (
              <span className="shrink-0 flex items-center gap-0.5 text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
                <Clock4 className="w-2.5 h-2.5" /> Pending
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {showDate && format(parseISO(report.report_date), 'd MMM yyyy')}
            {showDate && report.start_time && report.end_time && ' · '}
            {report.start_time && report.end_time && (
              <span>{report.start_time.slice(0, 5)}–{report.end_time.slice(0, 5)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {!isApproved && !editing && (
            <>
              <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button onClick={() => setDeleting(true)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </button>
            </>
          )}
          <div className="text-right shrink-0 ml-1">
            <p className="font-extrabold text-sm tabular-nums">{report.hours_worked}h</p>
            {report.overtime_hours > 0 && (
              <p className="text-[10px] text-primary font-bold">+{report.overtime_hours}h OT</p>
            )}
          </div>
        </div>
      </div>
      {report.description && !editing && (
        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{report.description}</p>
      )}

      {deleting && (
        <div className="mt-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-destructive">Delete this report?</p>
          <div className="flex gap-1.5">
            <button onClick={() => setDeleting(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted text-muted-foreground">
              Cancel
            </button>
            <button onClick={handleDelete} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-destructive text-destructive-foreground">
              {saving ? '...' : 'Delete'}
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div className="mt-2 space-y-2 pt-2 border-t border-border/50">
          {validationError && (
            <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-xs font-medium text-destructive">{validationError}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground">Start</label>
              <Input type="time" value={editStart} onChange={e => { setEditStart(e.target.value); setValidationError(null); }} className="h-9 text-sm rounded-lg" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground">End</label>
              <Input type="time" value={editEnd} onChange={e => { setEditEnd(e.target.value); setValidationError(null); }} className="h-9 text-sm rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground">Break (min)</label>
              <Input type="number" min="0" max="240" value={editBreak} onChange={e => { setEditBreak(e.target.value); setValidationError(null); }} className="h-9 text-sm rounded-lg" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground">Overtime (h)</label>
              <Input type="number" step="0.5" min="0" value={editOvertime} onChange={e => { setEditOvertime(e.target.value); setValidationError(null); }} className="h-9 text-sm rounded-lg" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground">Calculated</label>
              <div className="h-9 flex items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground">
                {calculateEditHours() > 0 ? `${calculateEditHours()}h` : '–'}
              </div>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground">Description</label>
            <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="text-sm min-h-[48px] rounded-lg" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setEditing(false); setValidationError(null); }} className="flex-1 py-2 rounded-xl text-xs font-semibold bg-muted text-muted-foreground">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileTimeHistory;
