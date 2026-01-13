import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
import type { ProjectPurchase, ProjectQuote, ProjectInvoice } from '@/types/projectEconomy';

export const useProjectEconomy = (projectId: string | undefined, bookingId: string | null | undefined) => {
  const queryClient = useQueryClient();

  // Fetch budget
  const { data: budget, isLoading: budgetLoading } = useQuery({
    queryKey: ['project-budget', projectId],
    queryFn: () => fetchProjectBudget(projectId!),
    enabled: !!projectId,
  });

  // Fetch time reports via booking
  const { data: timeReports = [], isLoading: timeReportsLoading } = useQuery({
    queryKey: ['project-time-reports', bookingId],
    queryFn: () => fetchProjectTimeReports(bookingId!),
    enabled: !!bookingId,
  });

  // Fetch purchases
  const { data: purchases = [], isLoading: purchasesLoading } = useQuery({
    queryKey: ['project-purchases', projectId],
    queryFn: () => fetchProjectPurchases(projectId!),
    enabled: !!projectId,
  });

  // Fetch quotes
  const { data: quotes = [], isLoading: quotesLoading } = useQuery({
    queryKey: ['project-quotes', projectId],
    queryFn: () => fetchProjectQuotes(projectId!),
    enabled: !!projectId,
  });

  // Fetch invoices
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['project-invoices', projectId],
    queryFn: () => fetchProjectInvoices(projectId!),
    enabled: !!projectId,
  });

  // Calculate summary
  const summary = calculateEconomySummary(budget || null, timeReports, purchases, quotes, invoices);

  // Budget mutation
  const saveBudgetMutation = useMutation({
    mutationFn: (data: { budgeted_hours: number; hourly_rate: number; description?: string }) =>
      upsertProjectBudget(projectId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-budget', projectId] });
      toast.success('Budget sparad');
    },
    onError: () => toast.error('Kunde inte spara budget'),
  });

  // Purchase mutations
  const addPurchaseMutation = useMutation({
    mutationFn: (data: Omit<ProjectPurchase, 'id' | 'created_at'>) => createProjectPurchase(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-purchases', projectId] });
      toast.success('Inköp tillagt');
    },
    onError: () => toast.error('Kunde inte lägga till inköp'),
  });

  const removePurchaseMutation = useMutation({
    mutationFn: deleteProjectPurchase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-purchases', projectId] });
      toast.success('Inköp borttaget');
    },
    onError: () => toast.error('Kunde inte ta bort inköp'),
  });

  // Quote mutations
  const addQuoteMutation = useMutation({
    mutationFn: (data: Omit<ProjectQuote, 'id' | 'created_at' | 'updated_at'>) => createProjectQuote(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-quotes', projectId] });
      toast.success('Offert tillagd');
    },
    onError: () => toast.error('Kunde inte lägga till offert'),
  });

  const updateQuoteMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ProjectQuote> }) =>
      updateProjectQuote(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-quotes', projectId] });
      toast.success('Offert uppdaterad');
    },
    onError: () => toast.error('Kunde inte uppdatera offert'),
  });

  const removeQuoteMutation = useMutation({
    mutationFn: deleteProjectQuote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-quotes', projectId] });
      toast.success('Offert borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort offert'),
  });

  // Invoice mutations
  const addInvoiceMutation = useMutation({
    mutationFn: (data: Omit<ProjectInvoice, 'id' | 'created_at'>) => createProjectInvoice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-invoices', projectId] });
      toast.success('Faktura tillagd');
    },
    onError: () => toast.error('Kunde inte lägga till faktura'),
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ProjectInvoice> }) =>
      updateProjectInvoice(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-invoices', projectId] });
      toast.success('Faktura uppdaterad');
    },
    onError: () => toast.error('Kunde inte uppdatera faktura'),
  });

  const removeInvoiceMutation = useMutation({
    mutationFn: deleteProjectInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-invoices', projectId] });
      toast.success('Faktura borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort faktura'),
  });

  const isLoading = budgetLoading || timeReportsLoading || purchasesLoading || quotesLoading || invoicesLoading;

  return {
    budget,
    timeReports,
    purchases,
    quotes,
    invoices,
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
  };
};
