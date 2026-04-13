import { supabase } from '@/integrations/supabase/client';

/**
 * Generic helper to call the planning-api-proxy edge function.
 * All economy data flows through this to eventflow-bookings backend.
 */
async function callPlanningApi<T = any>(params: {
  type: string;
  method?: string;
  booking_id?: string;
  id?: string;
  data?: Record<string, any>;
}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('planning-api-proxy', {
    body: params,
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

// ===== Budget =====

export const fetchBudget = (bookingId: string) =>
  callPlanningApi({ type: 'budget', method: 'GET', booking_id: bookingId });

export const upsertBudget = (bookingId: string, budget: { budgeted_hours: number; hourly_rate: number; description?: string }) =>
  callPlanningApi({ type: 'budget', method: 'POST', booking_id: bookingId, data: budget });

// ===== Purchases =====

export const fetchPurchases = (bookingId: string) =>
  callPlanningApi({ type: 'purchases', method: 'GET', booking_id: bookingId });

export const createPurchase = (data: Record<string, any>) =>
  callPlanningApi({ type: 'purchases', method: 'POST', data });

export const updatePurchase = (id: string, updates: Record<string, any>) =>
  callPlanningApi({ type: 'purchases', method: 'PUT', id, data: updates });

export const deletePurchase = (id: string) =>
  callPlanningApi({ type: 'purchases', method: 'DELETE', id });

// ===== Quotes =====

export const fetchQuotes = (bookingId: string) =>
  callPlanningApi({ type: 'quotes', method: 'GET', booking_id: bookingId });

export const createQuote = (data: Record<string, any>) =>
  callPlanningApi({ type: 'quotes', method: 'POST', data });

export const updateQuote = (id: string, data: Record<string, any>) =>
  callPlanningApi({ type: 'quotes', method: 'PUT', id, data });

export const deleteQuote = (id: string) =>
  callPlanningApi({ type: 'quotes', method: 'DELETE', id });

// ===== Invoices =====

export const fetchInvoices = (bookingId: string) =>
  callPlanningApi({ type: 'invoices', method: 'GET', booking_id: bookingId });

export const createInvoice = (data: Record<string, any>) =>
  callPlanningApi({ type: 'invoices', method: 'POST', data });

export const updateInvoice = (id: string, data: Record<string, any>) =>
  callPlanningApi({ type: 'invoices', method: 'PUT', id, data });

export const deleteInvoice = (id: string) =>
  callPlanningApi({ type: 'invoices', method: 'DELETE', id });

// ===== Time Reports =====

export const fetchTimeReports = (bookingId: string) =>
  callPlanningApi({ type: 'time_reports', method: 'GET', booking_id: bookingId });

// ===== Product Costs =====

export const fetchProductCostsRemote = (bookingId: string) =>
  callPlanningApi({ type: 'product_costs', method: 'GET', booking_id: bookingId });

// ===== Supplier Invoices (Fortnox) =====

export const fetchSupplierInvoices = (bookingId: string) =>
  callPlanningApi({ type: 'supplier_invoices', method: 'GET', booking_id: bookingId })
    .catch(() => [] as any[]);

export const updateSupplierInvoiceLink = (id: string, data: { linked_cost_type: string | null; linked_cost_id: string | null; is_final_link?: boolean }) =>
  callPlanningApi({ type: 'supplier_invoices', method: 'PUT', id, data });

// ===== Close Project (signal invoicing) =====

export const markReadyForInvoicing = (bookingId: string) =>
  callPlanningApi({ type: 'close_project', method: 'POST', booking_id: bookingId, data: { status: 'READY_FOR_INVOICING' } });

export const markReopenedInBooking = (bookingId: string) =>
  callPlanningApi({ type: 'reopen_project', method: 'POST', booking_id: bookingId, data: { status: 'REOPENED' } });

// ===== Batch (all economy data in one call) =====

export interface BatchEconomyData {
  budget: any;
  time_reports: any;
  purchases: any;
  quotes: any;
  invoices: any;
  product_costs: any;
  supplier_invoices: any;
}

export const fetchAllEconomyData = (bookingId: string): Promise<BatchEconomyData> =>
  callPlanningApi<BatchEconomyData>({ type: 'batch', booking_id: bookingId });

// ===== Multi-Batch (all economy data for multiple bookings in one call) =====

export const fetchAllEconomyDataMulti = (bookingIds: string[]): Promise<Record<string, BatchEconomyData>> =>
  callPlanningApi<Record<string, BatchEconomyData>>({ type: 'multi_batch', booking_ids: bookingIds } as any);

// =============================================================================
// ===== BOOKING WRITE OPERATIONS (Source of Truth: Booking system) ============
// =============================================================================

/**
 * Update booking dates via the Booking system.
 * Planning never writes dates locally — all changes go through this API.
 */
export const updateBookingDatesViaApi = (bookingId: string, data: {
  rigdaydate?: string | null;
  eventdate?: string | null;
  rigdowndate?: string | null;
  rig_start_time?: string | null;
  rig_end_time?: string | null;
  event_start_time?: string | null;
  event_end_time?: string | null;
  rigdown_start_time?: string | null;
  rigdown_end_time?: string | null;
}) => callPlanningApi({ type: 'update_booking', method: 'POST', booking_id: bookingId, data });

/**
 * Update delivery details via the Booking system.
 */
export const updateDeliveryViaApi = (bookingId: string, data: {
  deliveryaddress?: string;
  delivery_city?: string;
  delivery_postal_code?: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
}) => callPlanningApi({ type: 'update_booking', method: 'POST', booking_id: bookingId, data });

/**
 * Update internal notes via the Booking system.
 */
export const updateInternalNotesViaApi = (bookingId: string, notes: string) =>
  callPlanningApi({ type: 'update_booking', method: 'POST', booking_id: bookingId, data: { internalnotes: notes } });

/**
 * Update logistics fields via the Booking system.
 */
export const updateLogisticsViaApi = (bookingId: string, data: {
  carry_more_than_10m?: boolean;
  ground_nails_allowed?: boolean;
  exact_time_needed?: boolean;
  exact_time_info?: string;
}) => callPlanningApi({ type: 'update_booking', method: 'POST', booking_id: bookingId, data });

// ===== Product CRUD via Booking API =====

export const createProductViaApi = (bookingId: string, product: Record<string, any>) =>
  callPlanningApi({ type: 'booking_products', method: 'POST', booking_id: bookingId, data: product });

export const updateProductViaApi = (productId: string, updates: Record<string, any>) =>
  callPlanningApi({ type: 'booking_products', method: 'PUT', id: productId, data: updates });

export const deleteProductViaApi = (productId: string) =>
  callPlanningApi({ type: 'booking_products', method: 'DELETE', id: productId });

// ===== Attachment CRUD via Booking API =====

export const createAttachmentViaApi = (bookingId: string, attachment: Record<string, any>) =>
  callPlanningApi({ type: 'booking_attachments', method: 'POST', booking_id: bookingId, data: attachment });

export const deleteAttachmentViaApi = (attachmentId: string) =>
  callPlanningApi({ type: 'booking_attachments', method: 'DELETE', id: attachmentId });

export const renameAttachmentViaApi = (attachmentId: string, newName: string) =>
  callPlanningApi({ type: 'booking_attachments', method: 'PUT', id: attachmentId, data: { file_name: newName } });
