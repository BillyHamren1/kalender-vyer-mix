import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type BillingStatus = 
  | 'not_ready'
  | 'under_review'
  | 'ready_to_invoice'
  | 'invoice_created'
  | 'invoiced'
  | 'partially_paid'
  | 'paid'
  | 'overdue';

export type ReviewStatus = 'pending' | 'in_review' | 'needs_completion' | 'approved';

export interface ReviewChecklist {
  hours_registered?: boolean;
  materials_included?: boolean;
  transport_included?: boolean;
  additions_registered?: boolean;
  client_info_correct?: boolean;
  deviation_checked?: boolean;
  invoice_info_complete?: boolean;
  internal_note_added?: boolean;
  ready_for_invoicing?: boolean;
}

export interface ProjectBilling {
  id: string;
  project_id: string;
  project_type: 'small' | 'medium' | 'large';
  billing_status: BillingStatus;
  project_name: string;
  client_name: string | null;
  booking_id: string | null;
  project_leader: string | null;
  closed_at: string | null;
  event_date: string | null;
  delivery_date: string | null;
  quoted_amount: number;
  invoiceable_amount: number;
  invoiced_amount: number;
  total_cost: number;
  invoice_number: string | null;
  external_invoice_id: string | null;
  invoice_reference: string | null;
  invoice_date: string | null;
  due_date: string | null;
  invoice_sent_at: string | null;
  invoice_paid_at: string | null;
  review_status: ReviewStatus;
  review_completed_at: string | null;
  approved_for_invoicing_at: string | null;
  approved_by: string | null;
  review_checklist: ReviewChecklist;
  internal_notes: string | null;
  organization_id: string;
  created_at: string;
  updated_at: string;
}

export function useProjectBillingList() {
  return useQuery({
    queryKey: ['project-billing'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_billing')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectBilling[];
    },
  });
}

export function useProjectBillingDetail(id: string | null) {
  return useQuery({
    queryKey: ['project-billing', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('project_billing')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as unknown as ProjectBilling;
    },
    enabled: !!id,
  });
}

export function useCreateProjectBilling() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      project_id: string;
      project_type: 'small' | 'medium' | 'large';
      project_name: string;
      client_name?: string;
      booking_id?: string;
      project_leader?: string;
      event_date?: string;
      quoted_amount?: number;
      invoiceable_amount?: number;
      total_cost?: number;
    }) => {
      const { data, error } = await supabase
        .from('project_billing')
        .upsert({
          project_id: params.project_id,
          project_type: params.project_type,
          billing_status: 'under_review',
          project_name: params.project_name,
          client_name: params.client_name ?? null,
          booking_id: params.booking_id ?? null,
          project_leader: params.project_leader ?? null,
          event_date: params.event_date ?? null,
          quoted_amount: params.quoted_amount ?? 0,
          invoiceable_amount: params.invoiceable_amount ?? 0,
          total_cost: params.total_cost ?? 0,
          closed_at: new Date().toISOString(),
          review_status: 'pending',
        } as any, {
          onConflict: 'project_id,project_type,organization_id',
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ProjectBilling;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-billing'] });
    },
  });
}

export function useUpdateProjectBilling() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ProjectBilling> & { id: string }) => {
      const { data, error } = await supabase
        .from('project_billing')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ProjectBilling;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-billing'] });
    },
    onError: (err: Error) => {
      toast.error('Kunde inte uppdatera: ' + err.message);
    },
  });
}

// Convenience: advance billing status
export function useAdvanceBillingStatus() {
  const update = useUpdateProjectBilling();
  
  return {
    ...update,
    advance: (id: string, newStatus: BillingStatus, extras?: Partial<ProjectBilling>) => {
      const timestampFields: Partial<ProjectBilling> = {};
      if (newStatus === 'ready_to_invoice') {
        timestampFields.approved_for_invoicing_at = new Date().toISOString();
        timestampFields.review_status = 'approved';
        timestampFields.review_completed_at = new Date().toISOString();
      }
      if (newStatus === 'invoiced') {
        timestampFields.invoice_sent_at = new Date().toISOString();
      }
      if (newStatus === 'paid') {
        timestampFields.invoice_paid_at = new Date().toISOString();
      }
      
      return update.mutate({
        id,
        billing_status: newStatus,
        ...timestampFields,
        ...extras,
      } as any);
    },
  };
}

// Group billing records by status
export function groupByBillingStatus(items: ProjectBilling[]) {
  const groups: Record<BillingStatus, ProjectBilling[]> = {
    not_ready: [],
    under_review: [],
    ready_to_invoice: [],
    invoice_created: [],
    invoiced: [],
    partially_paid: [],
    paid: [],
    overdue: [],
  };
  
  for (const item of items) {
    // Check for overdue
    if (
      item.due_date &&
      new Date(item.due_date) < new Date() &&
      item.billing_status !== 'paid' &&
      item.billing_status !== 'partially_paid' &&
      ['invoiced', 'invoice_created'].includes(item.billing_status)
    ) {
      groups.overdue.push(item);
    } else {
      groups[item.billing_status].push(item);
    }
  }
  
  return groups;
}
