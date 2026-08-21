import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, Inbox, Layers, Package, RefreshCw, X } from 'lucide-react';
import { differenceInDays, format, isPast } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { PackingWithBooking } from '@/types/packing';
import type { WarehouseProjectInboxItem } from '@/types/warehouseProject';
import PackingChangedList, { useChangedPackings } from '@/components/packing/PackingChangedList';
import { fetchInbox, dismissInboxItem } from '@/services/warehouseProjectService';
import { ConvertInboxDialog } from '@/components/warehouse/ConvertInboxDialog';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { toast } from 'sonner';

interface Props {
  packings: PackingWithBooking[];
}

const PREVIEW = 5;

const formatInboxEventDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, 'd MMM', { locale: sv });
};

/**
 * "Kräver åtgärd" i Lager OPS.
 * - Inga KPI-kort eller kategori-kort: bara rader med konkret problem + åtgärd.
 * - Sektionen renderas inte alls när ingenting kräver åtgärd.
 * - En packning visas i EN grupp (ändrad > försenad > kommande).
 */
const OpsActionRequired: React.FC<Props> = ({ packings }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeInboxItem, setActiveInboxItem] = useState<WarehouseProjectInboxItem | null>(null);
  const [busyInboxId, setBusyInboxId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useRealtimeInvalidation({
    channelName: 'warehouse-ops-action-required',
    tables: ['warehouse_project_inbox'],
    queryKeys: [['warehouse-project-inbox']],
  });

  const { data: inboxItems = [], isError: inboxError } = useQuery({
    queryKey: ['warehouse-project-inbox'],
    queryFn: () => fetchInbox('new'),
    retry: 1,
  });

  const { data: changed = [] } = useChangedPackings();
  const changedIds = useMemo(() => new Set(changed.map((c: { id: string }) => c.id)), [changed]);

  const { overdue, upcoming } = useMemo(() => {
    const overdueList = packings
      .filter(p => {
        if (changedIds.has(p.id)) return false;
        if (p.status === 'completed' || p.status === 'delivered') return false;
        if (!p.booking?.rigdaydate) return false;
        return isPast(new Date(p.booking.rigdaydate));
      })
      .sort((a, b) => new Date(b.booking!.rigdaydate!).getTime() - new Date(a.booking!.rigdaydate!).getTime());

    const overdueIds = new Set(overdueList.map(p => p.id));

    const upcomingList = packings
      .filter(p => {
        if (changedIds.has(p.id) || overdueIds.has(p.id)) return false;
        if (p.status === 'completed' || p.status === 'delivered') return false;
        if (!p.booking?.rigdaydate) return false;
        const days = differenceInDays(new Date(p.booking.rigdaydate), new Date());
        return days >= 0 && days <= 7;
      })
      .sort((a, b) => new Date(a.booking!.rigdaydate!).getTime() - new Date(b.booking!.rigdaydate!).getTime());

    return { overdue: overdueList, upcoming: upcomingList };
  }, [packings, changedIds]);

  const total = inboxItems.length + changed.length + overdue.length + upcoming.length;

  if (total === 0) return null;

  const handleDismissInbox = async (id: string) => {
    setBusyInboxId(id);
    try {
      await dismissInboxItem(id);
      await queryClient.invalidateQueries({ queryKey: ['warehouse-project-inbox'] });
      toast.success('Avfärdat');
    } catch (error) {
      console.error(error);
      toast.error('Kunde inte avfärda');
    } finally {
      setBusyInboxId(null);
    }
  };

  const limitFor = (key: string, count: number) => (expanded[key] ? count : PREVIEW);

  const showAllRow = (key: string, count: number, shown: number) =>
    count > shown ? (
      <button
        className="w-full text-left py-2 text-xs font-medium text-primary hover:underline"
        onClick={() => setExpanded(e => ({ ...e, [key]: true }))}
      >
        Visa alla {count} →
      </button>
    ) : null;

  const Group: React.FC<{ icon: React.ElementType; tone: string; title: string; count: number; children: React.ReactNode }> = ({
    icon: Icon, tone, title, count, children,
  }) => (
    <div className="px-5 py-3 border-t border-border/30 first:border-t-0">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-3.5 w-3.5 ${tone}`} />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">({count})</span>
      </div>
      {children}
    </div>
  );

  const renderPackingRows = (
    key: string,
    list: PackingWithBooking[],
    problem: (p: PackingWithBooking) => string,
    actionLabel: string,
  ) => {
    const visible = list.slice(0, limitFor(key, list.length));
    return (
      <div className="divide-y divide-border/30">
        {visible.map(p => (
          <div key={p.id} className="flex items-center gap-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{p.booking?.client || p.name}</span>
                {p.booking?.booking_number && (
                  <span className="text-[11px] font-mono text-muted-foreground/70 shrink-0">#{p.booking.booking_number}</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{problem(p)}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-xs shrink-0"
              onClick={() => navigate(`/warehouse/packing/${p.id}`)}
            >
              {actionLabel}
            </Button>
          </div>
        ))}
        {showAllRow(key, list.length, visible.length)}
      </div>
    );
  };

  const visibleInbox = inboxItems.slice(0, limitFor('new', inboxItems.length));

  return (
    <section className="mb-6 rounded-2xl border border-border/40 bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border/30 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warehouse" />
        <h2 className="text-sm font-semibold text-[hsl(var(--heading))]">Kräver åtgärd</h2>
        <span className="text-xs text-muted-foreground">{total} poster</span>
      </div>

      {inboxError && (
        <p className="px-5 py-3 text-sm text-destructive">Kunde inte hämta nya lagerbehov.</p>
      )}

      {inboxItems.length > 0 && (
        <Group icon={Inbox} tone="text-warehouse" title="Nytt lagerjobb" count={inboxItems.length}>
          <div className="divide-y divide-border/30">
            {visibleInbox.map(item => {
              const isLarge = item.source_type === 'large_project';
              const eventDate = formatInboxEventDate(item.event_date);
              return (
                <div key={item.id} className="flex items-center gap-3 py-2.5">
                  {isLarge
                    ? <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                    : <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{item.client_name || 'Okänt lagerbehov'}</span>
                      {item.source_project_number && (
                        <span className="text-[11px] font-mono text-muted-foreground/70 shrink-0">#{item.source_project_number}</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {eventDate ? `Event ${eventDate} · behöver lagerplaneras` : 'Behöver lagerplaneras'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-3 text-xs"
                      disabled={busyInboxId === item.id}
                      onClick={() => setActiveInboxItem(item)}
                    >
                      Planera
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive"
                      title="Avfärda"
                      disabled={busyInboxId === item.id}
                      onClick={() => handleDismissInbox(item.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {showAllRow('new', inboxItems.length, visibleInbox.length)}
          </div>
        </Group>
      )}

      {changed.length > 0 && (
        <Group icon={RefreshCw} tone="text-amber-600" title="Ändrad packning — granska" count={changed.length}>
          <PackingChangedList
            limit={limitFor('changed', changed.length)}
            onShowAll={() => setExpanded(e => ({ ...e, changed: true }))}
          />
        </Group>
      )}

      {overdue.length > 0 && (
        <Group icon={AlertTriangle} tone="text-destructive" title="Försenad packning" count={overdue.length}>
          {renderPackingRows(
            'overdue',
            overdue,
            p => {
              const days = Math.abs(differenceInDays(new Date(p.booking!.rigdaydate!), new Date()));
              return `${days} ${days === 1 ? 'dag' : 'dagar'} försenad · rigg ${format(new Date(p.booking!.rigdaydate!), 'd MMM yyyy', { locale: sv })}`;
            },
            'Öppna',
          )}
        </Group>
      )}

      {upcoming.length > 0 && (
        <Group icon={Clock} tone="text-warehouse" title="Kommande — packning ej klar" count={upcoming.length}>
          {renderPackingRows(
            'upcoming',
            upcoming,
            p => {
              const days = differenceInDays(new Date(p.booking!.rigdaydate!), new Date());
              return `Packning ej klar · rigg om ${days} ${days === 1 ? 'dag' : 'dagar'}`;
            },
            'Planera packning',
          )}
        </Group>
      )}

      <ConvertInboxDialog
        item={activeInboxItem}
        open={!!activeInboxItem}
        onOpenChange={(open) => !open && setActiveInboxItem(null)}
        onSuccess={async () => {
          await queryClient.invalidateQueries({ queryKey: ['warehouse-project-inbox'] });
          await queryClient.invalidateQueries({ queryKey: ['warehouse-projects'] });
          await queryClient.invalidateQueries({ queryKey: ['packings'] });
        }}
      />
    </section>
  );
};

export default OpsActionRequired;
