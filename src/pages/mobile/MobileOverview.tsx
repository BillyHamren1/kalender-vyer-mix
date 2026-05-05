import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, isToday, isTomorrow, addDays, startOfDay } from 'date-fns';
import { sv as svLocale, enUS } from 'date-fns/locale';
import {
  Calendar,
  Users,
  MessageSquare,
  ChevronRight,
  MapPin,
  Clock,
  Briefcase,
  AlertTriangle,
  UserX,
  Activity,
  Filter,
  Wifi,
  WifiOff,
  PlayCircle,
  CircleDot,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/i18n/LanguageContext';
import { mobileApi, getToken, type OverviewCalendarEvent, type OverviewAssignment, type OpsAnomaly, type OpsStaffStatus, type OpsOverviewJob } from '@/services/mobileApiService';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { cn } from '@/lib/utils';
import { extractUTCTime, parsePlannerDate } from '@/utils/dateUtils';

const RANGE_DAYS_BACK = 1;
const RANGE_DAYS_FWD = 14;

type DateMode = 'today' | 'tomorrow' | 'week';
type PhaseFilter = 'all' | 'rig' | 'event' | 'rigdown' | 'anomalies';

const MobileOverview: React.FC = () => {
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const { isAuthenticated, isLoading: authLoading } = useMobileAuth();
  const [dateMode, setDateMode] = useState<DateMode>('today');
  const [phase, setPhase] = useState<PhaseFilter>('all');
  const dateLocale = locale === 'en' ? enUS : svLocale;

  const hasToken = isAuthenticated && !!getToken();

  const range = useMemo(() => {
    const today = startOfDay(new Date());
    const from = format(addDays(today, -RANGE_DAYS_BACK), 'yyyy-MM-dd');
    const to = format(addDays(today, RANGE_DAYS_FWD), 'yyyy-MM-dd');
    return { from, to };
  }, []);

  // === Active date set based on mode ===
  const activeDates = useMemo(() => {
    const today = startOfDay(new Date());
    if (dateMode === 'today') return [format(today, 'yyyy-MM-dd')];
    if (dateMode === 'tomorrow') return [format(addDays(today, 1), 'yyyy-MM-dd')];
    return Array.from({ length: 7 }, (_, i) => format(addDays(today, i), 'yyyy-MM-dd'));
  }, [dateMode]);

  // Primary: unified ops overview
  const opsQ = useQuery({
    queryKey: ['mobile-ops-overview', range.from, range.to],
    queryFn: () => mobileApi.getOpsOverview({ from: range.from, to: range.to, mode: 'week', include_anomalies: true }),
    enabled: hasToken,
    staleTime: 30_000,
  });

  // Legacy fallbacks (only fire if unified call fails)
  const useFallback = opsQ.isError;
  const calendarQ = useQuery({
    queryKey: ['mobile-overview-calendar', range.from, range.to],
    queryFn: () => mobileApi.getOverviewCalendar(range),
    enabled: hasToken && useFallback,
    staleTime: 60_000,
  });
  const assignmentsQ = useQuery({
    queryKey: ['mobile-overview-assignments', range.from, range.to],
    queryFn: () => mobileApi.getOverviewAssignments(range),
    enabled: hasToken && useFallback,
    staleTime: 60_000,
  });
  const threadsQ = useQuery({
    queryKey: ['mobile-overview-threads'],
    queryFn: () => mobileApi.getOverviewThreads(),
    enabled: hasToken && useFallback,
    staleTime: 30_000,
  });

  // Unified data sources (prefer ops payload, fall back to legacy)
  const opsData = opsQ.data;
  const allEvents: OverviewCalendarEvent[] = useMemo(() => {
    if (opsData?.jobs) {
      return opsData.jobs.map(j => ({
        id: j.id,
        title: j.title,
        event_type: j.phase,
        start_time: j.start_time,
        end_time: j.end_time,
        source_date: j.date,
        resource_id: '',
        booking_id: j.booking_id,
        booking_number: j.booking_number,
        delivery_address: j.address,
      }) as OverviewCalendarEvent);
    }
    return calendarQ.data?.events ?? [];
  }, [opsData, calendarQ.data]);

  const jobsById = useMemo(() => {
    const m = new Map<string, OpsOverviewJob>();
    for (const j of opsData?.jobs ?? []) m.set(j.id, j);
    return m;
  }, [opsData]);

  const allAssignments: OverviewAssignment[] = opsData?.assignments ?? assignmentsQ.data?.assignments ?? [];
  const allThreads = opsData?.messageThreads ?? threadsQ.data?.threads ?? [];

  // === Filter helpers ===
  const eventsInRange = useMemo<OverviewCalendarEvent[]>(() => {
    return allEvents.filter(e => activeDates.includes(e.source_date));
  }, [allEvents, activeDates]);

  const assignmentsInRange = useMemo<OverviewAssignment[]>(() => {
    return allAssignments.filter(a => activeDates.includes(a.assignment_date));
  }, [allAssignments, activeDates]);

  // Group: bookingId+date → assignments[]
  const staffByBookingDate = useMemo(() => {
    const map = new Map<string, OverviewAssignment[]>();
    for (const a of assignmentsInRange) {
      const key = `${a.booking_id}|${a.assignment_date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [assignmentsInRange]);

  // === Anomalies (computed from available data) ===
  const anomalies = useMemo(() => {
    const items: Array<{ kind: string; label: string; bookingId?: string | null; date: string; detail: string }> = [];
    // 1) Jobb utan bemanning
    for (const ev of eventsInRange) {
      if (!ev.booking_id) continue;
      const key = `${ev.booking_id}|${ev.source_date}`;
      if (!staffByBookingDate.has(key)) {
        items.push({
          kind: 'unstaffed',
          label: t('overview.anomaly.unstaffed'),
          bookingId: ev.booking_id,
          date: ev.source_date,
          detail: `${ev.title} · ${(ev.event_type ?? '—').toUpperCase()}`,
        });
      }
    }
    // 2) Bemanning utan jobb i kalender (workday utan kalenderpost)
    const eventKeys = new Set(eventsInRange.filter(e => e.booking_id).map(e => `${e.booking_id}|${e.source_date}`));
    const seen = new Set<string>();
    for (const a of assignmentsInRange) {
      const key = `${a.booking_id}|${a.assignment_date}`;
      if (seen.has(key) || eventKeys.has(key)) continue;
      seen.add(key);
      items.push({
        kind: 'orphan_assignment',
        label: t('overview.anomaly.orphanAssignment'),
        bookingId: a.booking_id,
        date: a.assignment_date,
        detail: a.client ?? a.booking_title ?? a.booking_number ?? '—',
      });
    }
    return items;
  }, [eventsInRange, assignmentsInRange, staffByBookingDate, t]);

  // === KPI ===
  const kpi = useMemo(() => {
    const jobs = eventsInRange.length;
    const distinctStaff = new Set(assignmentsInRange.map(a => a.staff_id)).size;
    const unstaffedJobs = anomalies.filter(a => a.kind === 'unstaffed').length;
    const phaseCount = (p: string) => eventsInRange.filter(e => e.event_type === p).length;
    return {
      jobs,
      distinctStaff,
      unstaffedJobs,
      anomaliesTotal: anomalies.length,
      rig: phaseCount('rig'),
      event: phaseCount('event'),
      rigdown: phaseCount('rigdown'),
    };
  }, [eventsInRange, assignmentsInRange, anomalies]);

  // === Filtered events for "Dagens jobb" section ===
  const filteredEvents = useMemo(() => {
    if (phase === 'all' || phase === 'anomalies') return eventsInRange;
    return eventsInRange.filter(e => e.event_type === phase);
  }, [eventsInRange, phase]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, OverviewCalendarEvent[]>();
    for (const e of filteredEvents) {
      if (!map.has(e.source_date)) map.set(e.source_date, []);
      map.get(e.source_date)!.push(e);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.start_time.localeCompare(b.start_time));
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredEvents]);

  // === Personalöversikt ===
  const staffByDay = useMemo(() => {
    const byDate = new Map<string, OverviewAssignment[]>();
    for (const a of assignmentsInRange) {
      if (!byDate.has(a.assignment_date)) byDate.set(a.assignment_date, []);
      byDate.get(a.assignment_date)!.push(a);
    }
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [assignmentsInRange]);

  const formatDay = (iso: string) => {
    const d = parsePlannerDate(iso);
    if (!d) return iso;
    if (isToday(d)) return t('jobs.today');
    if (isTomorrow(d)) return t('jobs.tomorrow');
    return format(d, 'EEE d MMM', { locale: dateLocale });
  };

  const formatTimeRange = (start: string, end: string) =>
    `${extractUTCTime(start)}–${extractUTCTime(end)}`;

  const eventTypeColor = (type: string | null) => {
    switch (type) {
      case 'rig': return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
      case 'event': return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
      case 'rigdown': return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const roleBadge = (role: string) => {
    const r = role?.toLowerCase() ?? '';
    if (r.includes('project') || r === 'pl') return { label: 'PL', cls: 'bg-primary/15 text-primary border-primary/30' };
    if (r.includes('field')) return { label: 'FÄLT', cls: 'bg-secondary text-secondary-foreground border-border' };
    return { label: role.toUpperCase().slice(0, 4), cls: 'bg-muted text-muted-foreground border-border' };
  };

  // Compact status badge component
  type BadgeTone = 'planned' | 'onsite' | 'missing_workday' | 'active' | 'unstaffed' | 'signal_lost' | 'unplanned';
  const statusBadge = (tone: BadgeTone): { label: string; cls: string; icon?: React.ElementType } => {
    switch (tone) {
      case 'planned': return { label: 'Planerad', cls: 'bg-muted text-foreground border-border', icon: CircleDot };
      case 'onsite': return { label: 'På plats', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30', icon: MapPin };
      case 'missing_workday': return { label: 'Saknar arbetsdag', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30', icon: AlertTriangle };
      case 'active': return { label: 'Pågående', cls: 'bg-primary/15 text-primary border-primary/30', icon: PlayCircle };
      case 'unstaffed': return { label: 'Obemannad', cls: 'bg-destructive/15 text-destructive border-destructive/40', icon: UserX };
      case 'signal_lost': return { label: 'Signal tappad', cls: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30', icon: WifiOff };
      case 'unplanned': return { label: 'Oplanerad aktivitet', cls: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30', icon: Activity };
    }
  };

  // Derive per-staff tone from OpsStaffStatus
  const deriveStaffTone = (s?: OpsStaffStatus): BadgeTone => {
    if (!s) return 'planned';
    if (s.gps_status === 'stale' && s.active_timer) return 'signal_lost';
    if (s.active_timer) return 'active';
    if (s.has_open_workday) return 'onsite';
    if (s.planned_targets.length > 0 && !s.has_open_workday) return 'missing_workday';
    return 'planned';
  };

  // Job tone from staff list
  const deriveJobTone = (staff: OverviewAssignment[], unstaffed: boolean): BadgeTone => {
    if (unstaffed) return 'unstaffed';
    const anyActive = staff.some(s => {
      const st = staffStatusById.get(s.staff_id);
      return st?.active_timer != null;
    });
    if (anyActive) return 'active';
    const allMissing = staff.every(s => !staffStatusById.get(s.staff_id)?.has_open_workday);
    if (allMissing) return 'planned';
    return 'onsite';
  };

  const isLoading = authLoading || !hasToken || (opsQ.isLoading && !useFallback) || (useFallback && (calendarQ.isLoading || assignmentsQ.isLoading));
  const isError = opsQ.isError && useFallback && (calendarQ.isError || assignmentsQ.isError);

  // === Detail dialog (fallback when no dedicated route exists) ===
  type DetailContent =
    | { kind: 'large_project'; id: string; name: string; date?: string; address?: string | null }
    | { kind: 'staff'; staff: OpsStaffStatus }
    | { kind: 'anomaly'; anomaly: OpsAnomaly };
  const [detail, setDetail] = useState<DetailContent | null>(null);

  const staffStatusById = useMemo(() => {
    const m = new Map<string, OpsStaffStatus>();
    for (const s of opsData?.staffStatus ?? []) m.set(s.staff_id, s);
    return m;
  }, [opsData]);

  const openJob = (a: OverviewAssignment | { booking_id?: string | null; target_type?: string; target_id?: string | null; target_name?: string | null; assignment_date?: string; address?: string | null }) => {
    if (a.booking_id) { navigate(`/m/job/${a.booking_id}`); return; }
    if (a.target_type === 'large_project' && a.target_id) {
      navigate(`/m/project/${a.target_id}`);
      return;
    }
    setDetail({
      kind: 'large_project',
      id: (a.target_id as string) || '',
      name: (a.target_name as string) || '—',
      date: (a as any).assignment_date,
      address: (a as any).address ?? null,
    });
  };

  const openStaff = (staffId: string, name?: string) => {
    const s = staffStatusById.get(staffId);
    if (s) { setDetail({ kind: 'staff', staff: s }); return; }
    // Synthetic minimal status if missing from payload
    setDetail({
      kind: 'staff',
      staff: {
        staff_id: staffId, name: name || '—',
        planned_targets: [],
        has_open_workday: false, active_timer: null,
        latest_known_location: null, gps_status: 'unknown', anomaly_count: 0,
      },
    });
  };

  const openAnomaly = (a: OpsAnomaly) => {
    switch (a.action) {
      case 'staff_job':
        if (a.target_id) { navigate(`/m/job/${a.target_id}`); return; }
        break;
      case 'contact_staff':
      case 'review_workday':
      case 'review_timer':
        if (a.staff_id) { openStaff(a.staff_id); return; }
        break;
    }
    setDetail({ kind: 'anomaly', anomaly: a });
  };

  const dateModes: { key: DateMode; label: string }[] = [
    { key: 'today', label: t('jobs.today') },
    { key: 'tomorrow', label: t('jobs.tomorrow') },
    { key: 'week', label: t('overview.range.week') },
  ];

  const phaseFilters: { key: PhaseFilter; label: string }[] = [
    { key: 'all', label: t('overview.filter.all') },
    { key: 'rig', label: 'Rig' },
    { key: 'event', label: 'Event' },
    { key: 'rigdown', label: 'Rigdown' },
    { key: 'anomalies', label: t('overview.filter.anomalies') },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-5 pt-6 pb-3">
        <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
          {t('overview.subtitle')}
        </p>
        <h1 className="text-2xl font-bold mt-1">{t('overview.title')}</h1>
      </header>

      {/* Sticky filter bar */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/40 pb-2 pt-1">
        <div className="px-4 flex gap-2 mb-2">
          {dateModes.map(m => (
            <button
              key={m.key}
              onClick={() => setDateMode(m.key)}
              className={cn(
                'flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors',
                dateMode === m.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border/60 active:bg-muted',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="px-4 flex gap-1.5 overflow-x-auto pb-1">
          <Filter className="w-4 h-4 text-muted-foreground self-center shrink-0" />
          {phaseFilters.map(f => (
            <button
              key={f.key}
              onClick={() => setPhase(f.key)}
              className={cn(
                'px-3 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap transition-colors',
                phase === f.key
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-card text-muted-foreground border-border/60',
              )}
            >
              {f.label}
              {f.key === 'anomalies' && kpi.anomaliesTotal > 0 && (
                <span className="ml-1 text-destructive">({kpi.anomaliesTotal})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 grid grid-cols-2 gap-2 mb-3 mt-3">
        <KpiCard icon={Briefcase} label={t('overview.kpi.jobs')} value={kpi.jobs} />
        <KpiCard icon={Users} label={t('overview.kpi.staff')} value={kpi.distinctStaff} />
        <KpiCard
          icon={UserX}
          label={t('overview.kpi.unstaffed')}
          value={kpi.unstaffedJobs}
          tone={kpi.unstaffedJobs > 0 ? 'warn' : 'default'}
        />
        <KpiCard
          icon={AlertTriangle}
          label={t('overview.kpi.anomalies')}
          value={kpi.anomaliesTotal}
          tone={kpi.anomaliesTotal > 0 ? 'warn' : 'default'}
        />
      </div>

      <div className="px-4 flex gap-2 mb-4 text-[11px]">
        <PhaseChip label="Rig" count={kpi.rig} cls="bg-amber-500/10 text-amber-700 dark:text-amber-300" />
        <PhaseChip label="Event" count={kpi.event} cls="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" />
        <PhaseChip label="Rigdown" count={kpi.rigdown} cls="bg-blue-500/10 text-blue-700 dark:text-blue-300" />
      </div>

      {isLoading && <div className="px-4"><ListSkeleton /></div>}
      {isError && <ErrorState text={t('overview.error')} />}

      {!isLoading && !isError && (
        <div className="px-4 space-y-6">
          {/* === Section 1: Avvikelser (alltid överst) === */}
          <Section title={t('overview.section.anomalies')} icon={AlertTriangle}>
            {(() => {
              const opsAnomalies = opsData?.anomalies ?? [];
              if (opsAnomalies.length > 0) {
                return (
                  <div className="space-y-2">
                    {opsAnomalies.map((a, i) => (
                      <button
                        key={`${a.type}-${i}`}
                        onClick={() => openAnomaly(a)}
                        className="w-full flex items-start gap-3 p-3 rounded-xl bg-card border border-destructive/30 active:scale-[0.99] transition-transform text-left"
                      >
                        <AlertTriangle className={cn('w-5 h-5 shrink-0 mt-0.5', a.severity === 'high' ? 'text-destructive' : a.severity === 'medium' ? 'text-amber-500' : 'text-muted-foreground')} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-destructive">{a.type.replace(/_/g, ' ').toUpperCase()}</div>
                          <div className="text-sm font-medium truncate">{a.label}</div>
                          {a.date && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {format(parseISO(a.date), 'd MMM', { locale: dateLocale })}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                      </button>
                    ))}
                  </div>
                );
              }
              if (anomalies.length === 0) return <EmptyState text={t('overview.empty.anomalies')} />;
              return (
                <div className="space-y-2">
                  {anomalies.map((a, i) => (
                    <button
                      key={`${a.kind}-${i}`}
                      onClick={() => a.bookingId ? navigate(`/m/job/${a.bookingId}`) : setDetail({ kind: 'anomaly', anomaly: { type: a.kind, severity: 'medium', staff_id: null, target_id: a.bookingId ?? null, label: a.label, action: null, date: a.date } })}
                      className="w-full flex items-start gap-3 p-3 rounded-xl bg-card border border-destructive/30 active:scale-[0.99] transition-transform text-left"
                    >
                      <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-destructive">{a.label}</div>
                        <div className="text-sm font-medium truncate">{a.detail}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {format(parseISO(a.date), 'd MMM', { locale: dateLocale })}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                    </button>
                  ))}
                </div>
              );
            })()}
          </Section>

          {/* === Section 2: Dagens jobb === */}
          {phase !== 'anomalies' && (
            <Section title={t('overview.section.jobs')} icon={Briefcase}>
              {eventsByDay.length === 0 ? (
                <EmptyState text={t('overview.empty.calendar')} />
              ) : (
                eventsByDay.map(([day, events]) => (
                  <div key={day} className="space-y-2">
                    <DayHeader label={formatDay(day)} sub={format(parseISO(day), 'd MMM yyyy', { locale: dateLocale })} />
                    {events.map(ev => {
                      const staff = ev.booking_id ? staffByBookingDate.get(`${ev.booking_id}|${ev.source_date}`) ?? [] : [];
                      const unstaffed = !!ev.booking_id && staff.length === 0;
                      const job = jobsById.get(ev.id);
                      const isLp = job?.target_type === 'large_project';
                      const tone = deriveJobTone(staff, unstaffed);
                      const sb = statusBadge(tone);
                      const SbIcon = sb.icon;
                      return (
                        <div
                          key={ev.id}
                          className="rounded-xl bg-card border border-border/60 overflow-hidden"
                        >
                          <button
                            onClick={() => {
                              if (ev.booking_id) navigate(`/m/job/${ev.booking_id}`);
                              else if (job && isLp && job.target_id) navigate(`/m/project/${job.target_id}`);
                              else setDetail({ kind: 'large_project', id: ev.id, name: ev.title, date: ev.source_date, address: ev.delivery_address });
                            }}
                            className="w-full flex items-start gap-3 p-3 active:scale-[0.99] transition-transform text-left"
                          >
                            <div className={cn('px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0', eventTypeColor(ev.event_type))}>
                              {(ev.event_type ?? '—').toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm truncate">{ev.title}</div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 flex-wrap">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span>{formatTimeRange(ev.start_time, ev.end_time)}</span>
                                {ev.delivery_address && (
                                  <>
                                    <span>·</span>
                                    <MapPin className="w-3 h-3 shrink-0" />
                                    <span className="truncate max-w-[160px]">{ev.delivery_address}</span>
                                  </>
                                )}
                              </div>
                              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border', sb.cls)}>
                                  {SbIcon && <SbIcon className="w-3 h-3" />}
                                  {sb.label}
                                </span>
                                {!unstaffed && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {staff.length} {t('overview.staffStatus.planned')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </Section>
          )}

          {/* === Section 3: Personalöversikt (kort, inte chips) === */}
          {phase !== 'anomalies' && (
            <Section title={t('overview.section.staff')} icon={Users}>
              {staffByDay.length === 0 ? (
                <EmptyState text={t('overview.empty.staffing')} />
              ) : (
                staffByDay.map(([date, staff]) => {
                  // Dedupe per staff_id för dagen — visa varje person en gång
                  const seen = new Set<string>();
                  const uniq = staff.filter(s => {
                    if (seen.has(s.staff_id)) return false;
                    seen.add(s.staff_id);
                    return true;
                  });
                  return (
                    <div key={date} className="space-y-2">
                      <DayHeader label={formatDay(date)} sub={format(parseISO(date), 'd MMM yyyy', { locale: dateLocale })} />
                      <div className="space-y-2">
                        {uniq.map(s => {
                          const rb = roleBadge(s.role);
                          const status = staffStatusById.get(s.staff_id);
                          const tone = deriveStaffTone(status);
                          const sb = statusBadge(tone);
                          const SbIcon = sb.icon;
                          // Count planned targets för denna person (bland alla assignments idag)
                          const plannedCount = staff.filter(x => x.staff_id === s.staff_id).length;
                          const lastSignal = status?.latest_known_location?.updated_at;
                          return (
                            <button
                              key={s.staff_id}
                              onClick={() => openStaff(s.staff_id, s.staff_name)}
                              className="w-full flex items-start gap-3 p-3 rounded-xl bg-card border border-border/60 active:scale-[0.99] transition-transform text-left"
                            >
                              <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold border shrink-0', rb.cls)}>
                                {rb.label}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm truncate">{s.staff_name}</div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 flex-wrap">
                                  <Briefcase className="w-3 h-3 shrink-0" />
                                  <span className="truncate max-w-[180px]">
                                    {plannedCount > 1 ? `${plannedCount} jobb` : (s.client ?? s.booking_title ?? s.booking_number ?? '—')}
                                  </span>
                                  {lastSignal && (
                                    <>
                                      <span>·</span>
                                      {(status?.gps_status === 'live' || status?.gps_status === 'recent') ? <Wifi className="w-3 h-3 shrink-0 text-emerald-600" /> : <WifiOff className="w-3 h-3 shrink-0 text-muted-foreground" />}
                                      <span>{format(parseISO(lastSignal), 'HH:mm')}</span>
                                    </>
                                  )}
                                </div>
                                <div className="mt-1.5 flex items-center gap-1.5">
                                  <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border', sb.cls)}>
                                    {SbIcon && <SbIcon className="w-3 h-3" />}
                                    {sb.label}
                                  </span>
                                  {(status?.anomaly_count ?? 0) > 0 && (
                                    <span className="text-[10px] text-destructive font-bold">⚠ {status?.anomaly_count}</span>
                                  )}
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </Section>
          )}

          {/* === Section 4: Meddelanden === */}
          {phase !== 'anomalies' && (
            <Section title={t('overview.section.messages')} icon={MessageSquare}>
              {(useFallback && threadsQ.isLoading) ? (
                <ListSkeleton />
              ) : (allThreads.length === 0) ? (
                <EmptyState text={t('overview.empty.messages')} />
              ) : (
                <div className="space-y-2">
                  {allThreads.map(thread => (
                    <button
                      key={thread.booking_id}
                      onClick={() => navigate(`/m/job/${thread.booking_id}?tab=chat`)}
                      className="w-full flex items-start gap-3 p-3 rounded-xl bg-card border border-border/60 active:scale-[0.99] transition-transform text-left"
                    >
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary shrink-0">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-sm truncate">
                            {thread.client}
                            {thread.booking_number && (
                              <span className="text-muted-foreground font-normal"> · {thread.booking_number}</span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground shrink-0">
                            {format(parseISO(thread.last_message_at), 'd MMM HH:mm', { locale: dateLocale })}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          <span className="font-medium text-foreground/80">{thread.last_sender_name}:</span>{' '}
                          {thread.last_message_preview}
                        </div>
                      </div>
                      {thread.unread_count > 0 && (
                        <Badge variant="destructive" className="shrink-0 h-5 min-w-[20px] px-1.5 text-[10px]">
                          {thread.unread_count > 99 ? '99+' : thread.unread_count}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </Section>
          )}
        </div>
      )}

      {/* Detail dialog (fallback when no dedicated route exists) */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          {detail?.kind === 'large_project' && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.name}</DialogTitle>
                <DialogDescription>{'Stort projekt'}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                {detail.date && <div><span className="text-muted-foreground">Datum:</span> {detail.date}</div>}
                {detail.address && <div className="flex items-start gap-1"><MapPin className="w-4 h-4 mt-0.5 shrink-0" /><span>{detail.address}</span></div>}
              </div>
              <DialogFooter>
                {detail.id && !detail.id.startsWith('synthetic-') && (
                  <Button onClick={() => { navigate(`/m/project/${detail.id}`); setDetail(null); }}>
                    Öppna projekt
                  </Button>
                )}
                <Button variant="outline" onClick={() => setDetail(null)}>Stäng</Button>
              </DialogFooter>
            </>
          )}

          {detail?.kind === 'staff' && (() => {
            const s = detail.staff;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{s.name || '—'}</DialogTitle>
                  <DialogDescription>{'Personöversikt'}</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    <span>{s.has_open_workday ? 'Arbetsdag pågår' : 'Ingen aktiv arbetsdag'}</span>
                  </div>
                  {s.active_timer && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>Aktiv timer ({s.active_timer.target_type}) sedan {format(parseISO(s.active_timer.started_at), 'HH:mm')}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    <span>GPS: {s.gps_status}{s.latest_known_location ? ` · ${format(parseISO(s.latest_known_location.updated_at), 'HH:mm')}` : ''}</span>
                  </div>
                  {s.planned_targets.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Planerat</div>
                      <ul className="space-y-1">
                        {s.planned_targets.slice(0, 5).map((p, i) => (
                          <li key={i} className="text-xs">
                            {p.date} · {p.target_name ?? '—'}{p.phase ? ` (${p.phase})` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {s.anomaly_count > 0 && (
                    <div className="text-destructive text-xs">⚠ {s.anomaly_count} avvikelser</div>
                  )}
                </div>
                <DialogFooter className="gap-2 flex-wrap">
                  {s.planned_targets[0]?.target_id && s.planned_targets[0].target_type === 'booking' && (
                    <Button onClick={() => { navigate(`/m/job/${s.planned_targets[0].target_id}`); setDetail(null); }}>
                      Öppna jobb
                    </Button>
                  )}
                  {s.planned_targets[0]?.target_id && s.planned_targets[0].target_type === 'large_project' && (
                    <Button onClick={() => { navigate(`/m/project/${s.planned_targets[0].target_id}`); setDetail(null); }}>
                      Öppna projekt
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setDetail(null)}>Stäng</Button>
                </DialogFooter>
              </>
            );
          })()}

          {detail?.kind === 'anomaly' && (() => {
            const a = detail.anomaly;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    {a.label}
                  </DialogTitle>
                  <DialogDescription>{a.type.replace(/_/g, ' ')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-1 text-sm">
                  <div><span className="text-muted-foreground">Allvar:</span> {a.severity}</div>
                  {a.date && <div><span className="text-muted-foreground">Datum:</span> {a.date}</div>}
                  {a.action && <div><span className="text-muted-foreground">Föreslagen åtgärd:</span> {a.action}</div>}
                </div>
                <DialogFooter className="gap-2 flex-wrap">
                  {a.target_id && (a.action === 'staff_job' || a.type === 'unstaffed_job') && (
                    <Button onClick={() => { navigate(`/m/job/${a.target_id}`); setDetail(null); }}>Öppna jobb</Button>
                  )}
                  {a.staff_id && (
                    <Button variant="secondary" onClick={() => { setDetail(null); openStaff(a.staff_id!); }}>
                      Visa person
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setDetail(null)}>Stäng</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Section: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <section>
    <div className="flex items-center gap-2 mb-2 px-1">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
    </div>
    <div className="space-y-3">{children}</div>
  </section>
);

const KpiCard: React.FC<{ icon: React.ElementType; label: string; value: number; tone?: 'default' | 'warn' }> = ({
  icon: Icon, label, value, tone = 'default',
}) => (
  <div className={cn(
    'p-3 rounded-xl border bg-card flex items-center gap-3',
    tone === 'warn' && value > 0 ? 'border-destructive/40' : 'border-border/60',
  )}>
    <div className={cn(
      'flex items-center justify-center w-9 h-9 rounded-lg',
      tone === 'warn' && value > 0 ? 'bg-destructive/15 text-destructive' : 'bg-primary/10 text-primary',
    )}>
      <Icon className="w-5 h-5" />
    </div>
    <div className="min-w-0">
      <div className="text-xl font-bold leading-none">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1 truncate">{label}</div>
    </div>
  </div>
);

const PhaseChip: React.FC<{ label: string; count: number; cls: string }> = ({ label, count, cls }) => (
  <div className={cn('flex-1 px-3 py-1.5 rounded-lg font-semibold text-center', cls)}>
    {label} · {count}
  </div>
);

const DayHeader: React.FC<{ label: string; sub?: string }> = ({ label, sub }) => (
  <div className="flex items-baseline gap-2 px-1">
    <h3 className="text-sm font-bold text-foreground">{label}</h3>
    {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
  </div>
);

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-center py-8 text-sm text-muted-foreground">{text}</div>
);

const ErrorState: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-center py-12 text-sm text-destructive">{text}</div>
);

const ListSkeleton: React.FC = () => (
  <div className="space-y-3">
    {[0, 1, 2].map(i => (
      <Skeleton key={i} className="h-16 w-full rounded-xl" />
    ))}
  </div>
);

export default MobileOverview;
