import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { FolderKanban, Clock, CalendarClock, CheckCircle2, ChevronRight, AlertCircle, CalendarDays, Layers, Search, ShieldCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { fetchJobs } from '@/services/jobService';
import { fetchProjects } from '@/services/projectService';
import { fetchLargeProjects } from '@/services/largeProjectService';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface UnifiedItem {
  id: string;
  name: string;
  type: 'small' | 'medium' | 'large';
  date: string | null;
  rigDate: string | null;
  status: string;
  subtitle: string | null;
  navigateTo: string;
  updatedAt: string;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = { small: 'Jobb', medium: 'Projekt', large: 'Projektgrupp' };
const TYPE_BADGE_CLASSES: Record<string, string> = {
  small: 'bg-[hsl(var(--project-small))] text-[hsl(var(--project-small-foreground))] ring-1 ring-[hsl(var(--project-small-border))]',
  medium: 'bg-[hsl(var(--project-medium))] text-[hsl(var(--project-medium-foreground))] ring-1 ring-[hsl(var(--project-medium-border))]',
  large: 'bg-[hsl(var(--project-large))] text-[hsl(var(--project-large-foreground))] ring-1 ring-[hsl(var(--project-large-border))]',
};

const ProjectDashboardWidgets = () => {
  const navigate = useNavigate();
  const { data: jobs = [], isLoading: jL } = useQuery({ queryKey: ['jobs'], queryFn: fetchJobs });
  const { data: projects = [], isLoading: pL } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects });
  const { data: largeProjects = [], isLoading: lL } = useQuery({ queryKey: ['large-projects'], queryFn: fetchLargeProjects });

  const isLoading = jL || pL || lL;

  const unified = useMemo<UnifiedItem[]>(() => {
    const items: UnifiedItem[] = [];
    jobs.forEach(j => items.push({
      id: j.id, 
      name: j.booking?.client ? `${j.booking.client}${j.booking.bookingNumber ? ' #' + j.booking.bookingNumber : ''}` : j.name, 
      type: 'small',
      date: j.booking?.eventDate ?? null,
      rigDate: j.booking?.rigDayDate ?? j.booking?.eventDate ?? null,
      status: j.status === 'planned' ? 'planning' : j.status,
      subtitle: j.booking?.deliveryAddress ?? null,
      navigateTo: `/jobs/${j.id}`,
      updatedAt: j.updatedAt,
      createdAt: j.createdAt,
    }));
    projects.forEach(p => {
      const client = p.booking?.client;
      const bookingNum = p.booking?.booking_number;
      const displayName = client ? `${client}${bookingNum ? ' #' + bookingNum : ''}` : p.name;
      const addressParts = [p.booking?.deliveryaddress, p.booking?.delivery_city].filter(Boolean);
      const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : null;
      items.push({
        id: p.id, name: displayName, type: 'medium',
        date: p.booking?.eventdate ?? null,
        rigDate: p.booking?.rigdaydate ?? p.booking?.eventdate ?? null,
        status: p.status,
        subtitle: fullAddress,
        navigateTo: `/project/${p.id}`,
        updatedAt: p.updated_at,
        createdAt: p.created_at,
      });
    });
    largeProjects.forEach(lp => items.push({
      id: lp.id, name: lp.name, type: 'large',
      date: lp.start_date?.[0] ?? null,
      rigDate: lp.start_date?.[0] ?? lp.event_date?.[0] ?? null,
      status: lp.status,
      subtitle: lp.location ?? `${lp.bookingCount ?? 0} bokningar`,
      navigateTo: `/large-project/${lp.id}`,
      updatedAt: lp.updated_at,
      createdAt: lp.created_at,
    }));
    return items;
  }, [jobs, projects, largeProjects]);

  const nonCancelled = unified.filter(p => p.status !== 'cancelled');
  const activeCount = nonCancelled.filter(p => p.status !== 'completed').length;
  const planningCount = nonCancelled.filter(p => p.status === 'planning').length;
  const inProgressCount = nonCancelled.filter(p => p.status === 'in_progress').length;
  const completedCount = nonCancelled.filter(p => p.status === 'completed').length;
  
  const today = new Date().toISOString().split('T')[0];
  const closingCount = nonCancelled.filter(p => p.status !== 'completed' && p.date && p.date < today).length;

  const horizon14 = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
  const attentionProjects = useMemo(() =>
    nonCancelled
      .filter(p => p.status !== 'completed' && p.date && p.date < today)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .slice(0, 6),
    [nonCancelled, today]
  );
  const upcomingProjects = useMemo(() =>
    nonCancelled
      .filter(p => p.status !== 'completed' && p.rigDate && p.rigDate >= today && p.rigDate <= horizon14)
      .sort((a, b) => (a.rigDate || '').localeCompare(b.rigDate || ''))
      .slice(0, 6),
    [nonCancelled, today, horizon14]
  );

  /** Framåtblickande fördelning – ersätter tidigare "Senast ändrade". */
  const workload = useMemo(() => {
    const iso = (days: number) => new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
    const d30 = iso(30);
    const d60 = iso(60);
    const d90 = iso(90);
    const planned = nonCancelled.filter(p => p.status !== 'completed' && (p.rigDate ?? p.date));
    const key = (p: UnifiedItem) => (p.rigDate ?? p.date) as string;
    const within = (from: string, to: string) => planned.filter(p => key(p) >= from && key(p) <= to).length;
    return [
      { label: '0–30 dagar', value: within(today, d30) },
      { label: '31–60 dagar', value: within(d30, d60) - planned.filter(p => key(p) === d30).length },
      { label: '61–90 dagar', value: within(d60, d90) - planned.filter(p => key(p) === d60).length },
      { label: 'Senare än 90 dagar', value: planned.filter(p => key(p) > d90).length },
    ];
  }, [nonCancelled, today]);

  const statItems = [
    { label: 'Aktiva totalt', value: activeCount, icon: FolderKanban, color: 'text-primary', bgColor: 'bg-primary/10', hint: 'Alla projekt som inte är avslutade eller avbokade. Korten till höger är delmängder av detta.' },
    { label: 'varav Planering', value: planningCount, icon: Clock, color: 'text-primary', bgColor: 'bg-primary/5', hint: 'Aktiva projekt med status Planering.' },
    { label: 'varav Pågående', value: inProgressCount, icon: CalendarClock, color: 'text-primary', bgColor: 'bg-primary/10', hint: 'Aktiva projekt med status Pågående.' },
    { label: 'varav Väntar på avslut', value: closingCount, icon: AlertCircle, color: 'text-muted-foreground', bgColor: 'bg-muted', hint: 'Genomförda projekt (eventdatum passerat) som fortfarande är öppna.' },
    { label: 'Avslutade', value: completedCount, icon: CheckCircle2, color: 'text-muted-foreground', bgColor: 'bg-muted', hint: 'Projekt med status Avslutat. Ingår inte i Aktiva totalt.' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card><CardContent className="p-4"><Skeleton className="h-48 w-full" /></CardContent></Card>
          <Card><CardContent className="p-4"><Skeleton className="h-48 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try { return format(new Date(dateStr), 'd MMM', { locale: sv }); } catch { return '—'; }
  };

  const handleOpenInCalendar = (e: React.MouseEvent, item: UnifiedItem) => {
    e.stopPropagation();
    const target = item.rigDate ?? item.date;
    if (!target) return;
    try {
      const d = new Date(target);
      sessionStorage.setItem('calendarDate', d.toISOString());
    } catch {
      // ignore
    }
    navigate('/calendar');
  };

  const ProjectRow = ({ item, compact = false }: { item: UnifiedItem; compact?: boolean }) => {
    const calendarTarget = item.rigDate ?? item.date;
    return (
      <div
        onClick={() => navigate(item.navigateTo)}
        className={`flex items-center justify-between ${compact ? 'py-1' : 'py-2.5'} px-1 cursor-pointer hover:bg-muted/40 rounded-md transition-colors group`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium shrink-0 ${TYPE_BADGE_CLASSES[item.type]}`}>
            {TYPE_LABELS[item.type]}
          </Badge>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{item.name}</p>
            <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {calendarTarget && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => handleOpenInCalendar(e, item)}
                    aria-label="Öppna i personalkalender"
                    className="p-1 rounded-md text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Öppna rigdag i personalkalender</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <span className="text-xs text-muted-foreground">{formatDate(item.date)}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statItems.map(({ label, value, icon: Icon, color, bgColor }) => (
          <Card key={label} className={label === 'Slutförande' && value > 0 ? 'border-amber-300/70' : undefined}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${bgColor}`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <div>
                <p className="text-xl font-semibold leading-none">{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>




      {/* Projektledarens prioritering – vad behöver göras och vad kommer närmast? */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className={attentionProjects.length ? "border-amber-300/60" : undefined}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2"><AlertCircle className={attentionProjects.length ? "h-4 w-4 text-amber-600" : "h-4 w-4 text-emerald-600"} /><h3 className="text-sm font-semibold">Behöver uppmärksamhet</h3></div>
                <p className="text-xs text-muted-foreground mt-1">Projekt där eventdatum passerat men projektet fortfarande är öppet.</p>
              </div>
              <Badge variant="outline" className="text-[10px]">{attentionProjects.length}</Badge>
            </div>
            <div className="divide-y divide-border/50">
              {attentionProjects.length === 0 ? (
                <div className="py-5 text-center"><ShieldCheck className="h-5 w-5 mx-auto text-emerald-600 mb-1.5" /><p className="text-sm font-medium">Inget släpar efter</p><p className="text-xs text-muted-foreground">Inga passerade projekt väntar på avslut.</p></div>
              ) : attentionProjects.map(item => <ProjectRow key={`attention-${item.id}-${item.type}`} item={item} />)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Kommande 14 dagar</h3></div>
                <p className="text-xs text-muted-foreground mt-1">Aktiva projekt sorterade efter närmaste rigg/start.</p>
              </div>
              <Badge variant="outline" className="text-[10px]">{upcomingProjects.length}</Badge>
            </div>
            <div className="divide-y divide-border/50">
              {upcomingProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground py-5 text-center">Ingen rigg/start inom 14 dagar</p>
              ) : upcomingProjects.map(item => <ProjectRow key={`upcoming-${item.id}-${item.type}`} item={item} />)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3"><CalendarClock className="h-4 w-4 text-muted-foreground" /><h3 className="text-sm font-semibold">Senast ändrade</h3></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 divide-y md:divide-y-0 md:[&>*:nth-child(n+3)]:border-t md:[&>*:nth-child(n+3)]:border-border/50">
            {recentlyUpdated.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">Inga uppdaterade projekt</p> : recentlyUpdated.map(item => <ProjectRow key={`updated-${item.id}-${item.type}`} item={item} compact />)}
          </div>
        </CardContent>
      </Card>

      <LargeProjectsList items={unified.filter(i => i.type === 'large' && i.status !== 'cancelled')} ProjectRow={ProjectRow} />
    </div>
  );
};

interface LargeProjectsListProps {
  items: UnifiedItem[];
  ProjectRow: React.FC<{ item: UnifiedItem; compact?: boolean }>;
}

const RECENT_KEY = 'recentLargeProjectsOpened';
const readRecent = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '{}') || {}; } catch { return {}; }
};
const writeRecent = (id: string) => {
  try {
    const map = readRecent();
    map[id] = Date.now();
    // keep only 50 most recent
    const trimmed = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50);
    localStorage.setItem(RECENT_KEY, JSON.stringify(Object.fromEntries(trimmed)));
  } catch {
    // ignore
  }
};

const LargeProjectsList: React.FC<LargeProjectsListProps> = ({ items, ProjectRow }) => {
  const [search, setSearch] = useState('');
  const [recent, setRecent] = useState<Record<string, number>>(() => readRecent());
  const query = search.trim().toLowerCase();

  // Refresh from localStorage when window regains focus (covers cross-tab/back-nav)
  useEffect(() => {
    const onFocus = () => setRecent(readRecent());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const sorted = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const recentItems = items
      .filter(i => recent[i.id])
      .sort((a, b) => (recent[b.id] ?? 0) - (recent[a.id] ?? 0));
    const recentIds = new Set(recentItems.map(i => i.id));
    const rest = items.filter(i => !recentIds.has(i.id));
    const upcoming = rest
      .filter(i => i.date && i.date >= today)
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    const past = rest
      .filter(i => !i.date || i.date < today)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    return [...recentItems, ...upcoming, ...past];
  }, [items, recent]);

  const filtered = useMemo(() => {
    if (!query) return sorted.slice(0, 10);
    return sorted.filter(i =>
      i.name.toLowerCase().includes(query) ||
      (i.subtitle ?? '').toLowerCase().includes(query)
    );
  }, [sorted, query]);

  const trackOpen = (id: string) => {
    writeRecent(id);
    setRecent(readRecent());
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Stora projekt</h3>
            <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök stort projekt…"
              className="pl-7 h-8 text-sm"
            />
          </div>
        </div>
        {!query && (
          <p className="text-xs text-muted-foreground mb-2">
            Senast öppnade visas överst. Sök för att hitta fler.
          </p>
        )}
        <div className="divide-y divide-border/50">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {query ? 'Inga matchande stora projekt' : 'Inga stora projekt'}
            </p>
          ) : filtered.map(item => (
            <div key={`large-${item.id}`} onClickCapture={() => trackOpen(item.id)}>
              <ProjectRow item={item} compact />
            </div>
          ))}
        </div>
        {query && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">{filtered.length} träffar</p>
        )}
      </CardContent>
    </Card>
  );
};

export default ProjectDashboardWidgets;
