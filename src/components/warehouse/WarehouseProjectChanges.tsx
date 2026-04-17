import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchWarehouseChanges } from '@/services/warehouseProjectChangesService';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { WarehouseChangeRow } from './WarehouseChangeRow';
import { supabase } from '@/integrations/supabase/client';

/**
 * Inbox-section showing unacknowledged changes grouped per warehouse project.
 */
export const WarehouseProjectChanges: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useRealtimeInvalidation({
    channelName: 'warehouse-changes-inbox',
    tables: ['warehouse_project_changes'],
    queryKeys: [['warehouse-changes', 'inbox']],
  });

  const { data: changes = [], isLoading } = useQuery({
    queryKey: ['warehouse-changes', 'inbox'],
    queryFn: () => fetchWarehouseChanges({ onlyUnacknowledged: true }),
  });

  const projectIds = Array.from(new Set(changes.map(c => c.warehouse_project_id)));
  const { data: projects = [] } = useQuery({
    queryKey: ['warehouse-projects-by-ids', projectIds.sort().join(',')],
    queryFn: async () => {
      if (projectIds.length === 0) return [];
      const { data, error } = await supabase
        .from('warehouse_projects')
        .select('id, name, project_number')
        .in('id', projectIds);
      if (error) throw error;
      return data || [];
    },
    enabled: projectIds.length > 0,
  });

  if (isLoading || changes.length === 0) return null;

  const grouped = projectIds.map(pid => ({
    project: projects.find(p => p.id === pid),
    items: changes.filter(c => c.warehouse_project_id === pid),
  }));

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-border/40 bg-blue-50/40 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-500/10">
            <Bell className="h-4 w-4 text-blue-600" />
          </div>
          <h3 className="font-semibold text-sm text-foreground">Ändringar i lagerprojekt</h3>
        </div>
        <Badge className="h-5 px-2 text-xs font-medium bg-blue-100 text-blue-800 border-0">
          {changes.length} ändringar
        </Badge>
      </div>

      <div className="divide-y divide-border/30">
        {grouped.map(({ project, items }) => (
          <div key={project?.id || 'unknown'} className="py-1">
            <button
              onClick={() => project && navigate(`/warehouse/projects/${project.id}?tab=changes`)}
              className="w-full flex items-center gap-2 px-4 py-2 hover:bg-muted/30 transition-colors"
            >
              <span className="text-xs font-mono text-muted-foreground">
                {project?.project_number || '–'}
              </span>
              <span className="text-sm font-medium text-foreground truncate flex-1 text-left">
                {project?.name || 'Okänt projekt'}
              </span>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                {items.length}
              </Badge>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <div className="bg-muted/10">
              {items.slice(0, 3).map(c => (
                <WarehouseChangeRow key={c.id} change={c} />
              ))}
              {items.length > 3 && (
                <div className="px-4 py-1.5 text-xs text-muted-foreground">
                  +{items.length - 3} fler ändringar
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WarehouseProjectChanges;
