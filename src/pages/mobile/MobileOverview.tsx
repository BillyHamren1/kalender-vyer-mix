import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { format, parseISO, isToday, isTomorrow, addDays, startOfDay } from 'date-fns';
import { sv as svLocale, enUS } from 'date-fns/locale';
import {
  Calendar as CalendarIcon,
  Users,
  ChevronRight,
  MapPin,
  Clock,
  Briefcase,
  Wifi,
  WifiOff,
  List as ListIcon,
  AlertTriangle,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/i18n/LanguageContext';
import { mobileApi, getToken, type OpsStaffStatus, type OpsOverviewJob } from '@/services/mobileApiService';
import StaffDetailMapDialog from '@/components/mobile-app/StaffDetailMapDialog';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileRoles } from '@/hooks/mobile/useMobileRoles';
import { cn } from '@/lib/utils';
import { extractUTCTime, parsePlannerDate } from '@/utils/dateUtils';

type DateMode = 'today' | 'tomorrow' | 'week';
type MainTab = 'staff' | 'projects';
type ProjectViewMode = 'list' | 'calendar';
type PhaseFilter = 'all' | 'rig' | 'event' | 'rigdown';

const STAFF_STATUS_COPY: Record<string, string> = {
  on_project: 'På projekt',
  on_location: 'På plats',
  active_timer: 'Arbetsdag aktiv',
  traveling: 'På väg',
  signal_lost: 'Senaste signal saknas',
  missing_workday: 'Planerad – ej startad',
  planned_not_started: 'Planerad',
  unknown: 'Okänd status',
};

// Sort priority for Personalvy
const STAFF_SORT_ORDER: Record<string, number> = {
  on_project: 0,
  on_location: 0,
  traveling: 1,
  active_timer: 1,
  missing_workday: 2,
  planned_not_started: 2,
  signal_lost: 3,
  unknown: 4,
};

