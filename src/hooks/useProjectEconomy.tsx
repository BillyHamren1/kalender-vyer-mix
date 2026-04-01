import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { BookingEconomics } from '@/types/booking';
import {
  fetchBudget,
  upsertBudget,
  fetchPurchases,
  createPurchase,
  deletePurchase,
  fetchQuotes,
  createQuote,
  updateQuote,
  deleteQuote,
  fetchInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  fetchProductCostsRemote,
  fetchSupplierInvoices,
  updateSupplierInvoiceLink,
} from '@/services/planningApiService';
import {
  fetchLocalProjectBudget,
  upsertLocalProjectBudget,
  fetchLocalProjectPurchases,
  createLocalProjectPurchase,
  updateLocalProjectPurchase,
  deleteLocalProjectPurchase,
} from '@/services/localProjectEconomyService';
import {
  fetchProductCostOverrides,
  upsertProductCostOverride,
  deleteProductCostOverride,
} from '@/services/productCostOverrideService';
import { calculateEconomySummary, fetchProjectTimeReports } from '@/services/projectEconomyService';
import type { ProductCostSummary, ProductCostData } from '@/services/productCostService';
import type { ProjectPurchase, ProjectQuote, ProjectInvoice, LinkedCostType } from '@/types/projectEconomy';
import { createOptimisticCallbacks } from './useOptimisticMutation';

