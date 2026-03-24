import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchProjectSupplierLinks,
  createProjectSupplierLink,
  updateProjectSupplierLink,
  deleteProjectSupplierLink,
  updateSupplierLinkStatus,
} from "@/services/projectSupplierLinkService";
import { getSupplier, listSuppliers, searchSuppliers, createSupplier as createWmsSupplier } from "@/services/sharedSupplierService";
import type { WmsSupplier } from "@/services/sharedSupplierService";
import type { SupplierStatus, MergedSupplier } from "@/types/supplier";
import { mergeSupplierData } from "@/types/supplier";
import { toast } from "sonner";

export const useProjectSuppliers = (projectId: string | undefined) => {
  const queryClient = useQueryClient();
  const queryKey = ['project-supplier-links', projectId];

  // Fetch project links
  const { data: links = [], isLoading: linksLoading } = useQuery({
    queryKey,
    queryFn: () => fetchProjectSupplierLinks(projectId!),
    enabled: !!projectId,
  });

  // Fetch WMS supplier data for all linked suppliers
  const supplierIds = links.map(l => l.supplier_id);
  const { data: wmsSuppliers = {}, isLoading: wmsLoading } = useQuery({
    queryKey: ['wms-suppliers-batch', ...supplierIds],
    queryFn: async () => {
      if (supplierIds.length === 0) return {};
      // Fetch each supplier from WMS - could be optimized with batch endpoint later
      const results: Record<string, WmsSupplier> = {};
      const fetches = supplierIds.map(async (id) => {
        try {
          const supplier = await getSupplier(id);
          results[id] = supplier;
        } catch (e) {
          console.warn(`Failed to fetch WMS supplier ${id}:`, e);
        }
      });
      await Promise.all(fetches);
      return results;
    },
    enabled: supplierIds.length > 0,
  });

  // Merge link data with WMS data
  const suppliers: MergedSupplier[] = links.map(link =>
    mergeSupplierData(link, wmsSuppliers[link.supplier_id] || null)
  );

  const isLoading = linksLoading || (supplierIds.length > 0 && wmsLoading);

  const addLinkMutation = useMutation({
    mutationFn: createProjectSupplierLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Underleverantör tillagd');
    },
    onError: () => toast.error('Kunde inte lägga till underleverantör'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updateProjectSupplierLink>[1] }) =>
      updateProjectSupplierLink(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Underleverantör uppdaterad');
    },
    onError: () => toast.error('Kunde inte uppdatera'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProjectSupplierLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Underleverantör borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: SupplierStatus }) =>
      updateSupplierLinkStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Status uppdaterad');
    },
    onError: () => toast.error('Kunde inte uppdatera status'),
  });

  return {
    suppliers,
    isLoading,
    addSupplier: addLinkMutation.mutate,
    updateSupplier: updateMutation.mutate,
    deleteSupplier: deleteMutation.mutate,
    setStatus: statusMutation.mutate,
  };
};
