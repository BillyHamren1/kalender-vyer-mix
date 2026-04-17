import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  fetchWarehouseChanges,
  acknowledgeWarehouseChange,
  acknowledgeAllForProject,
} from '@/services/warehouseProjectChangesService';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { WarehouseChangeRow } from './WarehouseChangeRow';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface Props {
  warehouseProjectId: string;
}

export const WarehouseProjectChangesTab: React.FC<Props> = ({ warehouseProjectId }) => {
  const queryClient = useQueryClient();

  useRealtimeInvalidation({
    channelName: `wp-changes-${warehouseProjectId}`,
    tables: ['warehouse_project_changes'],
    queryKeys: [['warehouse-changes', warehouseProjectId]],
  });

  const { data: changes = [], isLoading } = useQuery({
    queryKey: ['warehouse-changes', warehouseProjectId],
    queryFn: () => fetchWarehouseChanges({ warehouseProjectId }),
  });

  const unacked = changes.filter(c => !c.acknowledged);
  const acked = changes.filter(c => c.acknowledged);

  const handleAck = async (id: string) => {
    try {
      await acknowledgeWarehouseChange(id);
      await queryClient.invalidateQueries({ queryKey: ['warehouse-changes'] });
      await queryClient.invalidateQueries({ queryKey: ['warehouse-notification-count'] });
    } catch {
      toast.error('Kunde inte markera som hanterad');
    }
  };

  const handleAckAll = async () => {
    try {
      await acknowledgeAllForProject(warehouseProjectId);
      await queryClient.invalidateQueries({ queryKey: ['warehouse-changes'] });
      await queryClient.invalidateQueries({ queryKey: ['warehouse-notification-count'] });
      toast.success('Alla markerade som hanterade');
    } catch {
      toast.error('Kunde inte markera alla');
    }
  };

  if (isLoading) {
    return <div className="h-32 bg-muted/20 animate-pulse rounded-xl" />;
  }

  if (changes.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-6 text-center">
        <Bell className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">Inga ändringar att visa.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {unacked.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between bg-blue-50/40">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-600" />
              <h3 className="font-semibold text-sm">Ohanterade ändringar</h3>
              <Badge className="h-5 px-2 text-xs bg-blue-100 text-blue-800 border-0">
                {unacked.length}
              </Badge>
            </div>
            <Button size="sm" variant="outline" onClick={handleAckAll} className="h-7 text-xs gap-1">
              <CheckCheck className="w-3.5 h-3.5" /> Markera alla som hanterade
            </Button>
          </div>
          <div className="divide-y divide-border/30">
            {unacked.map(c => (
              <div key={c.id} className="flex items-center gap-2 group">
                <div className="flex-1">
                  <WarehouseChangeRow change={c} />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAck(c.id)}
                  className="h-7 w-7 p-0 mr-3 opacity-0 group-hover:opacity-100 hover:bg-green-100 hover:text-green-700"
                  title="Markera som hanterad"
                >
                  <Check className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {acked.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card overflow-hidden opacity-70">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <CheckCheck className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm text-muted-foreground">Hanterade</h3>
            <Badge variant="outline" className="h-5 px-2 text-xs">
              {acked.length}
            </Badge>
          </div>
          <div className="divide-y divide-border/30">
            {acked.slice(0, 20).map(c => (
              <div key={c.id} className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <WarehouseChangeRow change={c} />
                </div>
                {c.acknowledged_at && (
                  <span className="text-[10px] text-muted-foreground mr-4 shrink-0">
                    {format(new Date(c.acknowledged_at), 'd MMM HH:mm', { locale: sv })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WarehouseProjectChangesTab;
