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
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/i18n/LanguageContext';
import { mobileApi, getToken, type OverviewCalendarEvent, type OverviewAssignment, type OpsAnomaly, type OpsStaffStatus } from '@/services/mobileApiService';
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
        booking_id: j.type === 'booking' ? j.id.replace(/^synthetic-([^-]+)-.*/, '$1') : null,
        booking_number: j.booking_number,
        delivery_address: j.address,
      }) as OverviewCalendarEvent);
    }
    return calendarQ.data?.events ?? [];
  }, [opsData, calendarQ.data]);

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

  const isLoading = authLoading || !hasToken || (opsQ.isLoading && !useFallback) || (useFallback && (calendarQ.isLoading || assignmentsQ.isLoading));
  const isError = opsQ.isError && useFallback && (calendarQ.isError || assignmentsQ.isError);

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

      {/* Date selector */}
      <div className="px-4 flex gap-2 mb-3">
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

      {/* Phase filter */}
      <div className="px-4 flex gap-1.5 overflow-x-auto pb-1 mb-3">
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

      {/* KPI row */}
      <div className="px-4 grid grid-cols-2 gap-2 mb-4">
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

      {/* Phase counters */}
      <div className="px-4 flex gap-2 mb-4 text-[11px]">
        <PhaseChip label="Rig" count={kpi.rig} cls="bg-amber-500/10 text-amber-700 dark:text-amber-300" />
        <PhaseChip label="Event" count={kpi.event} cls="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" />
        <PhaseChip label="Rigdown" count={kpi.rigdown} cls="bg-blue-500/10 text-blue-700 dark:text-blue-300" />
      </div>

      {isLoading && <div className="px-4"><ListSkeleton /></div>}
      {isError && <ErrorState text={t('overview.error')} />}

      {!isLoading && !isError && (
        <div className="px-4 space-y-6">
          {/* === Section 1: Dagens jobb === */}
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
                      const unstaffed = ev.booking_id && staff.length === 0;
                      return (
                        <button
                          key={ev.id}
                          onClick={() => ev.booking_id && navigate(`/m/job/${ev.booking_id}`)}
                          className="w-full flex items-start gap-3 p-3 rounded-xl bg-card border border-border/60 active:scale-[0.99] transition-transform text-left"
                        >
                          <div className={cn('px-2 py-0.5 rounded-md text-[10px] font-bold border', eventTypeColor(ev.event_type))}>
                            {(ev.event_type ?? '—').toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm truncate">{ev.title}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>{formatTimeRange(ev.start_time, ev.end_time)}</span>
                              {ev.delivery_address && (
                                <>
                                  <span>·</span>
                                  <MapPin className="w-3 h-3 shrink-0" />
                                  <span className="truncate max-w-[140px]">{ev.delivery_address}</span>
                                </>
                              )}
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5">
                              {unstaffed ? (
                                <Badge variant="destructive" className="h-5 text-[10px]">
                                  {t('overview.staffStatus.unstaffed')}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="h-5 text-[10px]">
                                  {staff.length} {t('overview.staffStatus.planned')}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {ev.booking_id && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </Section>
          )}

          {/* === Section 2: Personalöversikt === */}
          {phase !== 'anomalies' && (
            <Section title={t('overview.section.staff')} icon={Users}>
              {staffByDay.length === 0 ? (
                <EmptyState text={t('overview.empty.staffing')} />
              ) : (
                staffByDay.map(([date, staff]) => (
                  <div key={date} className="space-y-2">
                    <DayHeader label={formatDay(date)} sub={format(parseISO(date), 'd MMM yyyy', { locale: dateLocale })} />
                    <div className="flex flex-wrap gap-1.5">
                      {staff.map(s => {
                        const b = roleBadge(s.role);
                        return (
                          <button
                            key={s.id}
                            onClick={() => s.booking_id && navigate(`/m/job/${s.booking_id}`)}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-card border border-border/60 active:scale-[0.97]"
                          >
                            <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold border', b.cls)}>
                              {b.label}
                            </span>
                            <span className="text-xs font-medium">{s.staff_name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              · {s.client ?? s.booking_number ?? '—'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </Section>
          )}

          {/* === Section 3: Avvikelser === */}
          <Section title={t('overview.section.anomalies')} icon={AlertTriangle}>
            {anomalies.length === 0 ? (
              <EmptyState text={t('overview.empty.anomalies')} />
            ) : (
              <div className="space-y-2">
                {anomalies.map((a, i) => (
                  <button
                    key={`${a.kind}-${i}`}
                    onClick={() => a.bookingId && navigate(`/m/job/${a.bookingId}`)}
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
                    {a.bookingId && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />}
                  </button>
                ))}
              </div>
            )}
          </Section>

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
