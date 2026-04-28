import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchCostLines, createCostLine, updateCostLine, deleteCostLine,
  type CostLine, type CostCategory,
} from '@/services/largeProjectCostLines';

export function useLargeProjectCostLines(largeProjectId: string | undefined) {
  const qc = useQueryClient();
  const key = ['large-project-cost-lines', largeProjectId];

  const { data: lines = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => fetchCostLines(largeProjectId!),
    enabled: !!largeProjectId,
  });

  const add = useMutation({
    mutationFn: (input: { category: CostCategory; description?: string; amount?: number; supplier?: string | null; cost_date?: string | null }) =>
      createCostLine({ large_project_id: largeProjectId!, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: () => toast.error('Kunde inte lägga till rad'),
  });

  const update = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<CostLine> }) => updateCostLine(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: () => toast.error('Kunde inte uppdatera rad'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCostLine(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: () => toast.error('Kunde inte ta bort rad'),
  });

  return {
    lines: lines as CostLine[],
    isLoading,
    addLine: add.mutate,
    updateLine: update.mutate,
    removeLine: remove.mutate,
  };
}
