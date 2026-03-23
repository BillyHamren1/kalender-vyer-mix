import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { AttestStatus, SyncStatus } from '@/components/economy/AttestStatusBadge';

export interface SupplierInvoiceAttestation {
  id: string;
  organization_id: string;
  booking_id: string;
  supplier_invoice_id: string;
  status: AttestStatus;
  attested_at: string | null;
  attested_by: string | null;
  attest_comment: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  reject_reason: string | null;
  booking_sync_status: SyncStatus;
  sent_to_booking_at: string | null;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Use any-typed client for the new table not yet in generated types
const db = () => (supabase as any).from('supplier_invoice_attestations');

export function useSupplierInvoiceAttestations(bookingId: string | null) {
  return useQuery({
    queryKey: ['supplier-invoice-attestations', bookingId],
    queryFn: async () => {
      if (!bookingId) return [];
      const { data, error } = await db()
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SupplierInvoiceAttestation[];
    },
    enabled: !!bookingId,
  });
}

export function useAllAttestations() {
  return useQuery({
    queryKey: ['supplier-invoice-attestations-all'],
    queryFn: async () => {
      const { data, error } = await db()
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SupplierInvoiceAttestation[];
    },
  });
}

export function useEnsureAttestRecords() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ bookingId, supplierInvoiceIds }: { bookingId: string; supplierInvoiceIds: string[] }) => {
      if (!supplierInvoiceIds.length) return [];
      
      const records = supplierInvoiceIds.map(sid => ({
        booking_id: bookingId,
        supplier_invoice_id: sid,
        status: 'imported',
      }));
      
      const { data, error } = await db()
        .upsert(records, {
          onConflict: 'supplier_invoice_id,organization_id',
          ignoreDuplicates: true,
        })
        .select();
      
      if (error) throw error;
      return (data ?? []) as SupplierInvoiceAttestation[];
    },
    onSuccess: (_, { bookingId }) => {
      queryClient.invalidateQueries({ queryKey: ['supplier-invoice-attestations', bookingId] });
      queryClient.invalidateQueries({ queryKey: ['supplier-invoice-attestations-all'] });
    },
  });
}

export function useAttestInvoice() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment?: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userName = userData?.user?.user_metadata?.full_name || userData?.user?.email || 'Okänd';
      
      const { data, error } = await db()
        .update({
          status: 'attested',
          attested_at: new Date().toISOString(),
          attested_by: userName,
          attest_comment: comment || null,
          last_reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as SupplierInvoiceAttestation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-invoice-attestations'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-invoice-attestations-all'] });
      toast.success('Faktura attesterad');
    },
    onError: (err: Error) => {
      toast.error('Kunde inte attestera: ' + err.message);
    },
  });
}

export function useRejectInvoice() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userName = userData?.user?.user_metadata?.full_name || userData?.user?.email || 'Okänd';
      
      const { data, error } = await db()
        .update({
          status: 'rejected',
          rejected_at: new Date().toISOString(),
          rejected_by: userName,
          reject_reason: reason,
          last_reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as SupplierInvoiceAttestation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-invoice-attestations'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-invoice-attestations-all'] });
      toast.success('Faktura avvisad');
    },
    onError: (err: Error) => {
      toast.error('Kunde inte avvisa: ' + err.message);
    },
  });
}

export function useLinkAttestation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data, error } = await db()
        .update({
          status: 'linked',
          last_reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as SupplierInvoiceAttestation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-invoice-attestations'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-invoice-attestations-all'] });
    },
  });
}

export function usePushAttestToBooking() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (attestation: SupplierInvoiceAttestation) => {
      await db()
        .update({
          booking_sync_status: 'sent',
          sent_to_booking_at: new Date().toISOString(),
        })
        .eq('id', attestation.id);
      
      const { data, error } = await supabase.functions.invoke('planning-api-proxy', {
        body: {
          type: 'attest_supplier_invoice',
          method: 'PUT',
          booking_id: attestation.booking_id,
          data: {
            supplier_invoice_id: attestation.supplier_invoice_id,
            status: attestation.status,
            attested_by: attestation.attested_by,
            attested_at: attestation.attested_at,
            comment: attestation.attest_comment,
          },
        },
      });
      
      if (error) {
        await db()
          .update({ booking_sync_status: 'failed' })
          .eq('id', attestation.id);
        throw error;
      }
      
      await db()
        .update({ booking_sync_status: 'confirmed' })
        .eq('id', attestation.id);
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-invoice-attestations'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-invoice-attestations-all'] });
      toast.success('Attest skickad till Booking');
    },
    onError: (err: Error) => {
      toast.error('Sync misslyckades: ' + err.message);
    },
  });
}

export function getAttestationCounts(attestations: SupplierInvoiceAttestation[]) {
  const imported = attestations.filter(a => a.status === 'imported').length;
  const needsReview = attestations.filter(a => a.status === 'needs_review').length;
  const linked = attestations.filter(a => a.status === 'linked').length;
  const attested = attestations.filter(a => a.status === 'attested' || a.status === 'sent_to_booking').length;
  const rejected = attestations.filter(a => a.status === 'rejected').length;
  const unreviewed = imported + needsReview;
  const unattested = imported + needsReview + linked;
  
  return { imported, needsReview, linked, attested, rejected, unreviewed, unattested };
}
