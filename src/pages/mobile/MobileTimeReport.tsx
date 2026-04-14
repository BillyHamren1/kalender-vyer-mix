import { useState, useEffect } from 'react';
import { mobileApi, MobileBooking, MobileTimeReport as MobileTimeReportType } from '@/services/mobileApiService';
import { useGeofencing, ActiveTimer } from '@/hooks/useGeofencing';
import { useMobileBookings, useInvalidateMobileData } from '@/hooks/useMobileData';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { format, parseISO, differenceInSeconds } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Clock, Square, Loader2, Check, Send, Building2, Plus, ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { MobileHeroHeader } from '@/components/mobile-app/MobileHeader';
import { formatHoursMinutes } from '@/utils/formatHours';

const MobileTimeReport = () => {
  const { staff } = useMobileAuth();
  const { data: bookings = [], isLoading } = useMobileBookings();
  const { invalidateTimeReports } = useInvalidateMobileData();
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [timeReports, setTimeReports] = useState<MobileTimeReportType[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);

  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [breakTime, setBreakTime] = useState('');
  const [overtime, setOvertime] = useState('');
  const [description, setDescription] = useState('');

  const { activeTimers, stopTimer, orgLocations, startTimer } = useGeofencing(bookings, staff?.id);

  const fetchReports = async () => {
    try {
      const res = await mobileApi.getTimeReports();
      setTimeReports(res.time_reports || []);
    } catch (err) {
      console.warn('Failed to fetch time reports:', err);
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const calculateHours = () => {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let total = (eh + em / 60) - (sh + sm / 60);
    if (total < 0) total += 24;
    total -= parseFloat(breakTime || '0');
    return Math.max(0, Math.round(total * 100) / 100);
  };

  const isNightShift = (() => {
    if (!startTime || !endTime) return false;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return (eh + em / 60) < (sh + sm / 60);
  })();

  // Build project-aware job options for the form
  const jobOptions = (() => {
    const options: { value: string; label: string; isProject?: boolean; largeProjectId?: string }[] = [];
    const seenProjectIds = new Set<string>();

    // Add large projects (deduplicated)
    for (const b of bookings) {
      if (b.large_project_id && b.large_project_name && !seenProjectIds.has(b.large_project_id)) {
        seenProjectIds.add(b.large_project_id);
        options.push({
          value: `project-${b.large_project_id}`,
          label: `📁 ${b.large_project_name}`,
          isProject: true,
          largeProjectId: b.large_project_id,
        });
      }
    }

    // Add standalone bookings (not part of a large project)
    for (const b of bookings) {
      if (!b.large_project_id) {
        options.push({
          value: b.id,
          label: `${b.client}${b.booking_number ? ` #${b.booking_number}` : ''}`,
        });
      }
    }

    return options;
  })();

  const handleSubmit = async () => {
    if (!selectedBookingId) {
      toast.error('Välj ett jobb');
      return;
    }

    const selectedOption = jobOptions.find(o => o.value === selectedBookingId);

    setIsSaving(true);
    try {
      await mobileApi.createTimeReport({
        booking_id: selectedBookingId,
        report_date: reportDate,
        start_time: startTime,
        end_time: endTime,
        hours_worked: calculateHours(),
        overtime_hours: parseFloat(overtime || '0'),
        break_time: parseFloat(breakTime || '0'),
        description: description || undefined,
        large_project_id: selectedOption?.largeProjectId,
      });
      toast.success('Tidrapport skapad!');
      invalidateTimeReports();
      setSelectedBookingId('');
      setDescription('');
      setStartTime('');
      setEndTime('');
      setBreakTime('');
      setOvertime('');
      setShowForm(false);
      fetchReports();
    } catch (err: any) {
      toast.error(err.message || 'Kunde inte skapa tidrapport');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-card">
        <MobileHeroHeader eyebrow="TIDRAPPORT" title="Tidrapportering" subtitle="Rapportera arbetstid" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // Group reports by date
  const reportsByDate = timeReports.reduce<Record<string, MobileTimeReportType[]>>((acc, r) => {
    const date = r.report_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(r);
    return acc;
  }, {});

  const sortedDates = Object.keys(reportsByDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="flex flex-col min-h-screen bg-card pb-24 overflow-x-hidden">
      <MobileHeroHeader eyebrow="TIDRAPPORT" title="Tidrapportering" subtitle="Rapportera arbetstid" />

      <div className="flex-1 px-5 pt-5 pb-28 space-y-4 w-full min-w-0 max-w-full box-border">
        {/* Active timers */}
        {activeTimers.size > 0 && (
          <div className="space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-primary">Aktiva timers</h2>
            {Array.from(activeTimers.entries()).map(([key, timer]) => (
              <ActiveTimerCard
                key={key}
                timer={timer}
                isLocation={!!timer.locationId}
                onStop={async () => {
                  if (timer.locationId) {
                    const isLocationProject = bookings.some(b => b.id === key);
                    if (isLocationProject) {
                      const stopTime = new Date();
                      const startTimeDate = parseISO(timer.startTime);
                      let totalHours = (stopTime.getTime() - startTimeDate.getTime()) / (1000 * 60 * 60);
                      if (totalHours < 0) totalHours += 24;
                      const breakDeduction = totalHours > 5 ? 0.5 : 0;
                      const hoursWorked = Math.max(0, Number((totalHours - breakDeduction).toFixed(2)));
                      stopTimer(key);
                      try {
                        await mobileApi.createTimeReport({
                          booking_id: key,
                          report_date: format(new Date(), 'yyyy-MM-dd'),
                          start_time: format(startTimeDate, 'HH:mm'),
                          end_time: format(stopTime, 'HH:mm'),
                          hours_worked: hoursWorked,
                          break_time: breakDeduction,
                          description: `Timer: ${timer.locationName || timer.client}`,
                        });
                        toast.success(`Tidrapport sparad: ${hoursWorked}h`);
                        fetchReports();
                      } catch (err: any) {
                        toast.error(err.message || 'Kunde inte spara tidrapport');
                      }
                    } else {
                      stopTimer(key);
                      toast.success(`Tid på ${timer.locationName || timer.client} stoppad`);
                    }
                  } else {
                    const stopTime = new Date();
                    const startTimeDate = parseISO(timer.startTime);
                    let totalHours = (stopTime.getTime() - startTimeDate.getTime()) / (1000 * 60 * 60);
                    if (totalHours < 0) totalHours += 24;
                    const breakDeduction = totalHours > 5 ? 0.5 : 0;
                    const hoursWorked = Math.max(0, Number((totalHours - breakDeduction).toFixed(2)));
                    stopTimer(key);
                    try {
                      await mobileApi.createTimeReport({
                        booking_id: key,
                        report_date: format(new Date(), 'yyyy-MM-dd'),
                        start_time: format(startTimeDate, 'HH:mm'),
                        end_time: format(stopTime, 'HH:mm'),
                        hours_worked: hoursWorked,
                        break_time: breakDeduction,
                        description: `Timer: ${timer.client}${timer.establishmentTaskTitle ? ` — ${timer.establishmentTaskTitle}` : ''}`,
                        establishment_task_id: timer.establishmentTaskId,
                        large_project_id: timer.largeProjectId,
                      });
                      toast.success(`Tidrapport sparad: ${hoursWorked}h`);
                      fetchReports();
                    } catch (err: any) {
                      toast.error(err.message || 'Kunde inte spara tidrapport');
                    }
                  }
                }}
              />
            ))}
          </div>
        )}

        {/* Fixed location quick-start buttons */}
        {orgLocations.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Fasta platser</h2>
            <div className="grid grid-cols-2 gap-2">
              {orgLocations.map(loc => {
                const locKey = `location-${loc.id}`;
                const isActive = activeTimers.has(locKey);
                return (
                  <button
                    key={loc.id}
                    onClick={() => {
                      if (isActive) {
                        stopTimer(locKey);
                        toast.success(`Tid på ${loc.name} stoppad`);
                      } else if (activeTimers.size > 0) {
                        toast.error('Du har redan en aktiv timer. Stoppa den först.');
                      } else {
                        startTimer(locKey, loc.name, false, undefined, undefined, loc.id, loc.name);
                        toast.success(`Timer startad: ${loc.name}`);
                      }
                    }}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${
                      isActive
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border/60 bg-muted/30 hover:bg-muted/50'
                    }`}
                  >
                    <Building2 className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{loc.name}</p>
                      {isActive && <p className="text-[10px] text-primary">● Aktiv</p>}
                    </div>
                    {isActive && <Square className="w-3.5 h-3.5 text-destructive" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* New report button */}
        {!showForm && (
          <Button
            onClick={() => setShowForm(true)}
            className="w-full rounded-xl h-11 gap-2 text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Ny tidrapport
          </Button>
        )}

        {/* Report form (collapsible) */}
        {showForm && (
          <div className="rounded-2xl border border-border/80 bg-card px-5 py-6 space-y-6 shadow-sm w-full min-w-0 overflow-hidden box-border">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[15px] text-foreground">Ny tidrapport</h2>
              <button onClick={() => setShowForm(false)} className="text-xs text-muted-foreground hover:text-foreground">
                Avbryt
              </button>
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Jobb</Label>
              <Select value={selectedBookingId} onValueChange={setSelectedBookingId}>
                <SelectTrigger className="h-12 rounded-xl text-sm bg-muted/40 border-border">
                  <SelectValue placeholder="Välj jobb eller projekt..." />
                </SelectTrigger>
                <SelectContent>
                  {jobOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Datum</Label>
              <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="h-12 rounded-xl text-sm bg-muted/40 border-border text-center min-w-0 w-full max-w-full" style={{ maxWidth: '100%' }} />
            </div>

            <div className="h-px bg-border/50" />

            <div className="flex gap-3 w-full">
              <div className="flex-1 min-w-0 space-y-2">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Start</Label>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-12 w-full rounded-xl text-sm bg-muted/40 border border-border text-center px-2 box-border" style={{ minWidth: 0, maxWidth: '100%' }} />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Slut</Label>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-12 w-full rounded-xl text-sm bg-muted/40 border border-border text-center px-2 box-border" style={{ minWidth: 0, maxWidth: '100%' }} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Rast</Label>
              <div className="grid grid-cols-4 gap-1.5 min-w-0">
                {[
                  { label: 'Ingen', value: '0' },
                  { label: '30m', value: '0.5' },
                  { label: '45m', value: '0.75' },
                  { label: '60m', value: '1' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setBreakTime(opt.value)}
                    className={`py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      breakTime === opt.value || (!breakTime && opt.value === '0')
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted/60 text-muted-foreground'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Övertid (h)</Label>
              <Input type="number" step="0.5" value={overtime} onChange={e => setOvertime(e.target.value)} className="h-12 rounded-xl text-sm bg-muted/40 border-border min-w-0 w-full" />
            </div>

            <div className="h-px bg-border/50" />

            <div className="space-y-2">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Beskrivning</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Vad gjorde du..."
                className="rounded-xl min-h-[72px] text-sm bg-muted/40 border-border"
              />
            </div>

            {isNightShift && (
              <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs font-medium" style={{ color: 'hsl(var(--warning, 38 92% 50%))' }}>⏰ Nattskift upptäckt – tid beräknas över midnatt</p>
              </div>
            )}
            <div className="flex items-center justify-between pt-3 border-t border-border/40">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-muted-foreground">Totalt:</span>
                <span className="text-lg font-extrabold text-foreground tabular-nums">{calculateHours()}h</span>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={isSaving}
                className="rounded-xl gap-2 h-11 px-6 text-sm font-semibold active:scale-[0.98] transition-all"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Spara
              </Button>
            </div>
          </div>
        )}

        {/* Time reports list */}
        <div className="space-y-4">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Mina tidrapporter</h2>

          {loadingReports ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : sortedDates.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Inga tidrapporter ännu</p>
            </div>
          ) : (
            sortedDates.map(date => {
              const reports = reportsByDate[date];
              const totalHours = reports.reduce((sum, r) => sum + (r.hours_worked || 0), 0);
              const isToday = date === format(new Date(), 'yyyy-MM-dd');
              const dateLabel = isToday
                ? 'Idag'
                : format(parseISO(date), 'd MMM yyyy', { locale: sv });

              return (
                <div key={date} className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-semibold text-foreground">{dateLabel}</span>
                    <span className="text-xs text-muted-foreground">{formatHoursMinutes(totalHours)}</span>
                  </div>
                  {reports.map(r => (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-muted/20"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {r.large_project_name || r.bookings?.client || 'Okänt jobb'}
                        </p>
                        {r.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{r.description}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {r.start_time && r.end_time
                            ? `${r.start_time.slice(0, 5)} – ${r.end_time.slice(0, 5)}`
                            : ''}
                          {r.break_time > 0 ? ` · ${r.break_time}h rast` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-foreground tabular-nums">
                          {formatHoursMinutes(r.hours_worked)}
                        </p>
                        {r.overtime_hours > 0 && (
                          <p className="text-[10px] text-muted-foreground">+{r.overtime_hours}h öt</p>
                        )}
                        {r.approved && (
                          <Check className="w-3.5 h-3.5 text-primary inline-block" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

const ActiveTimerCard = ({ timer, onStop, isLocation }: { timer: ActiveTimer; onStop: () => void; isLocation?: boolean }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(differenceInSeconds(new Date(), parseISO(timer.startTime)));
    }, 1000);
    return () => clearInterval(interval);
  }, [timer.startTime]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;

  return (
    <div className={`flex items-center gap-3 p-3.5 rounded-2xl border ${isLocation ? 'border-primary/20 bg-primary/5' : 'border-primary/20 bg-primary/5'}`}>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate text-foreground flex items-center gap-1.5">
          {isLocation && <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />}
          {timer.locationName || timer.client}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Startad {format(parseISO(timer.startTime), 'HH:mm')}
          {timer.isAutoStarted && ' (auto)'}
        </p>
      </div>
      <div className="font-mono font-extrabold text-base tabular-nums text-primary">
        {h.toString().padStart(2, '0')}:{m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}
      </div>
      <Button size="sm" variant="destructive" className="rounded-xl h-9 gap-1 text-xs font-semibold" onClick={onStop}>
        <Square className="w-3 h-3" />
        Stopp
      </Button>
    </div>
  );
};

export default MobileTimeReport;
