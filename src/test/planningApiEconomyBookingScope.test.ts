import { afterEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke } },
}));

vi.mock('@/services/booking/liveBookingService', () => ({
  updateBookingFieldsViaSource: vi.fn(),
  assertBookingProductWriteUnavailable: vi.fn(),
  assertBookingAttachmentWriteUnavailable: vi.fn(),
}));

import {
  deleteInvoice,
  deletePurchase,
  deleteQuote,
  updateInvoice,
  updatePurchase,
  updateQuote,
  updateSupplierInvoiceLink,
} from '@/services/planningApiService';

const bookingId = '8e16aa4d-d865-4b02-b648-f43cbe2b1a5a';

describe('economy writes preserve the booking ID for cache refresh', () => {
  afterEach(() => invoke.mockClear());

  it.each([
    ['purchase update', () => updatePurchase('row-1', { amount: 10 }, bookingId)],
    ['purchase delete', () => deletePurchase('row-1', bookingId)],
    ['quote update', () => updateQuote('row-1', { quoted_amount: 10 }, bookingId)],
    ['quote delete', () => deleteQuote('row-1', bookingId)],
    ['invoice update', () => updateInvoice('row-1', { invoiced_amount: 10 }, bookingId)],
    ['invoice delete', () => deleteInvoice('row-1', bookingId)],
    ['supplier invoice link update', () => updateSupplierInvoiceLink('row-1', { linked_cost_type: null, linked_cost_id: null }, bookingId)],
  ])('sends booking_id for %s', async (_label, write) => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    await write();
    expect(invoke).toHaveBeenCalledWith('planning-api-proxy', {
      body: expect.objectContaining({ booking_id: bookingId }),
    });
  });
});
