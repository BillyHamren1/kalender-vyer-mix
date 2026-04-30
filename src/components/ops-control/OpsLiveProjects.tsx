import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity,
  Camera,
  MessageCircle,
  Receipt,
  ChevronRight,
  MapPin,
  User,
  Radio,
  PackageCheck,
  Truck,
  PackageOpen,
  RotateCcw,
  Package,
} from 'lucide-react';
import { format, parseISO, isToday, formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { LivePackingItem, LivePackingActivityCounts, LivePackingStatus } from '@/services/livePackingFeedService';

interface Props {
  items: LivePackingItem[];
  counts: Record<string, LivePackingActivityCounts>;
  pulseIds: Set<string>;
  isLoading: boolean;
  markSeen: (packingId: string) => void;
}

type FilterKey = 'all' | 'outbound' | 'production' | 'inbound';

const STATUS_META: Record<
  LivePackingStatus,
  { label: string; icon: typeof Package; dot: string; chip: string; group: 'outbound' | 'production' | 'inbound' }
> = {
  in_progress: {
    label: 'Pågående',
    icon: Package,
    dot: 'bg-amber-500',
    chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    group: 'outbound',
  },
  packed: {
    label: 'Slutförd (UT)',
    icon: PackageCheck,
    dot: 'bg-teal-500',
    chip: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30',
    group: 'outbound',
  },
  delivered: {
    label: 'I produktion',
    icon: Truck,
    dot: 'bg-violet-500',
    chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
    group: 'production',
  },
  back: {
    label: 'Tillbaka',
    icon: PackageOpen,
    dot: 'bg-orange-500',
    chip: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
    group: 'inbound',
  },
  returning: {
    label: 'Påbörjad (IN)',
    icon: RotateCcw,
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    group: 'inbound',
  },
};

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Alla' },
  { key: 'outbound', label: 'UT-flöde' },
  { key: 'production', label: 'I produktion' },
  { key: 'inbound', label: 'IN-flöde' },
];

const OpsLiveProjects = ({ items, counts, pulseIds, isLoading, markSeen }: Props) => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter(i => STATUS_META[i.status]?.group === filter);
  }, [items, filter]);

  const handleRowClick = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
    markSeen(id);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Live projekt</div>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
          <Activity className="w-3 h-3" />
          <span>Live projekt — {items.length} aktiva</span>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1 mb-2 shrink-0">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
              filter === f.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-transparent text-muted-foreground border-border hover:bg-muted/60'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center">Inga aktiva projekt just nu</div>
      ) : (
        <div className="space-y-0.5 overflow-y-auto flex-1">
          {filtered.map(item => {
            const meta = STATUS_META[item.status];
            const Icon = meta.icon;
            const c = counts[item.id] || { files: 0, expenses: 0, comments: 0, invoices: 0, total: 0, lastEventAt: null };
            const isPulsing = pulseIds.has(item.id);
            const isExpanded = expandedId === item.id;
            const dateRange = formatDateRange(item.start_date, item.end_date);
            const updated = parseISO(item.updated_at);

            return (
              <div
                key={item.id}
                className={`rounded-lg border-l-2 transition-all ${
                  isPulsing ? 'border-l-primary bg-primary/5 animate-pulse' : 'border-l-transparent'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleRowClick(item.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 cursor-pointer text-left"
                >
                  {/* Status dot + icon */}
                  <div className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
                  <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

                  {/* Title + sub */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">
                      {item.booking_number ? `#${item.booking_number} ` : ''}
                      {item.client_name || item.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">
                        {item.delivery_city || item.delivery_address || 'Ingen adress'}
                      </span>
                      {dateRange && (
                        <>
                          <span className="opacity-50">·</span>
                          <span>{dateRange}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Activity counters */}
                  <div className="flex items-center gap-1 shrink-0">
                    {c.files > 0 && (
                      <span className="flex items-center gap-0.5 text-[9px] font-medium text-violet-600 bg-violet-500/10 rounded px-1 py-0.5">
                        <Camera className="w-2.5 h-2.5" />
                        {c.files}
                      </span>
                    )}
                    {c.expenses + c.invoices > 0 && (
                      <span className="flex items-center gap-0.5 text-[9px] font-medium text-emerald-600 bg-emerald-500/10 rounded px-1 py-0.5">
                        <Receipt className="w-2.5 h-2.5" />
                        {c.expenses + c.invoices}
                      </span>
                    )}
                    {c.comments > 0 && (
                      <span className="flex items-center gap-0.5 text-[9px] font-medium text-primary bg-primary/10 rounded px-1 py-0.5">
                        <MessageCircle className="w-2.5 h-2.5" />
                        {c.comments}
                      </span>
                    )}
                    {isPulsing && <Radio className="w-3 h-3 text-primary animate-pulse" />}
                  </div>

                  {/* Status chip */}
                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0 border ${meta.chip}`}>
                    {meta.label}
                  </span>

                  <ChevronRight
                    className={`w-3 h-3 text-muted-foreground shrink-0 transition-transform ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {/* Expanded actions */}
                {isExpanded && (
                  <div className="px-2 pb-2 pt-0.5 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    {item.project_leader && (
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <User className="w-2.5 h-2.5" />
                        <span className="font-medium text-foreground">Projektledare:</span>
                        <span>{item.project_leader}</span>
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground">
                      Senast uppdaterad{' '}
                      {isToday(updated)
                        ? format(updated, 'HH:mm')
                        : formatDistanceToNow(updated, { locale: sv, addSuffix: true })}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <button
                        type="button"
                        className="text-[10px] font-medium px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/warehouse/packing/${item.id}`);
                        }}
                      >
                        Öppna packning
                      </button>
                      {item.large_project_id ? (
                        <button
                          type="button"
                          className="text-[10px] font-medium px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/large-project/${item.large_project_id}`);
                          }}
                        >
                          Öppna projekt
                        </button>
                      ) : item.booking_id ? (
                        <button
                          type="button"
                          className="text-[10px] font-medium px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/booking/${item.booking_id}`);
                          }}
                        >
                          Öppna bokning
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  const fmt = (d: string) => format(parseISO(d), 'd/M');
  if (start && end && start !== end) return `${fmt(start)}–${fmt(end)}`;
  return fmt((start || end)!);
}

export default OpsLiveProjects;
