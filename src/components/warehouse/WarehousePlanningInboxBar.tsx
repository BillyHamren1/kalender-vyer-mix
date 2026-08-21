import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Inbox, Layers, Package, X } from 'lucide-react';
import { fetchInbox, dismissInboxItem } from '@/services/warehouseProjectService';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { ConvertInboxDialog } from './ConvertInboxDialog';
import { WarehouseProjectInboxItem } from '@/types/warehouseProject';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  initialRows?: number;
}

/** Canonical incoming warehouse needs, embedded directly in manager OPS surfaces. */
export const WarehousePlanningInboxBar: React.FC<Props> = ({ className, initialRows = 3 }) => {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<WarehouseProjectInboxItem | null>(null);

  useRealtimeInvalidation({
    channelName: 'warehouse-planning-inbox-realtime',
    tables: ['warehouse_project_inbox'],
    queryKeys: [['warehouse-project-inbox']],
  });

  const { data, isError } = useQuery({
    queryKey: ['warehouse-project-inbox'],
    queryFn: () => fetchInbox('new'),
    retry: 1,
  });

  const items: WarehouseProjectInboxItem[] = isError ? [] : (data ?? []);
  const visible = expanded ? items : items.slice(0, initialRows);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try { return format(new Date(dateStr), 'd MMM', { locale: sv }); }
    catch { return dateStr; }
  };

  const handleDismiss = async (id: string) => {
    setBusyId(id);
    try {
      await dismissInboxItem(id);
      await queryClient.invalidateQueries({ queryKey: ['warehouse-project-inbox'] });
      toast.success('Avfärdat');
    } catch (err) {
      console.error(err);
      toast.error('Kunde inte avfärda');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={cn('shrink-0 rounded-lg border border-border/60 bg-card overflow-hidden', className)}>
      <div className={cn('h-8 px-2.5 flex items-center gap-2', items.length > 0 ? 'bg-amber-50/70' : 'bg-muted/20')}>
        <Inbox className={cn('h-3.5 w-3.5', items.length ? 'text-amber-700' : 'text-muted-foreground')} />
        <span className="text-xs font-bold text-foreground uppercase tracking-wide">Nytt / Att planera</span>
        <Badge variant="outline" className={cn('h-4 px-1.5 text-[10px]', items.length && 'border-amber-300 bg-amber-100/70 text-amber-800')}>{items.length}</Badge>
        {items.length === 0 && (
          <span className="text-[10px] text-muted-foreground">{isError ? 'Kunde inte hämta lagerbehov' : 'Inga nya lagerbehov'}</span>
        )}
        {items.length > initialRows && (
          <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-[10px]" onClick={() => setExpanded(v => !v)}>
            {expanded ? 'Färre' : `Alla ${items.length}`}
          </Button>
        )}
      </div>

      {visible.length > 0 && (
        <div className={cn('divide-y divide-border/40', expanded && 'max-h-52 overflow-y-auto')}>
          {visible.map((item) => {
            const isLarge = item.source_type === 'large_project';
            const isBooking = item.source_type === 'booking';
            const date = formatDate(item.event_date);
            return (
              <div key={item.id} className="min-h-8 px-2.5 grid grid-cols-[18px_100px_minmax(160px,1fr)_90px_90px_72px_26px] items-center gap-2 text-[11px] hover:bg-accent/25">
                {isLarge ? <Layers className="w-3 h-3 text-primary" /> : <Package className="w-3 h-3 text-muted-foreground" />}
                <span className="font-mono font-semibold truncate">{item.source_project_number || '—'}</span>
                <span className="font-medium truncate">{item.client_name || 'Okänt lagerbehov'}</span>
                <span className="text-muted-foreground truncate">{isLarge ? 'Stort projekt' : isBooking ? 'Bokning' : 'Projekt'}</span>
                <span className="text-muted-foreground whitespace-nowrap">{date ? `Event ${date}` : 'Datum saknas'}</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] font-semibold text-amber-800 hover:bg-amber-100" disabled={busyId === item.id} onClick={() => setActiveItem(item)}>
                  Planera
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive" title="Avfärda" disabled={busyId === item.id} onClick={() => handleDismiss(item.id)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <ConvertInboxDialog
        item={activeItem}
        open={!!activeItem}
        onOpenChange={(o) => !o && setActiveItem(null)}
        onSuccess={async () => {
          await queryClient.invalidateQueries({ queryKey: ['warehouse-project-inbox'] });
          await queryClient.invalidateQueries({ queryKey: ['warehouse-projects'] });
          await queryClient.invalidateQueries({ queryKey: ['warehouse-ops-range'] });
        }}
      />
    </div>
  );
};

export default WarehousePlanningInboxBar;
