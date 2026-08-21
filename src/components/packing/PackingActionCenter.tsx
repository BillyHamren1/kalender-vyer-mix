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
 * Inga KPI-kort, kategori-rutor eller sammanfattningsstatistik.
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

  const { urgent, overdue } = useMemo(() => {
    const urgentList = packings
      .filter(p => {
        if (p.status === 'completed' || p.status === 'delivered') return false;
        if (!p.booking?.rigdaydate) return false;
        const days = differenceInDays(new Date(p.booking.rigdaydate), new Date());
        return days >= 0 && days <= 7;
      })
      .sort((a, b) => new Date(a.booking!.rigdaydate!).getTime() - new Date(b.booking!.rigdaydate!).getTime());

    const overdueList = packings
      .filter(p => {
        if (p.status === 'completed' || p.status === 'delivered') return false;
        if (!p.booking?.rigdaydate) return false;
        return differenceInDays(new Date(p.booking.rigdaydate), new Date()) < 0;
      })
      .sort((a, b) => new Date(a.booking!.rigdaydate!).getTime() - new Date(b.booking!.rigdaydate!).getTime());

    return { urgent: urgentList, overdue: overdueList };
  }, [packings]);

  const totalActions = inboxItems.length + changed.length + urgent.length + overdue.length;

  const limitFor = (key: string, total: number) => (expanded[key] ? total : PREVIEW);

  const showAllRow = (key: string, total: number, shown: number) =>
    total > shown ? (
      <button
        className="w-full text-left py-2 text-xs font-medium text-primary hover:underline"
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
      return <p className="text-sm text-destructive py-3">Kunde inte hämta nya lagerbehov.</p>;
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
                  {eventDate ? `Event ${eventDate} · saknar lagerplanering` : 'Saknar lagerplanering'}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs bg-warehouse hover:bg-warehouse-hover"
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
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{p.booking?.client || p.name}</span>
                {p.booking?.booking_number && (
                  <span className="text-[11px] font-mono text-muted-foreground/70 shrink-0">#{p.booking.booking_number}</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{issue(p)}</span>
            </div>
            <Button
              variant="outline"
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

  if (totalActions === 0 && !inboxError) {
    return (
      <section className="mb-6 border-b border-border/40 pb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-warehouse" />
          Inget kräver åtgärd just nu.
        </div>
      </section>
    );
  }

  return (
    <section id="actions" className="mb-6 scroll-mt-4">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-warehouse" />
        <h2 className="text-sm font-semibold text-[hsl(var(--heading))]">Kräver åtgärd</h2>
      </div>

      <div className="rounded-xl border border-border/50 bg-card px-4 divide-y divide-border/40">
        {overdue.length > 0 && (
          <div className="py-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-destructive mb-1">
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
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 mb-1">
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
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground mb-1">
              <Inbox className="h-3.5 w-3.5 text-warehouse" /> Nya jobb att planera
            </div>
            {renderInboxList()}
          </div>
        )}

        {urgent.length > 0 && (
          <div className="py-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground mb-1">
              <Clock className="h-3.5 w-3.5 text-warehouse" /> Kommande packning som inte är klar
            </div>
            {renderPackingList('urgent', urgent, p => {
              const days = differenceInDays(new Date(p.booking!.rigdaydate!), new Date());
              return days === 0 ? 'Rigg idag · packning inte klar' : `Rigg om ${days} ${days === 1 ? 'dag' : 'dagar'} · packning inte klar`;
            }, 'Fortsätt')}
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