const MobileOverview: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t, locale } = useLanguage();
  const { isAuthenticated, isLoading: authLoading } = useMobileAuth();
  const { isPlanner, isLoading: rolesLoading } = useMobileRoles();
  const [dateMode, setDateMode] = useState<DateMode>('today');
  const [mainTab, setMainTab] = useState<MainTab>('staff');
  const [projectViewMode, setProjectViewMode] = useState<ProjectViewMode>('list');
  const [phase, setPhase] = useState<PhaseFilter>('all');
  const dateLocale = locale === 'en' ? enUS : svLocale;

  const hasToken = isAuthenticated && !!getToken();

  // Range driven by date mode
  const range = useMemo(() => {
    const today = startOfDay(new Date());
    if (dateMode === 'today') {
      const d = format(today, 'yyyy-MM-dd');
      return { from: d, to: d, mode: 'day' as const };
    }
    if (dateMode === 'tomorrow') {
      const d = format(addDays(today, 1), 'yyyy-MM-dd');
      return { from: d, to: d, mode: 'day' as const };
    }
    return {
      from: format(today, 'yyyy-MM-dd'),
      to: format(addDays(today, 6), 'yyyy-MM-dd'),
      mode: 'week' as const,
    };
  }, [dateMode]);

  const activeDates = useMemo(() => {
    const today = startOfDay(new Date());
    if (dateMode === 'today') return [format(today, 'yyyy-MM-dd')];
    if (dateMode === 'tomorrow') return [format(addDays(today, 1), 'yyyy-MM-dd')];
    return Array.from({ length: 7 }, (_, i) => format(addDays(today, i), 'yyyy-MM-dd'));
  }, [dateMode]);

  // Single ops query — anomalies explicitly OFF
  const opsQ = useQuery({
    queryKey: ['mobile-ops-overview', range.from, range.to, range.mode],
    queryFn: () => mobileApi.getOpsOverview({ from: range.from, to: range.to, mode: range.mode, include_anomalies: false }),
    enabled: hasToken,
    staleTime: 3 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  // Prefetch other date modes
  useEffect(() => {
    if (!hasToken) return;
    const today = startOfDay(new Date());
    const todayStr = format(today, 'yyyy-MM-dd');
    const tmrStr = format(addDays(today, 1), 'yyyy-MM-dd');
    const weekTo = format(addDays(today, 6), 'yyyy-MM-dd');
    const variants: Array<{ from: string; to: string; mode: 'day' | 'week' }> = [
      { from: todayStr, to: todayStr, mode: 'day' },
      { from: tmrStr, to: tmrStr, mode: 'day' },
      { from: todayStr, to: weekTo, mode: 'week' },
    ];
    for (const v of variants) {
      qc.prefetchQuery({
        queryKey: ['mobile-ops-overview', v.from, v.to, v.mode],
        queryFn: () => mobileApi.getOpsOverview({ from: v.from, to: v.to, mode: v.mode, include_anomalies: false }),
        staleTime: 3 * 60_000,
      });
    }
  }, [hasToken, qc]);

  const opsData = opsQ.data;
  const allJobs: OpsOverviewJob[] = opsData?.jobs ?? [];
  const allStaff: OpsStaffStatus[] = opsData?.staffStatus ?? [];

  const jobsInRange = useMemo(() => allJobs.filter(j => activeDates.includes(j.date)), [allJobs, activeDates]);

  // === Personal summary ===
  const staffSummary = useMemo(() => {
    let working = 0, onTarget = 0, planned = 0, signalLost = 0;
    for (const s of allStaff) {
      const cs = s.current_status ?? 'unknown';
      if (cs === 'signal_lost') signalLost++;
      if (cs === 'on_project' || cs === 'on_location') { working++; onTarget++; }
      else if (cs === 'active_timer' || cs === 'traveling') working++;
      else if (cs === 'planned_not_started' || cs === 'missing_workday') planned++;
    }
    return { working, onTarget, planned, signalLost };
  }, [allStaff]);

  // === Project summary ===
  const projectSummary = useMemo(() => {
    const todayStr = format(startOfDay(new Date()), 'yyyy-MM-dd');
    const todayJobs = allJobs.filter(j => j.date === todayStr);
    let ongoing = 0, upcoming = 0;
    const nowMs = Date.now();
    for (const j of todayJobs) {
      const startMs = j.start_time ? parseISO(j.start_time).getTime() : 0;
      const endMs = j.end_time ? parseISO(j.end_time).getTime() : 0;
      const isActive = (j.jobActivity?.active_staff_count ?? 0) > 0;
      if (isActive || (startMs && endMs && nowMs >= startMs && nowMs <= endMs)) ongoing++;
      else if (startMs && nowMs < startMs) upcoming++;
    }
    return { today: todayJobs.length, ongoing, upcoming };
  }, [allJobs]);

  // === Sorted staff for Personalvy ===
  const sortedStaff = useMemo(() => {
    const arr = [...allStaff];
    arr.sort((a, b) => {
      const oa = STAFF_SORT_ORDER[a.current_status ?? 'unknown'] ?? 99;
      const ob = STAFF_SORT_ORDER[b.current_status ?? 'unknown'] ?? 99;
      if (oa !== ob) return oa - ob;
      return (a.name || '').localeCompare(b.name || '', 'sv');
    });
    return arr;
  }, [allStaff]);

  // === Project list grouped per day ===
  const projectsByDay = useMemo(() => {
    const filtered = phase === 'all' ? jobsInRange : jobsInRange.filter(j => j.phase === phase);
    const map = new Map<string, OpsOverviewJob[]>();
    for (const j of filtered) {
      if (!map.has(j.date)) map.set(j.date, []);
      map.get(j.date)!.push(j);
    }
    for (const arr of map.values()) arr.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [jobsInRange, phase]);

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

  const projectStatusChip = (j: OpsOverviewJob): { label: string; cls: string } => {
    const nowMs = Date.now();
    const startMs = j.start_time ? parseISO(j.start_time).getTime() : 0;
    const endMs = j.end_time ? parseISO(j.end_time).getTime() : 0;
    const active = (j.jobActivity?.active_staff_count ?? 0) > 0;
    if (active || (startMs && endMs && nowMs >= startMs && nowMs <= endMs)) {
      return { label: 'Pågår', cls: 'bg-primary/15 text-primary border-primary/30' };
    }
    if (endMs && nowMs > endMs) return { label: 'Klar', cls: 'bg-muted text-muted-foreground border-border' };
    if (startMs && nowMs < startMs) return { label: 'Kommande', cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30' };
    return { label: 'Planerad', cls: 'bg-muted text-foreground border-border' };
  };

  const authNotReady = authLoading || rolesLoading || !hasToken;
  const isLoading = !authNotReady && opsQ.isLoading;

  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e ?? '')).toLowerCase();
  const isForbidden = (() => {
    const m = errMsg(opsQ.error);
    return m.includes('403') || m.includes('forbidden') || m.includes('not authorized') || m.includes('unauthorized');
  })();
  const isError = !isForbidden && opsQ.isError;
  const hasNoData = !isLoading && !isError && !isForbidden
    && allJobs.length === 0 && allStaff.length === 0;

  // === Detail dialog ===
  const [detail, setDetail] = useState<{ kind: 'staff'; staff: OpsStaffStatus } | null>(null);

  const openStaff = (s: OpsStaffStatus) => setDetail({ kind: 'staff', staff: s });

  const openProject = (j: OpsOverviewJob) => {
    if (j.target_type === 'large_project') {
      const lpId = j.large_project_id ?? j.target_id;
      if (lpId) { navigate(`/m/project/${lpId}`); return; }
    }
    if (j.booking_id) { navigate(`/m/job/${j.booking_id}`); return; }
    if (j.large_project_id) { navigate(`/m/project/${j.large_project_id}`); return; }
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
  ];

  const elapsedTxt = (mins?: number | null) =>
    mins == null ? null : (mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`);

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

        <div className="px-4 flex gap-2 mb-2">
          {([
            { key: 'staff' as MainTab, label: 'Personal', icon: Users },
            { key: 'projects' as MainTab, label: 'Projekt', icon: Briefcase },
          ]).map(tab => {
            const Icon = tab.icon;
            const active = mainTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setMainTab(tab.key)}
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border transition-colors',
                  active
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-card text-muted-foreground border-border/60 active:bg-muted',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {mainTab === 'projects' && (
          <>
            <div className="px-4 flex gap-2 mb-2">
              {([
                { key: 'list' as ProjectViewMode, label: 'Lista', icon: ListIcon },
                { key: 'calendar' as ProjectViewMode, label: 'Kalender', icon: CalendarIcon },
              ]).map(v => {
                const Icon = v.icon;
                const active = projectViewMode === v.key;
                return (
                  <button
                    key={v.key}
                    onClick={() => setProjectViewMode(v.key)}
                    className={cn(
                      'flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors',
                      active
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-card text-muted-foreground border-border/60 active:bg-muted',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {v.label}
                  </button>
                );
              })}
            </div>
            <div className="px-4 flex gap-1.5 overflow-x-auto pb-1">
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
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Calm summary */}
      {!authNotReady && isPlanner && !isForbidden && !isError && (
        <div className="px-4 mt-3 mb-3 rounded-xl border border-border/60 bg-card p-3">
          {mainTab === 'staff' ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <SummaryRow label="Personal i arbete" value={staffSummary.working} />
              <SummaryRow label="På projekt/plats" value={staffSummary.onTarget} />
              <SummaryRow label="Planerade" value={staffSummary.planned} />
              <SummaryRow label="Signal saknas" value={staffSummary.signalLost} />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
              <SummaryRow label="Projekt idag" value={projectSummary.today} />
              <SummaryRow label="Pågående" value={projectSummary.ongoing} />
              <SummaryRow label="Kommande" value={projectSummary.upcoming} />
            </div>
          )}
        </div>
      )}

      {authNotReady && (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          {t('overview.state.loading')}
        </div>
      )}
      {!authNotReady && !isPlanner && (
        <div className="px-4 py-12 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
          <div className="text-sm font-semibold">{t('overview.state.forbidden')}</div>
          <div className="text-xs text-muted-foreground mt-1">{t('overview.state.forbiddenDesc')}</div>
        </div>
      )}
      {!authNotReady && isPlanner && isForbidden && (
        <div className="px-4 py-12 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto text-destructive mb-2" />
          <div className="text-sm font-semibold text-destructive">{t('overview.state.forbidden')}</div>
        </div>
      )}
      {!authNotReady && isPlanner && !isForbidden && isLoading && (
        <div className="px-4">
          <div className="text-xs text-muted-foreground mb-2 text-center">{t('overview.state.loading')}</div>
          <ListSkeleton />
        </div>
      )}
      {!authNotReady && isPlanner && !isForbidden && isError && (
        <div className="px-4 py-12 text-center text-sm text-destructive">
          {t('overview.state.error')}
        </div>
      )}
      {!authNotReady && isPlanner && !isForbidden && !isLoading && !isError && hasNoData && (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          {t('overview.state.empty')}
        </div>
      )}

      {!authNotReady && isPlanner && !isForbidden && !isLoading && !isError && !hasNoData && (
        <div className="px-4 space-y-4">
          {/* === Personalvy === */}
          {mainTab === 'staff' && (
            <div className="space-y-2">
              {sortedStaff.length === 0 ? (
                <EmptyState text="Ingen personalstatus tillgänglig." />
              ) : sortedStaff.map(s => {
                const cs = s.current_status ?? 'unknown';
                const csLabel = STAFF_STATUS_COPY[cs] ?? STAFF_STATUS_COPY.unknown;
                const target = s.current_target_label;
                const plannedFallback = s.planned_targets?.[0]?.target_name;
                const elapsed = elapsedTxt(s.elapsed_minutes ?? null);
                const gpsFresh = s.gps_status === 'live' || s.gps_status === 'recent';
                return (
                  <button
                    key={s.staff_id}
                    onClick={() => openStaff(s)}
                    className="w-full flex items-start gap-3 p-3 rounded-xl bg-card border border-border/60 active:scale-[0.99] transition-transform text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{s.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {csLabel}
                        {target ? ` · ${target}` : (!target && plannedFallback ? ` · ${plannedFallback}` : '')}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1 flex-wrap">
                        {s.current_since && (
                          <>
                            <Clock className="w-3 h-3 shrink-0" />
                            <span>Sedan {format(parseISO(s.current_since), 'HH:mm')}</span>
                            {elapsed && <span>· {elapsed}</span>}
                          </>
                        )}
                        {s.latest_known_location?.updated_at && (
                          <>
                            {s.current_since && <span>·</span>}
                            {gpsFresh
                              ? <Wifi className="w-3 h-3 shrink-0 text-emerald-600" />
                              : <WifiOff className="w-3 h-3 shrink-0 text-muted-foreground" />}
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  </button>
                );
              })}
            </div>
          )}

          {/* === Projektvy: Lista === */}
          {mainTab === 'projects' && projectViewMode === 'list' && (
            <div className="space-y-4">
              {projectsByDay.length === 0 ? (
                <EmptyState text={t('overview.empty.calendar')} />
              ) : projectsByDay.map(([day, jobs]) => (
                <div key={day} className="space-y-2">
                  <DayHeader label={formatDay(day)} sub={format(parseISO(day), 'd MMM yyyy', { locale: dateLocale })} />
                  {jobs.map(j => (
                    <ProjectRow
                      key={j.id}
                      job={j}
                      eventTypeColor={eventTypeColor}
                      formatTimeRange={formatTimeRange}
                      statusChip={projectStatusChip(j)}
                      onClick={() => openProject(j)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* === Projektvy: Kalender === */}
          {mainTab === 'projects' && projectViewMode === 'calendar' && (
            <div className="space-y-3">
              {activeDates.map(date => {
                const dayJobs = jobsInRange
                  .filter(j => j.date === date && (phase === 'all' || j.phase === phase))
                  .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
                return (
                  <div key={date} className="rounded-xl border border-border/60 bg-card overflow-hidden">
                    <div className="flex items-baseline justify-between px-3 py-2 border-b border-border/40 bg-muted/30">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold">{formatDay(date)}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {format(parseISO(date), 'd MMM', { locale: dateLocale })}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{dayJobs.length} jobb</span>
                    </div>
                    {dayJobs.length === 0 ? (
                      <div className="px-3 py-4 text-xs text-muted-foreground text-center">Inga jobb</div>
                    ) : (
                      <div className="divide-y divide-border/40">
                        {dayJobs.map(j => (
                          <button
                            key={j.id}
                            onClick={() => openProject(j)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left active:bg-muted/40"
                          >
                            <div className="text-[11px] font-bold tabular-nums w-12 shrink-0 text-muted-foreground">
                              {extractUTCTime(j.start_time)}
                            </div>
                            <div className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold border shrink-0', eventTypeColor(j.phase))}>
                              {(j.phase ?? '—').toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{j.title}</div>
                              {j.address && (
                                <div className="text-[11px] text-muted-foreground truncate">{j.address}</div>
                              )}
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          {detail?.kind === 'staff' && (
            <StaffDetailMapDialog
              staff={detail.staff}
              onClose={() => setDetail(null)}
              onOpenTarget={(type, id) => {
                if (type === 'large_project') navigate(`/m/project/${id}`);
                else navigate(`/m/job/${id}`);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const SummaryRow: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-semibold tabular-nums">{value}</span>
  </div>
);

const ProjectRow: React.FC<{
  job: OpsOverviewJob;
  eventTypeColor: (t: string | null) => string;
  formatTimeRange: (s: string, e: string) => string;
  statusChip: { label: string; cls: string };
  onClick: () => void;
}> = ({ job, eventTypeColor, formatTimeRange, statusChip, onClick }) => {
  const planned = job.assigned_staff_count ?? 0;
  const active = job.jobActivity?.active_staff_count ?? 0;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 p-3 rounded-xl bg-card border border-border/60 active:scale-[0.99] transition-transform text-left"
    >
      <div className={cn('px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0', eventTypeColor(job.phase))}>
        {(job.phase ?? '—').toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{job.title}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 flex-wrap">
          <Clock className="w-3 h-3 shrink-0" />
          <span>{formatTimeRange(job.start_time, job.end_time)}</span>
          {job.address && (
            <>
              <span>·</span>
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[160px]">{job.address}</span>
            </>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border', statusChip.cls)}>
            {statusChip.label}
          </span>
          {planned > 0 ? (
            <span className="text-[10px] text-muted-foreground">
              {planned} planerade{active > 0 ? ` · ${active} aktiva` : ''}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">Ingen planerad personal</span>
          )}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
    </button>
  );
};

const DayHeader: React.FC<{ label: string; sub?: string }> = ({ label, sub }) => (
  <div className="flex items-baseline gap-2 px-1">
    <h3 className="text-sm font-bold text-foreground">{label}</h3>
    {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
  </div>
);

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-center py-8 text-sm text-muted-foreground">{text}</div>
);

const ListSkeleton: React.FC = () => (
  <div className="space-y-3">
    {[0, 1, 2].map(i => (
      <Skeleton key={i} className="h-16 w-full rounded-xl" />
    ))}
  </div>
);

export default MobileOverview;
