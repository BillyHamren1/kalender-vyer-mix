import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { BookingEconomics } from '@/types/booking';
import {
  fetchProjectBudget,
  upsertProjectBudget,
  fetchProjectPurchases,
  createProjectPurchase,
  deleteProjectPurchase,
  fetchProjectQuotes,
  createProjectQuote,
  updateProjectQuote,
  deleteProjectQuote,
  fetchProjectInvoices,
  createProjectInvoice,
  updateProjectInvoice,
  deleteProjectInvoice,
  fetchProjectTimeReports,
  calculateEconomySummary
} from '@/services/projectEconomyService';
import { fetchProductCosts, updateProductCost } from '@/services/productCostService';
import type { ProjectPurchase, ProjectQuote, ProjectInvoice } from '@/types/projectEconomy';
import { createOptimisticCallbacks } from './useOptimisticMutation';

export const useProjectEconomy = (projectId: string | undefined, bookingId: string | null | undefined) => {
  const queryClient = useQueryClient();

  // Fetch budget
  const { data: budget, isLoading: budgetLoading } = useQuery({
    queryKey: ['project-budget', projectId],
    queryFn: () => fetchProjectBudget(projectId!),
    enabled: !!projectId,
  });

  const { data: timeReports = [], isLoading: timeReportsLoading } = useQuery({
    queryKey: ['project-time-reports', bookingId],
    queryFn: () => fetchProjectTimeReports(bookingId!),
    enabled: !!bookingId,
  });

  const { data: purchases = [], isLoading: purchasesLoading } = useQuery({
    queryKey: ['project-purchases', projectId],
    queryFn: () => fetchProjectPurchases(projectId!),
    enabled: !!projectId,
  });

  const { data: quotes = [], isLoading: quotesLoading } = useQuery({
    queryKey: ['project-quotes', projectId],
    queryFn: () => fetchProjectQuotes(projectId!),
    enabled: !!projectId,
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['project-invoices', projectId],
    queryFn: () => fetchProjectInvoices(projectId!),
    enabled: !!projectId,
  });

  const { data: productCosts, isLoading: productCostsLoading } = useQuery({
    queryKey: ['product-costs', bookingId],
    queryFn: () => fetchProductCosts(bookingId!),
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

  const summary = calculateEconomySummary(budget || null, timeReports, purchases, quotes, invoices, productCosts || null);

  // --- Optimistic mutations ---

  const saveBudgetMutation = useMutation({
    mutationFn: (data: { budgeted_hours: number; hourly_rate: number; description?: string }) =>
      upsertProjectBudget(projectId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-budget', projectId] });
      toast.success('Budget sparad');
    },
    onError: () => toast.error('Kunde inte spara budget'),
  });

  // Purchase - add
  const addPurchaseOptimistic = createOptimisticCallbacks<any, Omit<ProjectPurchase, 'id' | 'created_at'>>({
    queryClient,
    queryKey: ['project-purchases', projectId],
    type: 'add',
    optimisticData: (vars) => ({
      id: `temp-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...vars,
    }),
    errorMessage: 'Kunde inte lägga till inköp',
  });

  const addPurchaseMutation = useMutation({
    mutationFn: (data: Omit<ProjectPurchase, 'id' | 'created_at'>) => createProjectPurchase(data),
    ...addPurchaseOptimistic,
    onSuccess: () => { toast.success('Inköp tillagt'); },
    onError: addPurchaseOptimistic.onError,
    onSettled: addPurchaseOptimistic.onSettled,
  });

  // Purchase - delete
  const removePurchaseOptimistic = createOptimisticCallbacks<any, string>({
    queryClient,
    queryKey: ['project-purchases', projectId],
    type: 'delete',
    getId: (id) => id,
    errorMessage: 'Kunde inte ta bort inköp',
  });

  const removePurchaseMutation = useMutation({
    mutationFn: deleteProjectPurchase,
    ...removePurchaseOptimistic,
    onSuccess: () => { toast.success('Inköp borttaget'); },
    onError: removePurchaseOptimistic.onError,
    onSettled: removePurchaseOptimistic.onSettled,
  });

  // Quote - add
  const addQuoteOptimistic = createOptimisticCallbacks<any, Omit<ProjectQuote, 'id' | 'created_at' | 'updated_at'>>({
    queryClient,
    queryKey: ['project-quotes', projectId],
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
    mutationFn: (data: Omit<ProjectQuote, 'id' | 'created_at' | 'updated_at'>) => createProjectQuote(data),
    ...addQuoteOptimistic,
    onSuccess: () => { toast.success('Offert tillagd'); },
    onError: addQuoteOptimistic.onError,
    onSettled: addQuoteOptimistic.onSettled,
  });

  // Quote - update
  const updateQuoteOptimistic = createOptimisticCallbacks<any, { id: string; updates: Partial<ProjectQuote> }>({
    queryClient,
    queryKey: ['project-quotes', projectId],
    type: 'update',
    getId: (vars) => vars.id,
    optimisticData: (vars, old) => {
      const existing = old.find(q => q.id === vars.id);
      return existing ? { ...existing, ...vars.updates } : existing;
    },
    errorMessage: 'Kunde inte uppdatera offert',
  });

  const updateQuoteMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ProjectQuote> }) =>
      updateProjectQuote(id, updates),
    ...updateQuoteOptimistic,
    onSuccess: () => { toast.success('Offert uppdaterad'); },
    onError: updateQuoteOptimistic.onError,
    onSettled: updateQuoteOptimistic.onSettled,
  });

  // Quote - delete
  const removeQuoteOptimistic = createOptimisticCallbacks<any, string>({
    queryClient,
    queryKey: ['project-quotes', projectId],
    type: 'delete',
    getId: (id) => id,
    errorMessage: 'Kunde inte ta bort offert',
  });

  const removeQuoteMutation = useMutation({
    mutationFn: deleteProjectQuote,
    ...removeQuoteOptimistic,
    onSuccess: () => { toast.success('Offert borttagen'); },
    onError: removeQuoteOptimistic.onError,
    onSettled: removeQuoteOptimistic.onSettled,
  });

  // Invoice - add
  const addInvoiceOptimistic = createOptimisticCallbacks<any, Omit<ProjectInvoice, 'id' | 'created_at'>>({
    queryClient,
    queryKey: ['project-invoices', projectId],
    type: 'add',
    optimisticData: (vars) => ({
      id: `temp-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...vars,
    }),
    errorMessage: 'Kunde inte lägga till faktura',
  });

  const addInvoiceMutation = useMutation({
    mutationFn: (data: Omit<ProjectInvoice, 'id' | 'created_at'>) => createProjectInvoice(data),
    ...addInvoiceOptimistic,
    onSuccess: () => { toast.success('Faktura tillagd'); },
    onError: addInvoiceOptimistic.onError,
    onSettled: addInvoiceOptimistic.onSettled,
  });

  // Invoice - update
  const updateInvoiceOptimistic = createOptimisticCallbacks<any, { id: string; updates: Partial<ProjectInvoice> }>({
    queryClient,
    queryKey: ['project-invoices', projectId],
    type: 'update',
    getId: (vars) => vars.id,
    optimisticData: (vars, old) => {
      const existing = old.find(i => i.id === vars.id);
      return existing ? { ...existing, ...vars.updates } : existing;
    },
    errorMessage: 'Kunde inte uppdatera faktura',
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ProjectInvoice> }) =>
      updateProjectInvoice(id, updates),
    ...updateInvoiceOptimistic,
    onSuccess: () => { toast.success('Faktura uppdaterad'); },
    onError: updateInvoiceOptimistic.onError,
    onSettled: updateInvoiceOptimistic.onSettled,
  });

  // Invoice - delete
  const removeInvoiceOptimistic = createOptimisticCallbacks<any, string>({
    queryClient,
    queryKey: ['project-invoices', projectId],
    type: 'delete',
    getId: (id) => id,
    errorMessage: 'Kunde inte ta bort faktura',
  });

  const removeInvoiceMutation = useMutation({
    mutationFn: deleteProjectInvoice,
    ...removeInvoiceOptimistic,
    onSuccess: () => { toast.success('Faktura borttagen'); },
    onError: removeInvoiceOptimistic.onError,
    onSettled: removeInvoiceOptimistic.onSettled,
  });

  // Product cost mutation (not optimistic - complex recalculation)
  const updateProductCostMutation = useMutation({
    mutationFn: ({ productId, costs }: { 
      productId: string; 
      costs: {
        labor_cost?: number;
        material_cost?: number;
        setup_hours?: number;
        external_cost?: number;
        cost_notes?: string | null;
      }
    }) => updateProductCost(productId, costs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-costs', bookingId] });
    },
    onError: () => toast.error('Kunde inte uppdatera produktkostnad'),
  });

  const isLoading = budgetLoading || timeReportsLoading || purchasesLoading || quotesLoading || invoicesLoading || productCostsLoading;

  return {
    budget,
    timeReports,
    purchases,
    quotes,
    invoices,
    productCosts,
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
    updateProductCost: (productId: string, costs: {
      labor_cost?: number;
      material_cost?: number;
      setup_hours?: number;
      external_cost?: number;
      cost_notes?: string | null;
    }) => updateProductCostMutation.mutateAsync({ productId, costs }),
  };
};
