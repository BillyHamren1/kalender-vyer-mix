import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, isToday, isTomorrow, addDays, startOfDay } from 'date-fns';
import { sv as svLocale, enUS } from 'date-fns/locale';
import { Calendar, Users, MessageSquare, ChevronRight, MapPin, Clock } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/i18n/LanguageContext';
import { mobileApi } from '@/services/mobileApiService';
import { cn } from '@/lib/utils';

const RANGE_DAYS_BACK = 7;
const RANGE_DAYS_FWD = 21;

const MobileOverview: React.FC = () => {
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const [tab, setTab] = useState<'calendar' | 'staffing' | 'messages'>('calendar');
  const dateLocale = locale === 'en' ? enUS : svLocale;

  const range = useMemo(() => {
    const today = startOfDay(new Date());
    const from = format(addDays(today, -RANGE_DAYS_BACK), 'yyyy-MM-dd');
    const to = format(addDays(today, RANGE_DAYS_FWD), 'yyyy-MM-dd');
    return { from, to };
  }, []);

  const calendarQ = useQuery({
    queryKey: ['mobile-overview-calendar', range.from, range.to],
    queryFn: () => mobileApi.getOverviewCalendar(range),
    enabled: tab === 'calendar',
    staleTime: 60_000,
  });

  const assignmentsQ = useQuery({
    queryKey: ['mobile-overview-assignments', range.from, range.to],
    queryFn: () => mobileApi.getOverviewAssignments(range),
    enabled: tab === 'staffing',
    staleTime: 60_000,
  });

  const threadsQ = useQuery({
    queryKey: ['mobile-overview-threads'],
    queryFn: () => mobileApi.getOverviewThreads(),
    enabled: tab === 'messages',
    staleTime: 30_000,
  });

  // === Group calendar events by source_date ===
  const eventsByDay = useMemo(() => {
    const events = calendarQ.data?.events ?? [];
    const map = new Map<string, typeof events>();
    for (const e of events) {
      const key = e.source_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    // Sort each day's events by start_time
    for (const arr of map.values()) {
      arr.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [calendarQ.data]);

  // === Group assignments by date → booking ===
  const staffingByDay = useMemo(() => {
    const list = assignmentsQ.data?.assignments ?? [];
    const byDate = new Map<string, Map<string, typeof list>>();
    for (const a of list) {
      if (!byDate.has(a.assignment_date)) byDate.set(a.assignment_date, new Map());
      const byBooking = byDate.get(a.assignment_date)!;
      if (!byBooking.has(a.booking_id)) byBooking.set(a.booking_id, []);
      byBooking.get(a.booking_id)!.push(a);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, bookings]) => ({
        date,
        bookings: Array.from(bookings.entries()).map(([bookingId, staff]) => ({
          bookingId,
          staff,
        })),
      }));
  }, [assignmentsQ.data]);

  const formatDay = (iso: string) => {
    try {
      const d = parseISO(iso);
      if (isToday(d)) return t('jobs.today');
      if (isTomorrow(d)) return t('jobs.tomorrow');
      return format(d, 'EEE d MMM', { locale: dateLocale });
    } catch {
      return iso;
    }
  };

  const formatTimeRange = (start: string, end: string) => {
    try {
      return `${format(parseISO(start), 'HH:mm')}–${format(parseISO(end), 'HH:mm')}`;
    } catch {
      return '';
    }
  };

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

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-5 pt-6 pb-4">
        <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
          {t('overview.subtitle')}
        </p>
        <h1 className="text-2xl font-bold mt-1">{t('overview.title')}</h1>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="px-4">
        <TabsList className="w-full grid grid-cols-3 h-11">
          <TabsTrigger value="calendar" className="gap-1.5">
            <Calendar className="w-4 h-4" />
            <span className="text-xs">{t('overview.tabs.calendar')}</span>
          </TabsTrigger>
          <TabsTrigger value="staffing" className="gap-1.5">
            <Users className="w-4 h-4" />
            <span className="text-xs">{t('overview.tabs.staffing')}</span>
          </TabsTrigger>
          <TabsTrigger value="messages" className="gap-1.5">
            <MessageSquare className="w-4 h-4" />
            <span className="text-xs">{t('overview.tabs.messages')}</span>
          </TabsTrigger>
        </TabsList>

        {/* === Calendar === */}
        <TabsContent value="calendar" className="mt-4 space-y-4">
          {calendarQ.isLoading && <ListSkeleton />}
          {calendarQ.isError && <ErrorState text={t('overview.error')} />}
          {!calendarQ.isLoading && eventsByDay.length === 0 && (
            <EmptyState text={t('overview.empty.calendar')} />
          )}
          {eventsByDay.map(([day, events]) => (
            <div key={day}>
              <DayHeader label={formatDay(day)} sub={format(parseISO(day), 'd MMM yyyy', { locale: dateLocale })} />
              <div className="space-y-2 mt-2">
                {events.map(ev => (
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
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>{formatTimeRange(ev.start_time, ev.end_time)}</span>
                        {ev.delivery_address && (
                          <>
                            <span>·</span>
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{ev.delivery_address}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {ev.booking_id && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </TabsContent>

        {/* === Staffing === */}
        <TabsContent value="staffing" className="mt-4 space-y-4">
          {assignmentsQ.isLoading && <ListSkeleton />}
          {assignmentsQ.isError && <ErrorState text={t('overview.error')} />}
          {!assignmentsQ.isLoading && staffingByDay.length === 0 && (
            <EmptyState text={t('overview.empty.staffing')} />
          )}
          {staffingByDay.map(({ date, bookings }) => (
            <div key={date}>
              <DayHeader label={formatDay(date)} sub={format(parseISO(date), 'd MMM yyyy', { locale: dateLocale })} />
              <div className="space-y-2 mt-2">
                {bookings.map(({ bookingId, staff }) => (
                  <button
                    key={bookingId}
                    onClick={() => navigate(`/m/job/${bookingId}`)}
                    className="w-full p-3 rounded-xl bg-card border border-border/60 active:scale-[0.99] transition-transform text-left"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-semibold text-muted-foreground">
                        {staff.length} {t('jobs.bookings')}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {staff.map(s => {
                        const b = roleBadge(s.role);
                        return (
                          <div key={s.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary/50 border border-border/40">
                            <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold border', b.cls)}>
                              {b.label}
                            </span>
                            <span className="text-xs font-medium">{s.staff_name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </TabsContent>

        {/* === Messages === */}
        <TabsContent value="messages" className="mt-4 space-y-2">
          {threadsQ.isLoading && <ListSkeleton />}
          {threadsQ.isError && <ErrorState text={t('overview.error')} />}
          {!threadsQ.isLoading && (threadsQ.data?.threads.length ?? 0) === 0 && (
            <EmptyState text={t('overview.empty.messages')} />
          )}
          {threadsQ.data?.threads.map(thread => (
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
        </TabsContent>
      </Tabs>
    </div>
  );
};

const DayHeader: React.FC<{ label: string; sub?: string }> = ({ label, sub }) => (
  <div className="flex items-baseline gap-2 px-1">
    <h2 className="text-sm font-bold text-foreground">{label}</h2>
    {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
  </div>
);

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-center py-12 text-sm text-muted-foreground">{text}</div>
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
