import { supabase } from '@/integrations/supabase/client';
import type { FortnoxInvoicePayload, FortnoxClientData, FortnoxInvoiceResponse } from '@/types/fortnoxInvoice';

const FORTNOX_EDGE_URL = 'https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/fortnox-create-invoice';

export async function createFortnoxInvoice(
  payload: FortnoxInvoicePayload,
  clientData?: FortnoxClientData
): Promise<FortnoxInvoiceResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Ingen aktiv session – logga in igen.');
  }

  const body: Record<string, unknown> = { payload };
  if (clientData) {
    body.clientData = clientData;
  }

  const res = await fetch(FORTNOX_EDGE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data: FortnoxInvoiceResponse = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || `Fortnox-anrop misslyckades (${res.status})`);
  }

  return data;
}
