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

const INITIAL_ROWS = 3;

/**
 * Kompakt "Att planera"-yta för Lagerplanering.
 * Återanvänder befintlig inbox-data (fetchInbox), query key ['warehouse-project-inbox']
 * och ConvertInboxDialog. Ingen ny datamodell, ingen backend-ändring.
 * Ligger utanför kalenderkomponenten och får aldrig krascha kalendern.
 */
export const WarehousePlanningInboxBar: React.FC = () => {
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
  const visible = expanded ? items : items.slice(0, INITIAL_ROWS);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), 'd MMM', { locale: sv });
    } catch {
      return dateStr;
    }
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
    <div className="shrink-0 mx-2 mb-2 rounded-xl border border-border/60 bg-card px-3 py-1.5">
      <div className="flex items-center gap-2">
        <Inbox className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">Att planera</span>
        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">{items.length}</Badge>
        {items.length === 0 && (
          <span className="text-[11px] text-muted-foreground">
            {isError ? 'Kunde inte hämta inkommande projekt' : 'Inga projekt väntar på lagerplanering'}
          </span>
        )}
        {items.length > INITIAL_ROWS && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-[11px]"
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? 'Visa färre' : `Visa alla (${items.length})`}
          </Button>
        )}
      </div>

      {visible.length > 0 && (
        <div className={`mt-1 divide-y divide-border/30 ${expanded ? 'max-h-40 overflow-y-auto' : ''}`}>
          {visible.map((item) => {
            const isLarge = item.source_type === 'large_project';
            const date = formatDate(item.event_date);
            return (
              <div key={item.id} className="flex items-center gap-2 py-1">
                {isLarge
                  ? <Layers className="w-3 h-3 text-primary shrink-0" />
                  : <Package className="w-3 h-3 text-muted-foreground shrink-0" />}
                <span className="text-xs font-medium truncate">{item.client_name || 'Okänt projekt'}</span>
                {item.source_project_number && (
                  <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
                    #{item.source_project_number}
                  </span>
                )}
                {date && (
                  <span className="text-[10px] text-muted-foreground shrink-0">Event {date}</span>
                )}
                <div className="ml-auto flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] hover:bg-primary/10 hover:text-primary"
                    disabled={busyId === item.id}
                    onClick={() => setActiveItem(item)}
                  >
                    Planera →
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                    title="Avfärda"
                    disabled={busyId === item.id}
                    onClick={() => handleDismiss(item.id)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
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
        }}
      />
    </div>
  );
};

export default WarehousePlanningInboxBar;
