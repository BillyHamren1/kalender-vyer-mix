import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronRight, Calendar, AlertCircle } from 'lucide-react';
import { fetchJobs } from '@/services/jobService';
import { fetchProjects } from '@/services/projectService';
import { fetchLargeProjects } from '@/services/largeProjectService';
import { format, differenceInDays } from 'date-fns';
import { sv } from 'date-fns/locale';

interface ClosingItem {
  id: string;
  name: string;
  type: 'small' | 'medium' | 'large';
  eventDate: string;
  subtitle: string | null;
  navigateTo: string;
  daysSinceEvent: number;
}

const TYPE_LABELS: Record<string, string> = { small: 'Litet', medium: 'Medel', large: 'Stort' };
const TYPE_BADGE_CLASSES: Record<string, string> = {
  small: 'bg-[hsl(var(--project-small))] text-[hsl(var(--project-small-foreground))] ring-1 ring-[hsl(var(--project-small-border))]',
  medium: 'bg-[hsl(var(--project-medium))] text-[hsl(var(--project-medium-foreground))] ring-1 ring-[hsl(var(--project-medium-border))]',
  large: 'bg-[hsl(var(--project-large))] text-[hsl(var(--project-large-foreground))] ring-1 ring-[hsl(var(--project-large-border))]',
};

const ClosingProjectsList = () => {
  const navigate = useNavigate();
  const { data: jobs = [] } = useQuery({ queryKey: ['jobs'], queryFn: fetchJobs });
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects });
  const { data: largeProjects = [] } = useQuery({ queryKey: ['large-projects'], queryFn: fetchLargeProjects });

  const today = useMemo(() => new Date(), []);
  const todayStr = today.toISOString().split('T')[0];

  const closingItems = useMemo<ClosingItem[]>(() => {
    const items: ClosingItem[] = [];

    jobs.forEach(j => {
      const status = j.status === 'planned' ? 'planning' : j.status;
      const eventDate = j.booking?.eventDate;
      if (status !== 'completed' && eventDate && eventDate < todayStr) {
        items.push({
          id: j.id,
          name: j.booking?.client ? `${j.booking.client}${j.booking.bookingNumber ? ' #' + j.booking.bookingNumber : ''}` : j.name,
          type: 'small',
          eventDate,
          subtitle: j.booking?.deliveryAddress ?? null,
          navigateTo: `/jobs/${j.id}`,
          daysSinceEvent: differenceInDays(today, new Date(eventDate)),
        });
      }
    });

    projects.forEach(p => {
      const eventDate = p.booking?.eventdate ?? p.eventdate;
      if (p.status !== 'completed' && eventDate && eventDate < todayStr) {
        const client = p.booking?.client;
        const bookingNum = p.booking?.booking_number;
        const displayName = client ? `${client}${bookingNum ? ' #' + bookingNum : ''}` : p.name;
        const addressParts = [p.booking?.deliveryaddress, p.booking?.delivery_city].filter(Boolean);
        items.push({
          id: p.id,
          name: displayName,
          type: 'medium',
          eventDate,
          subtitle: addressParts.length > 0 ? addressParts.join(', ') : null,
          navigateTo: `/project/${p.id}`,
          daysSinceEvent: differenceInDays(today, new Date(eventDate)),
        });
      }
    });

    largeProjects.forEach(lp => {
      const eventDate = lp.end_date ?? lp.start_date;
      if (lp.status !== 'completed' && eventDate && eventDate < todayStr) {
        items.push({
          id: lp.id,
          name: lp.name,
          type: 'large',
          eventDate,
          subtitle: lp.location ?? null,
          navigateTo: `/large-project/${lp.id}`,
          daysSinceEvent: differenceInDays(today, new Date(eventDate)),
        });
      }
    });

    return items.sort((a, b) => a.daysSinceEvent - b.daysSinceEvent);
  }, [jobs, projects, largeProjects, todayStr, today]);

  if (closingItems.length === 0) return null;

  const formatDate = (dateStr: string) => {
    try { return format(new Date(dateStr), 'd MMM yyyy', { locale: sv }); }
    catch { return dateStr; }
  };

  const urgencyClass = (days: number) => {
    if (days > 14) return 'text-destructive font-semibold';
    if (days > 7) return 'text-amber-600 font-medium';
    return 'text-muted-foreground';
  };

  return (
    <Card className="border-amber-200 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-950/10">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-900/30">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            Under slutförande
          </h3>
          <Badge variant="secondary" className="text-[11px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            {closingItems.length}
          </Badge>
          <span className="text-xs text-muted-foreground ml-auto">
            Eventdatum passerat — bör stängas
          </span>
        </div>

        <div className="divide-y divide-border/40">
          {closingItems.map(item => (
            <div
              key={`closing-${item.type}-${item.id}`}
              onClick={() => navigate(item.navigateTo)}
              className="group flex items-center gap-3 py-2.5 px-1 cursor-pointer hover:bg-amber-100/40 dark:hover:bg-amber-900/20 rounded-md transition-colors"
            >
              <Badge className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md ${TYPE_BADGE_CLASSES[item.type]}`}>
                {TYPE_LABELS[item.type]}
              </Badge>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-foreground">{item.name}</p>
                {item.subtitle && (
                  <p className="text-[11px] text-muted-foreground truncate">{item.subtitle}</p>
                )}
              </div>

              <div className="shrink-0 text-right">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {formatDate(item.eventDate)}
                </div>
                <p className={`text-[11px] ${urgencyClass(item.daysSinceEvent)}`}>
                  {item.daysSinceEvent} {item.daysSinceEvent === 1 ? 'dag' : 'dagar'} sedan
                </p>
              </div>

              <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary/50 transition-colors shrink-0" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default ClosingProjectsList;
