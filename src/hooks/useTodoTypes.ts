import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';

export interface TodoType {
  id: string;
  organization_id: string;
  key: string;
  label: string;
  is_builtin: boolean;
}

export function useTodoTypes() {
  const { organizationId } = useCurrentOrg();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['todo-types', organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<TodoType[]> => {
      const { data, error } = await supabase
        .from('todo_types')
        .select('*')
        .order('is_builtin', { ascending: false })
        .order('label', { ascending: true });
      if (error) throw error;
      return (data || []) as TodoType[];
    },
  });

  const createType = useMutation({
    mutationFn: async (label: string): Promise<TodoType> => {
      const trimmed = label.trim();
      if (!trimmed) throw new Error('Etikett saknas');
      const key = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || `custom_${Date.now()}`;
      const { data, error } = await supabase
        .from('todo_types')
        .insert({ key, label: trimmed, is_builtin: false } as any)
        .select()
        .single();
      if (error) throw error;
      return data as TodoType;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todo-types', organizationId] });
    },
  });

  return { ...query, createType };
}
