import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, RefreshCw, Inbox, Layers, Package, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, differenceInDays } from 'date-fns';
import { sv } from 'date-fns/locale';
import { PackingWithBooking } from '@/types/packing';
import type { WarehouseProjectInboxItem } from '@/types/warehouseProject';
import PackingChangedList, { useChangedPackings } from './PackingChangedList';
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
 * Operativ åtgärdslista för Lager OPS.
 * Visar bara verkliga arbetsbehov med en direkt nästa action.
 * Samma packning ska inte visas i flera normala åtgärdsgrupper.
 */
const PackingActionCenter: React.FC<Props> = ({ packings }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeInboxItem, setActiveInboxItem] = useState<WarehouseProjectInboxItem | null>(null);
  const [busyInboxId, setBusyInboxId] = useState<string | null>(null);

  useRealtimeInvalidation({
    channelName: 'packing-action-center-inbox',
    tables: ['warehouse_project_inbox'],
    queryKeys: [['warehouse-project-inbox']],
  });

  const { data: inboxItems = [], isError: inboxError } = useQuery({
    queryKey: ['warehouse-project-inbox'],
    queryFn: () => fetchInbox('new'),
    retry: 1,
  });

  const { data: changed = [] } = useChangedPackings();

  const changedIds = useMemo(() => new Set(changed.map(item => item.id)), [changed]);

  const { urgent, overdue } = useMemo(() => {
    const urgentList = packings
      .filter(p => {
        if (changedIds.has(p.id)) return false;
        if (p.status !== 'planning') return false;
        if (!p.booking?.rigdaydate) return false;
        const days = differenceInDays(new Date(p.booking.rigdaydate), new Date());
        return days >= 0 && days <= 7;
      })
      .sort((a, b) => new Date(a.booking!.rigdaydate!).getTime() - new Date(b.booking!.rigdaydate!).getTime());

    const overdueList = packings
      .filter(p => {
        if (changedIds.has(p.id)) return false;
        if (p.status === 'completed' || p.status === 'delivered') return false;
        if (!p.booking?.rigdaydate) return false;
        return differenceInDays(new Date(p.booking.rigdaydate), new Date()) < 0;
      })
      .sort((a, b) => new Date(a.booking!.rigdaydate!).getTime() - new Date(b.booking!.rigdaydate!).getTime());

    return { urgent: urgentList, overdue: overdueList };
  }, [packings, changedIds]);

  const totalActions = inboxItems.length + changed.length + urgent.length + overdue.length;

  const limitFor = (key: string, total: number) => (expanded[key] ? total : PREVIEW);

  const showAllRow = (key: string, total: number, shown: number) =>
    total > shown ? (
      <button
        className="w-full py-2 text-left text-xs font-medium text-primary hover:underline"
        onClick={() => setExpanded(e => ({ ...e, [key]: true }))}
      >
        Visa alla {total} →
      </button>
    ) : null;

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

  const renderInboxList = () => {
    if (inboxError) {
      return <p className="py-3 text-sm text-destructive">Kunde inte hämta nya lagerbehov.</p>;
    }

    const visible = inboxItems.slice(0, limitFor('new', inboxItems.length));
    return (
      <div className="divide-y divide-border/30">
        {visible.map(item => {
          const isLarge = item.source_type === 'large_project';
          const eventDate = formatInboxEventDate(item.event_date);
          return (
            <div key={item.id} className="flex items-center gap-3 py-2.5">
              {isLarge
                ? <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
                : <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{item.client_name || 'Okänt lagerbehov'}</span>
                  {item.source_project_number && (
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">#{item.source_project_number}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {eventDate ? `Event ${eventDate} · saknar lagerplanering` : 'Saknar lagerplanering'}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  className="h-7 bg-warehouse px-3 text-xs hover:bg-warehouse-hover"
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
        {showAllRow('new', inboxItems.length, visible.length)}
      </div>
    );
  };

  const renderPackingList = (
    key: string,
    list: PackingWithBooking[],
    issue: (p: PackingWithBooking) => string,
    actionLabel: string,
  ) => {
    const visible = list.slice(0, limitFor(key, list.length));
    return (
      <div className="divide-y divide-border/30">
        {visible.map(p => (
          <div key={p.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{p.booking?.client || p.name}</span>
                {p.booking?.booking_number && (
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">#{p.booking.booking_number}</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{issue(p)}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-3 text-xs"
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

  if (totalActions === 0 && !inboxError) return null;

  return (
    <section id="actions" className="mb-5 scroll-mt-4">
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warehouse" />
        <h2 className="text-sm font-semibold text-[hsl(var(--heading))]">Kräver åtgärd</h2>
      </div>

      <div className="divide-y divide-border/40 rounded-xl border border-border/50 bg-card px-4">
        {overdue.length > 0 && (
          <div className="py-2">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> Försenat arbete
            </div>
            {renderPackingList('overdue', overdue, p => {
              const days = Math.abs(differenceInDays(new Date(p.booking!.rigdaydate!), new Date()));
              return `${days} dagar försenad · rigg ${format(new Date(p.booking!.rigdaydate!), 'd MMM yyyy', { locale: sv })}`;
            }, 'Öppna')}
          </div>
        )}

        {changed.length > 0 && (
          <div className="py-2">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-amber-700">
              <RefreshCw className="h-3.5 w-3.5" /> Ändringar att granska
            </div>
            <PackingChangedList
              limit={limitFor('changed', changed.length)}
              onShowAll={() => setExpanded(e => ({ ...e, changed: true }))}
            />
          </div>
        )}

        {(inboxItems.length > 0 || inboxError) && (
          <div className="py-2">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-foreground">
              <Inbox className="h-3.5 w-3.5 text-warehouse" /> Nya jobb att planera
            </div>
            {renderInboxList()}
          </div>
        )}

        {urgent.length > 0 && (
          <div className="py-2">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-foreground">
              <Clock className="h-3.5 w-3.5 text-warehouse" /> Kommande packning som inte är klar
            </div>
            {renderPackingList('urgent', urgent, p => {
              const days = differenceInDays(new Date(p.booking!.rigdaydate!), new Date());
              return days === 0
                ? 'Rigg idag · packning inte klar'
                : `Rigg om ${days} ${days === 1 ? 'dag' : 'dagar'} · packning inte klar`;
            }, 'Planera packning')}
          </div>
        )}
      </div>

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

export default PackingActionCenter;
