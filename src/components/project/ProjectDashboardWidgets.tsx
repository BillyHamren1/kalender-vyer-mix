import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { FolderKanban, Clock, CalendarClock, CheckCircle2, ChevronRight, AlertCircle, CalendarDays, Layers, Search } from 'lucide-react';
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

const TYPE_LABELS: Record<string, string> = { small: 'Litet', medium: 'Medel', large: 'Stort' };
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

  const recentlyCreated = useMemo(() =>
    [...nonCancelled].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
    [nonCancelled]
  );

  const recentlyUpdated = useMemo(() =>
    [...nonCancelled]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 6),
    [nonCancelled]
  );

  const statItems = [
    { label: 'Aktiva', value: activeCount, icon: FolderKanban, color: 'text-primary', bgColor: 'bg-primary/10' },
    { label: 'Planering', value: planningCount, icon: Clock, color: 'text-primary', bgColor: 'bg-primary/5' },
    { label: 'Pågående', value: inProgressCount, icon: CalendarClock, color: 'text-primary', bgColor: 'bg-primary/10' },
    { label: 'Slutförande', value: closingCount, icon: AlertCircle, color: closingCount > 0 ? 'text-amber-600' : 'text-muted-foreground', bgColor: closingCount > 0 ? 'bg-amber-50' : 'bg-muted' },
    { label: 'Avslutade', value: completedCount, icon: CheckCircle2, color: 'text-muted-foreground', bgColor: 'bg-muted' },
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

      {/* Two Widget Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Senast skapade projekt</h3>
            </div>
            <div className="divide-y divide-border/50">
              {recentlyCreated.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Inga projekt ännu</p>
              ) : recentlyCreated.map(item => <ProjectRow key={`recent-${item.id}-${item.type}`} item={item} />)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Senast uppdaterade projekt</h3>
            </div>
            <div className="divide-y divide-border/50">
              {recentlyUpdated.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Inga uppdaterade projekt</p>
              ) : recentlyUpdated.map(item => <ProjectRow key={`updated-${item.id}-${item.type}`} item={item} />)}
            </div>
          </CardContent>
        </Card>
      </div>

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