export const useProjectEconomy = (projectId: string | undefined, bookingId: string | null | undefined) => {
  const queryClient = useQueryClient();
  const hasBooking = !!bookingId;

  // ===== Remote data (via planning-api-proxy, needs bookingId) =====

  const { data: remoteBudget, isLoading: remoteBudgetLoading } = useQuery({
    queryKey: ['project-budget', bookingId],
    queryFn: () => fetchBudget(bookingId!),
    enabled: hasBooking,
  });

  const { data: timeReports = [], isLoading: timeReportsLoading } = useQuery({
    queryKey: ['project-time-reports', bookingId],
    queryFn: () => fetchProjectTimeReports(bookingId!),
    enabled: hasBooking,
  });

  const { data: remotePurchases = [], isLoading: remotePurchasesLoading } = useQuery({
    queryKey: ['project-purchases', bookingId],
    queryFn: () => fetchPurchases(bookingId!),
    enabled: hasBooking,
  });

  const { data: quotes = [], isLoading: quotesLoading } = useQuery({
    queryKey: ['project-quotes', bookingId],
    queryFn: () => fetchQuotes(bookingId!),
    enabled: hasBooking,
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['project-invoices', bookingId],
    queryFn: () => fetchInvoices(bookingId!),
    enabled: hasBooking,
  });

  const { data: productCosts, isLoading: productCostsLoading, refetch: refetchProductCosts } = useQuery({
    queryKey: ['product-costs', bookingId],
    queryFn: () => fetchProductCostsRemote(bookingId!),
    enabled: hasBooking,
  });

  const { data: supplierInvoices = [], isLoading: supplierInvoicesLoading, refetch: refetchSupplierInvoices } = useQuery({
    queryKey: ['supplier-invoices', bookingId],
    queryFn: () => fetchSupplierInvoices(bookingId!),
    enabled: hasBooking,
  });

  const { data: bookingEconomics } = useQuery({
    queryKey: ['booking-economics', bookingId],
    queryFn: async () => {
      const { data } = await supabase
        .from('bookings')
        .select('economics_data')
        .eq('id', bookingId!)
        .single();
      return (data?.economics_data ?? null) as BookingEconomics | null;
    },
    enabled: hasBooking,
  });

  // ===== Local data (via Supabase, always available) =====

  const { data: localBudget, isLoading: localBudgetLoading } = useQuery({
    queryKey: ['local-project-budget', projectId],
    queryFn: () => fetchLocalProjectBudget(projectId!),
    enabled: !!projectId,
  });

  const { data: localPurchases = [], isLoading: localPurchasesLoading } = useQuery({
    queryKey: ['local-project-purchases', projectId],
    queryFn: () => fetchLocalProjectPurchases(projectId!),
    enabled: !!projectId,
  });

  // ===== Merged data: prefer remote if available, fall back to local =====
  const budget = hasBooking ? remoteBudget : localBudget;
  
  // Combine remote + local purchases
  const purchases = hasBooking
    ? [...remotePurchases, ...localPurchases]
    : localPurchases;

  const summary = calculateEconomySummary(budget || null, timeReports, purchases, quotes, invoices, productCosts || null, supplierInvoices);

  // ===== Budget mutation (routes to correct backend) =====
  const saveBudgetMutation = useMutation({
    mutationFn: (data: { budgeted_hours: number; hourly_rate: number; description?: string }) => {
      if (hasBooking) {
        return upsertBudget(bookingId!, data);
      }
      return upsertLocalProjectBudget({ project_id: projectId!, ...data });
    },
    onSuccess: () => {
      if (hasBooking) {
        queryClient.invalidateQueries({ queryKey: ['project-budget', bookingId] });
      }
      queryClient.invalidateQueries({ queryKey: ['local-project-budget', projectId] });
      toast.success('Budget sparad');
    },
    onError: () => toast.error('Kunde inte spara budget'),
  });

  // ===== Purchase mutations =====
  // Add purchase (local always, for projects without booking also local)
  const addLocalPurchaseOptimistic = createOptimisticCallbacks<any, any>({
    queryClient,
    queryKey: ['local-project-purchases', projectId],
    type: 'add',
    optimisticData: (vars: any) => ({
      id: `temp-${Date.now()}`,
      created_at: new Date().toISOString(),
      approved: false,
      ...vars,
    }),
    errorMessage: 'Kunde inte lägga till inköp',
  });

  const addPurchaseMutation = useMutation({
    mutationFn: (data: Omit<ProjectPurchase, 'id' | 'created_at'>) => {
      if (hasBooking) {
        return createPurchase({ ...data, booking_id: bookingId });
      }
      return createLocalProjectPurchase({ ...data, project_id: projectId! } as any);
    },
    onSuccess: () => {
      if (hasBooking) {
        queryClient.invalidateQueries({ queryKey: ['project-purchases', bookingId] });
      }
      queryClient.invalidateQueries({ queryKey: ['local-project-purchases', projectId] });
      toast.success('Inköp tillagt');
    },
    onError: () => toast.error('Kunde inte lägga till inköp'),
  });

  // Update local purchase
  const updatePurchaseMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ProjectPurchase> }) =>
      updateLocalProjectPurchase(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['local-project-purchases', projectId] });
      if (hasBooking) queryClient.invalidateQueries({ queryKey: ['project-purchases', bookingId] });
      toast.success('Inköp uppdaterat');
    },
    onError: () => toast.error('Kunde inte uppdatera inköp'),
  });

  // Remove purchase
  const removePurchaseOptimistic = createOptimisticCallbacks<any, string>({
    queryClient,
    queryKey: hasBooking ? ['project-purchases', bookingId] : ['local-project-purchases', projectId],
    type: 'delete',
    getId: (id) => id,
    errorMessage: 'Kunde inte ta bort inköp',
  });

  const removePurchaseMutation = useMutation({
    mutationFn: (id: string) => {
      // Try local first, if it fails try remote
      if (hasBooking) {
        return deletePurchase(id).catch(() => deleteLocalProjectPurchase(id));
      }
      return deleteLocalProjectPurchase(id);
    },
    ...removePurchaseOptimistic,
    onSuccess: () => {
      if (hasBooking) queryClient.invalidateQueries({ queryKey: ['project-purchases', bookingId] });
      queryClient.invalidateQueries({ queryKey: ['local-project-purchases', projectId] });
      toast.success('Inköp borttaget');
    },
    onError: removePurchaseOptimistic.onError,
    onSettled: removePurchaseOptimistic.onSettled,
  });

  // ===== Quote mutations (remote only) =====
  const addQuoteOptimistic = createOptimisticCallbacks<any, Omit<ProjectQuote, 'id' | 'created_at' | 'updated_at'>>({
    queryClient,
    queryKey: ['project-quotes', bookingId],
    type: 'add',
    optimisticData: (vars) => ({
      id: `temp-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...vars,
    }),
    errorMessage: 'Kunde inte lägga till offert',
  });

  const addQuoteMutation = useMutation({
    mutationFn: (data: Omit<ProjectQuote, 'id' | 'created_at' | 'updated_at'>) =>
      createQuote({ ...data, booking_id: bookingId }),
    ...addQuoteOptimistic,
    onSuccess: () => { toast.success('Offert tillagd'); },
    onError: addQuoteOptimistic.onError,
    onSettled: addQuoteOptimistic.onSettled,
  });

  const updateQuoteOptimistic = createOptimisticCallbacks<any, { id: string; updates: Partial<ProjectQuote> }>({
    queryClient,
    queryKey: ['project-quotes', bookingId],
    type: 'update',
    getId: (vars) => vars.id,
    optimisticData: (vars, old) => {
      const existing = old.find((q: any) => q.id === vars.id);
      return existing ? { ...existing, ...vars.updates } : existing;
    },
    errorMessage: 'Kunde inte uppdatera offert',
  });

  const updateQuoteMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ProjectQuote> }) =>
      updateQuote(id, updates),
    ...updateQuoteOptimistic,
    onSuccess: () => { toast.success('Offert uppdaterad'); },
    onError: updateQuoteOptimistic.onError,
    onSettled: updateQuoteOptimistic.onSettled,
  });

  const removeQuoteOptimistic = createOptimisticCallbacks<any, string>({
    queryClient,
    queryKey: ['project-quotes', bookingId],
    type: 'delete',
    getId: (id) => id,
    errorMessage: 'Kunde inte ta bort offert',
  });

  const removeQuoteMutation = useMutation({
    mutationFn: deleteQuote,
    ...removeQuoteOptimistic,
    onSuccess: () => { toast.success('Offert borttagen'); },
    onError: removeQuoteOptimistic.onError,
    onSettled: removeQuoteOptimistic.onSettled,
  });

  // ===== Invoice mutations (remote only) =====
  const addInvoiceOptimistic = createOptimisticCallbacks<any, Omit<ProjectInvoice, 'id' | 'created_at'>>({
    queryClient,
    queryKey: ['project-invoices', bookingId],
    type: 'add',
    optimisticData: (vars) => ({
      id: `temp-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...vars,
    }),
    errorMessage: 'Kunde inte lägga till faktura',
  });

  const addInvoiceMutation = useMutation({
    mutationFn: (data: Omit<ProjectInvoice, 'id' | 'created_at'>) =>
      createInvoice({ ...data, booking_id: bookingId }),
    ...addInvoiceOptimistic,
    onSuccess: () => { toast.success('Faktura tillagd'); },
    onError: addInvoiceOptimistic.onError,
    onSettled: addInvoiceOptimistic.onSettled,
  });

  const updateInvoiceOptimistic = createOptimisticCallbacks<any, { id: string; updates: Partial<ProjectInvoice> }>({
    queryClient,
    queryKey: ['project-invoices', bookingId],
    type: 'update',
    getId: (vars) => vars.id,
    optimisticData: (vars, old) => {
      const existing = old.find((i: any) => i.id === vars.id);
      return existing ? { ...existing, ...vars.updates } : existing;
    },
    errorMessage: 'Kunde inte uppdatera faktura',
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ProjectInvoice> }) =>
      updateInvoice(id, updates),
    ...updateInvoiceOptimistic,
    onSuccess: () => { toast.success('Faktura uppdaterad'); },
    onError: updateInvoiceOptimistic.onError,
    onSettled: updateInvoiceOptimistic.onSettled,
  });

  const removeInvoiceOptimistic = createOptimisticCallbacks<any, string>({
    queryClient,
    queryKey: ['project-invoices', bookingId],
    type: 'delete',
    getId: (id) => id,
    errorMessage: 'Kunde inte ta bort faktura',
  });

  const removeInvoiceMutation = useMutation({
    mutationFn: deleteInvoice,
    ...removeInvoiceOptimistic,
    onSuccess: () => { toast.success('Faktura borttagen'); },
    onError: removeInvoiceOptimistic.onError,
    onSettled: removeInvoiceOptimistic.onSettled,
  });

  // Supplier invoice linking
  const linkSupplierInvoiceMutation = useMutation({
    mutationFn: ({ id, linked_cost_type, linked_cost_id, is_final_link }: { id: string; linked_cost_type: LinkedCostType; linked_cost_id: string | null; is_final_link?: boolean }) =>
      updateSupplierInvoiceLink(id, { linked_cost_type, linked_cost_id, is_final_link }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-invoices', bookingId] });
      toast.success('Koppling sparad');
    },
    onError: () => toast.error('Kunde inte spara koppling'),
  });

  const isLoading = (hasBooking ? (remoteBudgetLoading || timeReportsLoading || remotePurchasesLoading || quotesLoading || invoicesLoading || productCostsLoading || supplierInvoicesLoading) : false) || localBudgetLoading || localPurchasesLoading;

  return {
    budget,
    timeReports,
    purchases,
    localPurchases,
    quotes,
    invoices,
    productCosts,
    supplierInvoices,
    bookingEconomics,
    summary,
    isLoading,
    hasBooking,
    saveBudget: saveBudgetMutation.mutate,
    addPurchase: addPurchaseMutation.mutate,
    updatePurchase: updatePurchaseMutation.mutate,
    removePurchase: removePurchaseMutation.mutate,
    addQuote: addQuoteMutation.mutate,
    updateQuote: updateQuoteMutation.mutate,
    removeQuote: removeQuoteMutation.mutate,
    addInvoice: addInvoiceMutation.mutate,
    updateInvoice: updateInvoiceMutation.mutate,
    removeInvoice: removeInvoiceMutation.mutate,
    refetchProductCosts,
    refetchSupplierInvoices,
    linkSupplierInvoice: linkSupplierInvoiceMutation.mutate,
  };
};
