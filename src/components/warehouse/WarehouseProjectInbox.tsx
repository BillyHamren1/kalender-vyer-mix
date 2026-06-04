import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Inbox, Calendar, Layers, Package, X } from 'lucide-react';
import {
  fetchInbox,
  dismissInboxItem,
} from '@/services/warehouseProjectService';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { ConvertInboxDialog } from './ConvertInboxDialog';
import { WarehouseProjectInboxItem } from '@/types/warehouseProject';

interface WarehouseProjectInboxProps {
  search?: string;
}

export const WarehouseProjectInbox: React.FC<WarehouseProjectInboxProps> = ({ search }) => {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<WarehouseProjectInboxItem | null>(null);

  useRealtimeInvalidation({
    channelName: 'warehouse-project-inbox-realtime',
    tables: ['warehouse_project_inbox'],
    queryKeys: [['warehouse-project-inbox']],
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['warehouse-project-inbox'],
    queryFn: () => fetchInbox('new'),
  });

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

  const q = (search ?? '').trim().toLowerCase();
  const visible = q
    ? items.filter(i =>
        (i.client_name ?? '').toLowerCase().includes(q) ||
        (i.source_project_number ?? '').toLowerCase().includes(q))
    : items;

  if (isLoading) return null;
  if (items.length === 0) return null;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'd MMM yyyy', { locale: sv });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-border/40 bg-amber-50/30 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber-500/10">
            <Inbox className="h-4 w-4 text-amber-600" />
          </div>
          <h3 className="font-semibold text-sm text-foreground">Nya projekt från Planning</h3>
        </div>
        <Badge className="h-5 px-2 text-xs font-medium bg-amber-100 text-amber-800 border-0">
          {items.length} nya
        </Badge>
      </div>

      <div className="divide-y divide-border/30">
        {items.map((item) => {
          const isBusy = busyId === item.id;
          const isLarge = item.source_type === 'large_project';
          return (
            <div
              key={item.id}
              className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {isLarge ? (
                    <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                  ) : (
                    <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  )}
                  <h4 className="text-sm font-medium truncate text-foreground">
                    {item.client_name || 'Okänt projekt'}
                  </h4>
                  {item.source_project_number && (
                    <span className="text-[10px] text-muted-foreground/70 font-mono shrink-0">
                      #{item.source_project_number}
                    </span>
                  )}
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">
                    {isLarge ? 'Stort projekt' : 'Projekt'}
                  </Badge>
                </div>
                {item.event_date && (
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground ml-5">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(item.event_date)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveItem(item)}
                  disabled={isBusy}
                  className="h-7 px-2 text-xs gap-1 hover:bg-primary/10 hover:text-primary"
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Skapa lagerprojekt</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDismiss(item.id)}
                  disabled={isBusy}
                  className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive"
                  title="Avfärda"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

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
    </div>
  );
};

export default WarehouseProjectInbox;
