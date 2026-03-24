import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchProjectSuppliers,
  createProjectSupplier,
  updateProjectSupplier,
  deleteProjectSupplier,
  updateSupplierStatus,
} from "@/services/supplierService";
import type { SupplierStatus } from "@/types/supplier";
import { toast } from "sonner";

export const useProjectSuppliers = (projectId: string | undefined) => {
  const queryClient = useQueryClient();
  const queryKey = ['project-suppliers', projectId];

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchProjectSuppliers(projectId!),
    enabled: !!projectId,
  });

  const addMutation = useMutation({
    mutationFn: createProjectSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Underleverantör tillagd');
    },
    onError: () => toast.error('Kunde inte lägga till underleverantör'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updateProjectSupplier>[1] }) =>
      updateProjectSupplier(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Underleverantör uppdaterad');
    },
    onError: () => toast.error('Kunde inte uppdatera'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProjectSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Underleverantör borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: SupplierStatus }) =>
      updateSupplierStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Status uppdaterad');
    },
    onError: () => toast.error('Kunde inte uppdatera status'),
  });

  return {
    suppliers,
    isLoading,
    addSupplier: addMutation.mutate,
    updateSupplier: updateMutation.mutate,
    deleteSupplier: deleteMutation.mutate,
    setStatus: statusMutation.mutate,
  };
};
