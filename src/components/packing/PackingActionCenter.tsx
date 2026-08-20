import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, RefreshCw, Inbox, Layers, Package, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, differenceInDays, isPast } from 'date-fns';
import { sv } from 'date-fns/locale';
import { PackingWithBooking } from '@/types/packing';
import type { WarehouseProjectInboxItem } from '@/types/warehouseProject';
import PackingChangedList, { useChangedPackings } from './PackingChangedList';
import { fetchInbox, dismissInboxItem } from '@/services/warehouseProjectService';
import { ConvertInboxDialog } from '@/components/warehouse/ConvertInboxDialog';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { toast } from 'sonner';

type CategoryKey = 'new' | 'changed' | 'urgent' | 'overdue';

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
 * "Kräver åtgärd" — operativ startpunkt på /warehouse/packing.
 * Samlar nya Planning-projekt och befintliga packningar som behöver åtgärd.
 * Ingen kalender-/personalplaneringslogik bor här.
 */
const PackingActionCenter: React.FC<Props> = ({ packings }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [active, setActive] = useState<CategoryKey>('new');
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
        if (p.status === 'completed') return false;
        if (!p.booking?.rigdaydate) return false;
        const days = differenceInDays(new Date(p.booking.rigdaydate), new Date());
        return days >= 0 && days <= 7;
      })
      .sort((a, b) => new Date(a.booking!.rigdaydate!).getTime() - new Date(b.booking!.rigdaydate!).getTime());

    const overdueList = packings
      .filter(p => {
        if (p.status === 'completed' || p.status === 'delivered') return false;
        if (!p.booking?.rigdaydate) return false;
        return isPast(new Date(p.booking.rigdaydate));
      })
      .sort((a, b) => new Date(b.booking!.rigdaydate!).getTime() - new Date(a.booking!.rigdaydate!).getTime());

    return { urgent: urgentList, overdue: overdueList };
  }, [packings]);

  const categories: Array<{ key: CategoryKey; label: string; count: number; icon: React.ElementType; tone: string }> = [
    { key: 'new', label: 'Nya', count: inboxItems.length, icon: Inbox, tone: 'text-warehouse' },
    { key: 'changed', label: 'Ändrade', count: changed.length, icon: RefreshCw, tone: 'text-amber-600' },
    { key: 'urgent', label: 'Brådskande', count: urgent.length, icon: Clock, tone: 'text-warehouse' },
    { key: 'overdue', label: 'Försenade', count: overdue.length, icon: AlertTriangle, tone: 'text-destructive' },
  ];

  const totalActions = categories.reduce((sum, c) => sum + c.count, 0);

  const limitFor = (key: CategoryKey, total: number) => (expanded[key] ? total : key === 'overdue' ? 3 : PREVIEW);

  const showAllRow = (key: CategoryKey, total: number, shown: number) =>
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
    if (inboxItems.length === 0) {
      return <p className="text-sm text-muted-foreground py-3">Inga nya lagerbehov väntar på planering.</p>;
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
        {showAllRow('new', inboxItems.length, visible.length)}
      </div>
    );
  };

  const renderPackingList = (key: CategoryKey, list: PackingWithBooking[], subtitle: (p: PackingWithBooking) => string) => {
    if (list.length === 0) {
      return <p className="text-sm text-muted-foreground py-3">Inget att visa.</p>;
    }
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
              <span className="text-xs text-muted-foreground">{subtitle(p)}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-xs shrink-0"
              onClick={() => navigate(`/warehouse/packing/${p.id}`)}
            >
              Öppna
            </Button>
          </div>
        ))}
        {showAllRow(key, list.length, visible.length)}
      </div>
    );
  };

  return (
    <section className="mb-6 rounded-2xl border border-border/40 bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border/30 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warehouse" />
        <h2 className="text-sm font-semibold text-[hsl(var(--heading))]">Kräver åtgärd</h2>
        <span className="text-xs text-muted-foreground">{totalActions} poster</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3">
        {categories.map(c => {
          const isActive = active === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setActive(c.key)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                isActive ? 'border-primary/50 bg-primary/5' : 'border-border/40 hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <c.icon className={`h-3.5 w-3.5 ${c.tone}`} />
                <span className="text-xs text-muted-foreground font-medium">{c.label}</span>
              </div>
              <p className="text-xl font-bold text-[hsl(var(--heading))]">{c.count}</p>
            </button>
          );
        })}
      </div>

      <div className="px-5 pb-3">
        {active === 'new' && renderInboxList()}
        {active === 'changed' && (
          <PackingChangedList
            limit={limitFor('changed', changed.length)}
            onShowAll={() => setExpanded(e => ({ ...e, changed: true }))}
          />
        )}
        {active === 'urgent' && renderPackingList('urgent', urgent, p => {
          const days = differenceInDays(new Date(p.booking!.rigdaydate!), new Date());
          return `Packning ej klar · rigg om ${days} ${days === 1 ? 'dag' : 'dagar'}`;
        })}
        {active === 'overdue' && renderPackingList('overdue', overdue, p => {
          const days = Math.abs(differenceInDays(new Date(p.booking!.rigdaydate!), new Date()));
          return `${days} dagar försenad · rigg ${format(new Date(p.booking!.rigdaydate!), 'd MMM yyyy', { locale: sv })}`;
        })}
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
