import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isSameDay, isToday, parseISO, startOfDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Building2, MapPin, Briefcase, Package, Search } from 'lucide-react';
import type { ScheduledShift } from '@/services/mobileApiService';
import {
  consolidateShifts,
  getItemEnd,
  getItemEventType,
  type MobileCalendarItem,
} from '@/lib/mobileCalendarConsolidation';
import { cn } from '@/lib/utils';
import TeamVehicleLine from '@/components/mobile-app/TeamVehicleLine';
import type { TeamVehicleInfo } from '@/lib/teamVehicles';

/**
 * Aggregerar team_vehicles från alla shifts i ett konsoliderat projekt-item.
 * Dedup på vehicle.id, behåller stabil ordning på namn.
 */
function aggregateItemVehicles(it: MobileCalendarItem): TeamVehicleInfo[] {
  const shifts = it.kind === 'project' ? it.shifts : [it.shift];
  const map = new Map<string, TeamVehicleInfo>();
  for (const s of shifts) {
    for (const v of s.team_vehicles ?? []) {
      if (!map.has(v.id)) map.set(v.id, v);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv'));
}

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

function classifyItem(it: MobileCalendarItem): Kind {
  if (it.kind === 'project') return 'project';
  if (it.shift.is_internal) return 'location';
  return 'booking';
}

function itemStart(it: MobileCalendarItem): string {
  return it.kind === 'project' ? it.start_time : it.shift.start_time;
}
function itemTitle(it: MobileCalendarItem): string {
  return it.kind === 'project' ? it.title : it.shift.title;
}
function itemClient(it: MobileCalendarItem): string | null {
  return it.kind === 'project' ? it.client : it.shift.client;
}
function itemAddress(it: MobileCalendarItem): string | null {
  return it.kind === 'project' ? it.delivery_address : it.shift.delivery_address;
}
function itemBookingNumber(it: MobileCalendarItem): string | null {
  return it.kind === 'project' ? null : (it.shift.booking_number ?? null);
}
function itemLargeProjectName(it: MobileCalendarItem): string | null {
  return it.kind === 'project' ? it.title : (it.shift.large_project_name ?? null);
}

function kindMeta(kind: Kind) {
  switch (kind) {
    case 'project':
      return { label: 'PROJEKT', icon: Briefcase, cls: 'bg-primary-soft text-primary-soft-foreground' };
    case 'location':
      return { label: 'LAGER', icon: Building2, cls: 'bg-accent text-accent-foreground' };
    case 'booking':
    default:
      return { label: 'JOBB', icon: Package, cls: 'bg-muted text-muted-foreground' };
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

  // Consolidate first: large-project sub-bookings on the same day fold into
  // a single "project" item — exactly like the day calendar. Then filter and
  // search on the consolidated items.
  const items = useMemo(() => {
    const today = startOfDay(new Date());
    const q = search.trim().toLowerCase();
    const consolidated = consolidateShifts(shifts);
    return consolidated
      .filter((it) => {
        try {
          const d = startOfDay(parseISO(itemStart(it)));
          if (filter === 'today') return isSameDay(d, today);
          if (filter === 'upcoming') return d.getTime() >= today.getTime();
          return true;
        } catch {
          return false;
        }
      })
      .filter((it) => {
        if (!q) return true;
        const title = itemTitle(it)?.toLowerCase() ?? '';
        const client = itemClient(it)?.toLowerCase() ?? '';
        const addr = itemAddress(it)?.toLowerCase() ?? '';
        const lp = itemLargeProjectName(it)?.toLowerCase() ?? '';
        const bn = itemBookingNumber(it)?.toLowerCase() ?? '';
        return title.includes(q) || client.includes(q) || addr.includes(q) || lp.includes(q) || bn.includes(q);
      })
      .sort((a, b) => itemStart(a).localeCompare(itemStart(b)));
  }, [shifts, filter, search]);

  // Group by ISO date (YYYY-MM-DD)
  const grouped = useMemo(() => {
    const map = new Map<string, MobileCalendarItem[]>();
    for (const it of items) {
      const key = itemStart(it).slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const handleClick = (it: MobileCalendarItem) => {
    if (it.kind === 'project') {
      navigate(`/m/project/${it.largeProjectId}`);
    } else if (it.shift.large_project_id) {
      navigate(`/m/project/${it.shift.large_project_id}`);
    } else {
      navigate(`/m/job/${it.shift.booking_id}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter pill segmented control + search */}
      <div className="space-y-2.5">
        <div className="inline-flex w-full p-1 rounded-2xl bg-primary-soft/60 ring-1 ring-primary/10">
          {(Object.keys(filterLabels) as Filter[]).map((k) => {
            const active = filter === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn(
                  'flex-1 py-1.5 text-[12px] font-semibold rounded-xl transition-all active:scale-[0.97]',
                  active
                    ? 'bg-card text-primary shadow-[0_1px_0_hsl(184_30%_15%/0.04),0_2px_8px_-2px_hsl(184_60%_22%/0.18)]'
                    : 'text-muted-foreground',
                )}
              >
                {filterLabels[k]}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök projekt, kund, adress…"
            className="w-full h-11 pl-10 pr-3.5 rounded-2xl bg-card border border-border/60 text-sm text-foreground placeholder:text-muted-foreground/60 shadow-[0_1px_2px_hsl(184_30%_15%/0.04)] focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 transition"
          />
        </div>
      </div>

      {/* Empty state */}
      {grouped.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/70 bg-card p-8 text-center">
          <p className="text-sm font-semibold text-foreground">Inga jobb att visa</p>
          <p className="text-xs text-muted-foreground mt-1">
            {filter === 'today' && 'Inget planerat idag.'}
            {filter === 'upcoming' && 'Inga kommande jobb.'}
            {filter === 'all' && 'Inga jobb hittades.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([dateKey, dayShifts]) => {
            const date = parseISO(dateKey);
            return (
              <section key={dateKey}>
                <h3
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-[0.14em] mb-2 px-1',
                    isToday(date) ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {fmtDateHeader(date)}
                </h3>
                <div className="space-y-2.5">
                  {dayShifts.map((it) => {
                    const kind = classifyItem(it);
                    const meta = kindMeta(kind);
                    const Icon = meta.icon;
                    const phase = eventTypeLabel(getItemEventType(it));
                    const projectOrTitle = itemTitle(it);
                    const client = itemClient(it);
                    const address = itemAddress(it);
                    const subBookingCount = it.kind === 'project' ? it.shifts.length : 0;
                    return (
                      <button
                        key={it.key}
                        type="button"
                        onClick={() => handleClick(it)}
                        className="w-full text-left rounded-[22px] border border-border/60 bg-card p-4 shadow-[0_1px_2px_hsl(184_30%_15%/0.04),0_4px_12px_-6px_hsl(184_60%_22%/0.12)] active:scale-[0.99] active:shadow-[0_1px_2px_hsl(184_30%_15%/0.04)] transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            <span
                              className={cn(
                                'shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] tracking-[0.08em] font-bold',
                                meta.cls,
                              )}
                            >
                              <Icon className="w-3 h-3" />
                              {meta.label}
                            </span>
                            {phase && (
                              <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-muted text-muted-foreground">
                                {phase}
                              </span>
                            )}
                            {subBookingCount > 1 && (
                              <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-primary-soft text-primary-soft-foreground">
                                {subBookingCount} bokningar
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-xs font-mono tabular-nums font-semibold text-foreground/90 pt-0.5">
                            {fmtTimeRange(itemStart(it), getItemEnd(it))}
                          </span>
                        </div>

                        <h4 className="font-bold text-foreground text-[15px] leading-snug mt-2 truncate">
                          {projectOrTitle}
                        </h4>
                        {client && client !== projectOrTitle && (
                          <p className="text-[12px] text-muted-foreground truncate mt-0.5">{client}</p>
                        )}

                        {address && (
                          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground mt-2">
                            <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
                            <span className="truncate">{address}</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MobileJobListView;
