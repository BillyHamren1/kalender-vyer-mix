import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type QueryKeyType = readonly unknown[];

interface OptimisticListUpdateConfig<TData, TVariables> {
  queryClient: QueryClient;
  queryKey: QueryKeyType;
  type: 'update' | 'add' | 'delete';
  /** For 'update': return the updated item. For 'add': return the new temporary item. For 'delete': not used. */
  optimisticData?: (variables: TVariables, oldData: TData[]) => TData | TData[];
  /** For 'delete' and 'update': identify which item to modify/remove */
  getId?: (variables: TVariables) => string;
  errorMessage?: string;
  /** Additional query keys to invalidate on settled */
  invalidateKeys?: QueryKeyType[];
}

interface OptimisticSingleUpdateConfig<TData, TVariables> {
  queryClient: QueryClient;
  queryKey: QueryKeyType;
  type: 'single';
  /** Return the optimistically updated single object */
  optimisticData: (variables: TVariables, oldData: TData | undefined) => TData;
  errorMessage?: string;
  invalidateKeys?: QueryKeyType[];
}

type OptimisticConfig<TData, TVariables> =
  | OptimisticListUpdateConfig<TData, TVariables>
  | OptimisticSingleUpdateConfig<TData, TVariables>;

export function createOptimisticCallbacks<TData, TVariables>(
  config: OptimisticConfig<TData, TVariables>
) {
  const { queryClient, queryKey, errorMessage = "Något gick fel", invalidateKeys = [] } = config;

  return {
    onMutate: async (variables: TVariables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot
      const previousData = queryClient.getQueryData(queryKey);

      if (config.type === 'single') {
        const oldData = queryClient.getQueryData<TData>(queryKey);
        queryClient.setQueryData(queryKey, config.optimisticData(variables, oldData));
      } else if (config.type === 'update') {
        queryClient.setQueryData<TData[]>(queryKey, (old = []) => {
          const id = config.getId?.(variables);
          if (!id || !config.optimisticData) return old;
          const result = config.optimisticData(variables, old);
          const updatedItem = Array.isArray(result) ? result : [result];
          return old.map(item => {
            const itemId = (item as any).id;
            const match = updatedItem.find(u => (u as any).id === itemId);
            return match || item;
          });
        });
      } else if (config.type === 'add') {
        queryClient.setQueryData<TData[]>(queryKey, (old = []) => {
          if (!config.optimisticData) return old;
          const newItem = config.optimisticData(variables, old);
          return Array.isArray(newItem) ? [...old, ...newItem] : [...old, newItem];
        });
      } else if (config.type === 'delete') {
        queryClient.setQueryData<TData[]>(queryKey, (old = []) => {
          const id = config.getId?.(variables);
          if (!id) return old;
          return old.filter(item => (item as any).id !== id);
        });
      }

      return { previousData };
    },

    onError: (_err: unknown, _variables: TVariables, context: { previousData?: unknown } | undefined) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast.error(errorMessage);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      invalidateKeys.forEach(key => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
  };
}
