import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFortnoxInvoice } from '@/services/fortnoxInvoiceService';
import type { FortnoxInvoicePayload, FortnoxClientData } from '@/types/fortnoxInvoice';
import { toast } from '@/hooks/use-toast';

interface CreateInvoiceParams {
  payload: FortnoxInvoicePayload;
  clientData?: FortnoxClientData;
}

export function useCreateFortnoxInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ payload, clientData }: CreateInvoiceParams) =>
      createFortnoxInvoice(payload, clientData),
    onSuccess: (data) => {
      toast({
        title: 'Faktura skapad',
        description: `Fakturanummer: ${data.invoiceNumber}`,
      });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fakturering misslyckades',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
