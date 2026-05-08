import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isSameDay, isToday, parseISO, startOfDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Building2, MapPin, Briefcase, Package, Search } from 'lucide-react';
import type { ScheduledShift } from '@/services/mobileApiService';
import { cn } from '@/lib/utils';

/* =====================================================================
 * MobileJobListView
 * ---------------------------------------------------------------------
 * En kronologisk listvy över personalens jobb. Grupperade per datum.
 * Inkluderar:
 *   - schemalagda shifts (ScheduledShift) — inkl. fasta lokationer som
 *     redan är synliga som jobb i mobilkalendern (de mappas till samma
 *     ScheduledShift-källa via mobileApi.getBookings).
 *
 * Read-only: klick öppnar jobbdetaljen. Aldrig timerstyrning här —
 * timer hanteras endast i WorkDayPanel.
 * ===================================================================== */

type Filter = 'today' | 'upcoming' | 'all';
type Kind = 'project' | 'location' | 'booking';

interface Props {
  shifts: ScheduledShift[];
  fixedLocations?: Array<{ id: string; name: string; address: string | null }>;
}

const filterLabels: Record<Filter, string> = {
  today: 'Idag',
  upcoming: 'Kommande',
  all: 'Alla',
};

function classifyShift(s: ScheduledShift): Kind {
  if (s.large_project_id) return 'project';
  if (s.is_internal) return 'location';
  return 'booking';
}

function kindMeta(kind: Kind) {
  switch (kind) {
    case 'project':
      return { label: 'PROJEKT', icon: Briefcase, cls: 'bg-primary/10 text-primary border-primary/30' };
    case 'location':
      return { label: 'LAGER', icon: Building2, cls: 'bg-accent/50 text-accent-foreground border-accent/30' };
    case 'booking':
    default:
      return { label: 'JOBB', icon: Package, cls: 'bg-muted text-muted-foreground border-border' };
  }
}

function eventTypeLabel(t: ScheduledShift['event_type']): string {
  switch (t) {
    case 'rig': return 'Rigg';
    case 'event': return 'Event';
    case 'rigdown': return 'Rigdown';
    default: return '';
  }
}

function fmtTimeRange(startIso: string, endIso: string): string {
  try {
    return `${format(parseISO(startIso), 'HH:mm')} – ${format(parseISO(endIso), 'HH:mm')}`;
  } catch {
    return '';
  }
}

function fmtDateHeader(d: Date): string {
  const today = startOfDay(new Date());
  const day = startOfDay(d);
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  const base = format(d, 'EEEE d MMM', { locale: sv });
  if (diffDays === 0) return `Idag · ${base}`;
  if (diffDays === 1) return `Imorgon · ${base}`;
  if (diffDays === -1) return `Igår · ${base}`;
  return base;
}

const MobileJobListView = ({ shifts }: Props) => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [search, setSearch] = useState('');

  const items = useMemo(() => {
    const today = startOfDay(new Date());
    const q = search.trim().toLowerCase();
    return shifts
      .filter((s) => {
        try {
          const d = startOfDay(parseISO(s.start_time));
          if (filter === 'today') return isSameDay(d, today);
          if (filter === 'upcoming') return d.getTime() >= today.getTime();
          return true;
        } catch {
          return false;
        }
      })
      .filter((s) => {
        if (!q) return true;
        return (
          s.title?.toLowerCase().includes(q) ||
          s.client?.toLowerCase().includes(q) ||
          s.delivery_address?.toLowerCase().includes(q) ||
          s.large_project_name?.toLowerCase().includes(q) ||
          s.booking_number?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [shifts, filter, search]);

  // Group by ISO date (YYYY-MM-DD)
  const grouped = useMemo(() => {
    const map = new Map<string, ScheduledShift[]>();
    for (const s of items) {
      const key = s.start_time.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const handleClick = (s: ScheduledShift) => {
    if (s.large_project_id) {
      navigate(`/m/project/${s.large_project_id}`);
    } else {
      navigate(`/m/job/${s.booking_id}`);
    }
  };

  return (
    <div className="space-y-3">
      {/* Filter + search */}
      <div className="space-y-2">
        <div className="inline-flex w-full p-1 rounded-xl bg-muted border border-border">
          {(Object.keys(filterLabels) as Filter[]).map((k) => {
            const active = filter === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn(
                  'flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95',
                  active
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {filterLabels[k]}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök projekt, kund, adress…"
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* Empty state */}
      {grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
          <p className="text-sm font-semibold text-foreground">Inga jobb att visa</p>
          <p className="text-xs text-muted-foreground mt-1">
            {filter === 'today' && 'Inget planerat idag.'}
            {filter === 'upcoming' && 'Inga kommande jobb.'}
            {filter === 'all' && 'Inga jobb hittades.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([dateKey, dayShifts]) => {
            const date = parseISO(dateKey);
            return (
              <div key={dateKey}>
                <h3
                  className={cn(
                    'text-[11px] font-bold uppercase tracking-widest mb-1.5 px-1',
                    isToday(date) ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {fmtDateHeader(date)}
                </h3>
                <div className="space-y-2">
                  {dayShifts.map((s) => {
                    const kind = classifyShift(s);
                    const meta = kindMeta(kind);
                    const Icon = meta.icon;
                    const phase = eventTypeLabel(s.event_type);
                    const projectOrTitle = s.large_project_name || s.title;
                    return (
                      <button
                        key={s.shift_id}
                        type="button"
                        onClick={() => handleClick(s)}
                        className="w-full text-left rounded-2xl border border-border bg-card p-3.5 shadow-sm active:opacity-80 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={cn(
                                'shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] tracking-wide font-bold border',
                                meta.cls,
                              )}
                            >
                              <Icon className="w-3 h-3" />
                              {meta.label}
                            </span>
                            {phase && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide border border-border bg-muted text-muted-foreground">
                                {phase}
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-xs font-mono tabular-nums text-foreground">
                            {fmtTimeRange(s.start_time, s.end_time)}
                          </span>
                        </div>

                        <h4 className="font-bold text-foreground text-[15px] leading-snug mt-1.5 truncate">
                          {projectOrTitle}
                        </h4>
                        {s.client && s.client !== projectOrTitle && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{s.client}</p>
                        )}

                        {s.delivery_address && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5">
                            <MapPin className="w-3 h-3 shrink-0 text-muted-foreground/60" />
                            <span className="truncate">{s.delivery_address}</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MobileJobListView;
