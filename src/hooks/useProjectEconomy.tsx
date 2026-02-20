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
  fetchTimeReports,
  fetchProductCostsRemote,
  fetchSupplierInvoices,
  updateSupplierInvoiceLink,
} from '@/services/planningApiService';
import { calculateEconomySummary } from '@/services/projectEconomyService';
import type { ProjectPurchase, ProjectQuote, ProjectInvoice, LinkedCostType } from '@/types/projectEconomy';
import { createOptimisticCallbacks } from './useOptimisticMutation';

export const useProjectEconomy = (projectId: string | undefined, bookingId: string | null | undefined) => {
  const queryClient = useQueryClient();

  // All economy data is now fetched via bookingId through the planning-api-proxy
  const { data: budget, isLoading: budgetLoading } = useQuery({
    queryKey: ['project-budget', bookingId],
    queryFn: () => fetchBudget(bookingId!),
    enabled: !!bookingId,
  });

  const { data: timeReports = [], isLoading: timeReportsLoading } = useQuery({
    queryKey: ['project-time-reports', bookingId],
    queryFn: () => fetchTimeReports(bookingId!),
    enabled: !!bookingId,
  });

  const { data: purchases = [], isLoading: purchasesLoading } = useQuery({
    queryKey: ['project-purchases', bookingId],
    queryFn: () => fetchPurchases(bookingId!),
    enabled: !!bookingId,
  });

  const { data: quotes = [], isLoading: quotesLoading } = useQuery({
    queryKey: ['project-quotes', bookingId],
    queryFn: () => fetchQuotes(bookingId!),
    enabled: !!bookingId,
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['project-invoices', bookingId],
    queryFn: () => fetchInvoices(bookingId!),
    enabled: !!bookingId,
  });

  const { data: productCosts, isLoading: productCostsLoading, refetch: refetchProductCosts } = useQuery({
    queryKey: ['product-costs', bookingId],
    queryFn: () => fetchProductCostsRemote(bookingId!),
    enabled: !!bookingId,
  });

  const { data: supplierInvoices = [], isLoading: supplierInvoicesLoading, refetch: refetchSupplierInvoices } = useQuery({
    queryKey: ['supplier-invoices', bookingId],
    queryFn: () => fetchSupplierInvoices(bookingId!),
    enabled: !!bookingId,
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
    enabled: !!bookingId,
  });

  const summary = calculateEconomySummary(budget || null, timeReports, purchases, quotes, invoices, productCosts || null, supplierInvoices);

  // --- Mutations (all via planning-api-proxy) ---

  const saveBudgetMutation = useMutation({
    mutationFn: (data: { budgeted_hours: number; hourly_rate: number; description?: string }) =>
      upsertBudget(bookingId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-budget', bookingId] });
      toast.success('Budget sparad');
    },
    onError: () => toast.error('Kunde inte spara budget'),
  });

  // Purchase - add
  const addPurchaseOptimistic = createOptimisticCallbacks<any, Omit<ProjectPurchase, 'id' | 'created_at'>>({
    queryClient,
    queryKey: ['project-purchases', bookingId],
    type: 'add',
    optimisticData: (vars) => ({
      id: `temp-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...vars,
    }),
    errorMessage: 'Kunde inte lägga till inköp',
  });

  const addPurchaseMutation = useMutation({
    mutationFn: (data: Omit<ProjectPurchase, 'id' | 'created_at'>) =>
      createPurchase({ ...data, booking_id: bookingId }),
    ...addPurchaseOptimistic,
    onSuccess: () => { toast.success('Inköp tillagt'); },
    onError: addPurchaseOptimistic.onError,
    onSettled: addPurchaseOptimistic.onSettled,
  });

  // Purchase - delete
  const removePurchaseOptimistic = createOptimisticCallbacks<any, string>({
    queryClient,
    queryKey: ['project-purchases', bookingId],
    type: 'delete',
    getId: (id) => id,
    errorMessage: 'Kunde inte ta bort inköp',
  });

  const removePurchaseMutation = useMutation({
    mutationFn: deletePurchase,
    ...removePurchaseOptimistic,
    onSuccess: () => { toast.success('Inköp borttaget'); },
    onError: removePurchaseOptimistic.onError,
    onSettled: removePurchaseOptimistic.onSettled,
  });

  // Quote - add
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

  // Quote - update
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

  // Quote - delete
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

  // Invoice - add
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

  // Invoice - update
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

  // Invoice - delete
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

  // Product costs are read-only from Booking system — no local update mutation needed

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

  const isLoading = budgetLoading || timeReportsLoading || purchasesLoading || quotesLoading || invoicesLoading || productCostsLoading || supplierInvoicesLoading;

  return {
    budget,
    timeReports,
    purchases,
    quotes,
    invoices,
    productCosts,
    supplierInvoices,
    bookingEconomics,
    summary,
    isLoading,
    saveBudget: saveBudgetMutation.mutate,
    addPurchase: addPurchaseMutation.mutate,
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
