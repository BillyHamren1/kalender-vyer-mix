import { PackingWithBooking, PackingParcel } from "@/types/packing";
import { getToken, clearAuth } from "@/services/mobileApiService";
import { supabase } from "@/integrations/supabase/client";
import { newOperationId } from '@/services/scannerOperationV2Service';
import type { LegacyWmsResult } from '@/lib/scanner/legacyWmsOutcome';

const LEGACY_WMS_MUTATION_ACTIONS = new Set([
  'verify_product',
  'toggle_item',
  'decrement_by_serial',
  'physical_return_scan',
]);

export interface ScanResult {
  type: 'packing_id' | 'product_sku' | 'rfid_tag' | 'serial' | 'unknown';
  value: string;
  packingId?: string;
  /**
   * Whether the scanned code identifies a *unique* physical instance
   * (RFID EPC, serial number) — those must be deduped per session.
   * SKU/article barcodes are *repeatable* and may be scanned many times.
   */
  unique: boolean;
}

// Helper to call the scanner-api edge function with auth token
const callScannerApi = async (action: string, params: Record<string, any> = {}) => {
  const url = `https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/scanner-api`;
  const token = getToken();

  console.log(`[scanner-api] → ${action}`, Object.keys(params).length > 0 ? params : '');

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token, ...params })
    });
  } catch (networkErr: any) {
    console.error(`[scanner-api] ✗ network error for ${action}:`, networkErr?.message);
    const wmsOutcomeUnknown = LEGACY_WMS_MUTATION_ACTIONS.has(action);
    const err: any = new Error(wmsOutcomeUnknown
      ? 'Nätverksfel — WMS-resultatet är okänt'
      : 'Nätverksfel — kontrollera anslutningen');
    err.operationId = params.operationId ?? null;
    err.outcome = wmsOutcomeUnknown ? 'unknown' : undefined;
    err.outcomeUnknown = wmsOutcomeUnknown;
    throw err;
  }

  if (response.status === 401) {
    let debugCode = 'AUTH_UNKNOWN';
    try {
      const body = await response.clone().json();
      debugCode = body?.debugCode || debugCode;
      console.warn(`[scanner-api] ✗ 401 ${action} debugCode=${debugCode} msg=${body?.error}`);
    } catch {
      console.warn(`[scanner-api] ✗ 401 ${action} (no body)`);
    }
    clearAuth();
    // Redirect to login so user gets a clear path forward instead of a silent failure on every scan.
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      setTimeout(() => { window.location.href = '/scanner/login'; }, 300);
    }
    throw new Error('Session expired — logga in igen');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    console.error(`[scanner-api] ✗ ${response.status} ${action}`, errorData);
    const err: any = new Error(errorData.error || `API error: ${response.status}`);
    err.debugCode = errorData.debugCode;
    err.status = response.status;
    err.operationId = errorData.operationId ?? params.operationId ?? null;
    err.outcome = errorData.outcome;
    err.authority = errorData.authority ?? null;
    err.outcomeUnknown = errorData.outcomeUnknown === true || errorData.outcome === 'unknown';
    throw err;
  }

  return response.json();
};

// ============== PACKING WORK SESSION ==============

export interface PackingWorkSession {
  id: string;
  organization_id: string;
  packing_id: string;
  staff_id: string;
  staff_name: string;
  status: 'active' | 'signed' | string;
  started_at: string;
  ended_at: string | null;
  signed_at: string | null;
  signature_name: string | null;
  summary_json: any | null;
}

export const startPackingSession = async (
  packingId: string,
): Promise<{ success: boolean; session?: PackingWorkSession; reused?: boolean; error?: string }> => {
  return callScannerApi('start_packing_session', { packingId });
};

export const getActivePackingSession = async (
  packingId: string,
): Promise<{ success: boolean; session: PackingWorkSession | null }> => {
  return callScannerApi('get_active_packing_session', { packingId });
};

export const closePackingSession = async (
  sessionId: string,
  signatureName: string,
  options?: { closeWithoutChanges?: boolean },
): Promise<{ success: boolean; session?: PackingWorkSession; error?: string; code?: string }> => {
  try {
    return await callScannerApi('close_packing_session', {
      sessionId,
      signatureName,
      closeWithoutChanges: options?.closeWithoutChanges === true,
    });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Kunde inte stänga session', code: err?.debugCode };
  }
};

export const getPackingHistory = async (
  packingId: string,
  limit?: number,
): Promise<{ success: boolean; sessions: any[]; events: any[] }> => {
  return callScannerApi('get_packing_history', { packingId, limit });
};

// ============== CONTROL COUNT (kontrollräkning) ==============

export interface ControlSession {
  id: string;
  organization_id: string;
  packing_id: string;
  staff_id: string;
  staff_name: string;
  status: 'in_progress' | 'completed' | string;
  started_at: string;
  completed_at: string | null;
  signed_at: string | null;
  signature_name: string | null;
  summary_json: any | null;
}

export interface ControlNextItem {
  id: string;
  product_name: string;
  expected_quantity: number;
  parent_product_id: string | null;
  product_id: string | null;
}

export interface ControlProgress {
  answered: number;
  total: number;
  index: number;
}

export const startControlCount = async (
  packingId: string,
): Promise<{
  success: boolean;
  session?: ControlSession;
  next_item?: ControlNextItem | null;
  progress?: ControlProgress;
  reused?: boolean;
  error?: string;
  code?: string;
}> => {
  try {
    return await callScannerApi('start_control_count', { packingId });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Kunde inte starta kontroll', code: err?.debugCode };
  }
};

export const getControlSession = async (
  packingId?: string,
  sessionId?: string,
): Promise<{ success: boolean; session: ControlSession | null; answers?: any[] }> => {
  return callScannerApi('get_control_session', { packingId, sessionId });
};

export const getControlNextItem = async (
  sessionId: string,
): Promise<{
  success: boolean;
  next_item: ControlNextItem | null;
  progress: ControlProgress;
  done: boolean;
}> => {
  return callScannerApi('get_control_next_item', { sessionId });
};

export const answerControlItem = async (
  sessionId: string,
  packingListItemId: string,
  answer: 'yes' | 'no',
  comment?: string,
): Promise<{
  success: boolean;
  next_item: ControlNextItem | null;
  progress: ControlProgress;
  done: boolean;
  error?: string;
  code?: string;
}> => {
  try {
    return await callScannerApi('answer_control_item', {
      sessionId,
      packingListItemId,
      answer,
      comment,
    });
  } catch (err: any) {
    return {
      success: false,
      next_item: null,
      progress: { answered: 0, total: 0, index: 0 },
      done: false,
      error: err?.message || 'Kunde inte spara svar',
      code: err?.debugCode,
    };
  }
};

export const completeControlCount = async (
  sessionId: string,
  signatureName: string,
): Promise<{
  success: boolean;
  session?: ControlSession;
  result?: 'completed' | 'failed';
  totals?: { total: number; yes: number; no: number };
  error?: string;
  code?: string;
}> => {
  try {
    return await callScannerApi('complete_control_count', { sessionId, signatureName });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Kunde inte slutföra', code: err?.debugCode };
  }
};

// ============== PARCEL (KOLLI) FUNCTIONS ==============

export const createParcel = async (
  packingId: string,
  createdBy: string,
  activeSessionId?: string | null,
): Promise<PackingParcel> => {
  return callScannerApi('create_parcel', { packingId, createdBy, activeSessionId: activeSessionId || null });
};

export const assignItemToParcel = async (
  itemId: string,
  parcelId: string | null,
  options?: { quantity?: number; scannedBy?: string; clearAllocations?: boolean; activeSessionId?: string | null }
): Promise<void> => {
  await callScannerApi('assign_item_to_parcel', {
    itemId,
    parcelId,
    quantity: options?.quantity,
    scannedBy: options?.scannedBy,
    clearAllocations: options?.clearAllocations,
    activeSessionId: options?.activeSessionId || null,
  });
};

export const getParcelsByPacking = async (packingId: string): Promise<PackingParcel[]> => {
  return callScannerApi('get_parcels', { packingId });
};

// LEGACY: returns the highest parcel number per item. Use getItemAllocations for full split.
export const getItemParcels = async (packingId: string): Promise<Record<string, number>> => {
  return callScannerApi('get_item_parcels', { packingId });
};

// New: returns full parcel breakdown per item.
export type ItemAllocation = { parcelId: string; parcelNumber: number; quantity: number };
export const getItemAllocations = async (packingId: string): Promise<Record<string, ItemAllocation[]>> => {
  return callScannerApi('get_item_allocations', { packingId });
};

// QR-coded parcels (free-form QR sticker on physical parcel; no product allocations)
export interface QrParcel {
  id: string;
  parcel_number: number;
  qr_code: string;
  is_qr_only: boolean;
  created_by: string | null;
  created_at: string;
}
export const registerQrParcel = async (
  packingId: string,
  qrCode: string,
  createdBy?: string,
  activeSessionId?: string | null,
): Promise<{ success: boolean; parcel?: QrParcel; error?: string }> => {
  return callScannerApi('register_qr_parcel', { packingId, qrCode, createdBy, activeSessionId: activeSessionId || null });
};
export const listQrParcels = async (packingId: string): Promise<QrParcel[]> => {
  const res = await callScannerApi('list_qr_parcels', { packingId });
  return res?.parcels || [];
};
export const deleteQrParcel = async (parcelId: string, activeSessionId?: string | null): Promise<void> => {
  await callScannerApi('delete_qr_parcel', { parcelId, activeSessionId: activeSessionId || null });
};


// Parse a scanned value to determine what type it is (client-side only, no DB)
// Always trims the input to handle trailing whitespace/newlines from hardware scanners.
//
// Classification:
//   - packing_id  → ONLY explicit packing/verify URL (e.g. /warehouse/packing/{uuid}/verify).
//                   A bare UUID is NOT a packing_id — WMS must resolve it.
//   - serial      → bare UUID OR long physical QR/serial (>=14 mixed alphanum) — UNIQUE,
//                   sent to WMS (scanner-api verify_product) for resolution.
//   - rfid_tag    → long EPC/hex string (>=20 hex chars) — UNIQUE EPC, dedup per session.
//   - product_sku → everything else (article codes) — REPEATABLE.
export const parseScanResult = (scannedValue: string): ScanResult => {
  const trimmed = scannedValue.trim();

  // Packing list URL: explicit warehouse/packing path with verify
  // Example: /warehouse/packing/{uuid}/verify
  const packingUrlMatch = trimmed.match(/\/(?:warehouse\/)?packing\/([a-f0-9-]+)\/verify/);
  if (packingUrlMatch) {
    return { type: 'packing_id', value: packingUrlMatch[1], packingId: packingUrlMatch[1], unique: false };
  }

  // Bare UUID can be either a physical WMS item_instance id or a packing id.
  // In scanner verify mode we must let WMS resolve it, so only explicit
  // packing URLs are treated as packing_id.
  const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (uuidPattern.test(trimmed)) {
    return { type: 'serial', value: trimmed, unique: true };
  }

  // RFID EPC: long pure-hex string (typical Zebra EPC = 24 hex chars)
  if (trimmed.length >= 20 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    return { type: 'rfid_tag', value: trimmed, unique: true };
  }

  // Serial number heuristic: long mixed alphanum (>=14 chars, contains both letters and digits)
  if (trimmed.length >= 14 && /[A-Za-z]/.test(trimmed) && /[0-9]/.test(trimmed)) {
    return { type: 'serial', value: trimmed, unique: true };
  }

  // Default: SKU / article code — repeatable
  return { type: 'product_sku', value: trimmed, unique: false };
};

// Fetch active packing projects
export const fetchActivePackings = async (): Promise<PackingWithBooking[]> => {
  const packings: PackingWithBooking[] = await callScannerApi('list_active_packings');

  // Sort: in_progress first, then by nearest date
  packings.sort((a, b) => {
    if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
    if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
    const dateA = a.booking?.rigdaydate || a.booking?.eventdate;
    const dateB = b.booking?.rigdaydate || b.booking?.eventdate;
    if (dateA && dateB) return new Date(dateA).getTime() - new Date(dateB).getTime();
    if (dateA) return -1;
    if (dateB) return 1;
    return 0;
  });

  return packings;
};

// Fetch a single packing by ID (for scanner use)
export const fetchPackingForScanner = async (id: string): Promise<PackingWithBooking | null> => {
  return callScannerApi('get_packing', { id });
};

// Fetch packing list items
export const fetchPackingListItems = async (packingId: string) => {
  const data = await callScannerApi('get_packing_items', { packingId });
  return sortPackingItems(data || []);
};

// ============== RETURN (IN) FLOW ==============

export interface ReturnScanResult extends LegacyWmsResult {
  success: boolean;
  itemId?: string;
  productName?: string;
  quantity_returned?: number;
  quantity_packed?: number;
  alreadyReturned?: boolean;
  wms?: { item_type_id?: string; sku?: string; instance_id?: string } | null;
  error?: string;
  debugCode?: string;
}

export const returnScanSku = async (
  packingId: string,
  sku: string,
  returnedBy?: string,
  activeSessionId?: string | null,
): Promise<ReturnScanResult> => {
  const operationId = newOperationId();
  try {
    return await callScannerApi('return_scan_sku', { packingId, sku, returnedBy, activeSessionId: activeSessionId || null, operationId });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Scan failed', debugCode: err?.debugCode, operationId: err?.operationId || operationId, outcome: err?.outcome || 'rejected', authority: err?.authority ?? null, outcomeUnknown: err?.outcomeUnknown === true };
  }
};

export const physicalReturnScan = async (
  packingId: string,
  scannedValue: string,
  returnedBy?: string,
  activeSessionId?: string | null,
  operationId: string = newOperationId(),
): Promise<ReturnScanResult> => {
  try {
    return await callScannerApi('physical_return_scan', { packingId, scannedValue, returnedBy, activeSessionId: activeSessionId || null, operationId });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Scan failed', debugCode: err?.debugCode, operationId: err?.operationId || operationId, outcome: err?.outcome || 'rejected', authority: err?.authority ?? null, outcomeUnknown: err?.outcomeUnknown === true };
  }
};

export const returnToggleItem = async (
  itemId: string,
  returnedBy?: string,
  activeSessionId?: string | null,
): Promise<ReturnScanResult> => {
  const operationId = newOperationId();
  try {
    return await callScannerApi('return_toggle_item', { itemId, returnedBy, activeSessionId: activeSessionId || null, operationId });
  } catch (err: any) {
    return { success: false, error: err?.message, debugCode: err?.debugCode, operationId: err?.operationId || operationId, outcome: err?.outcome || 'rejected', outcomeUnknown: err?.outcomeUnknown === true };
  }
};

export const returnDecrementItem = async (itemId: string, activeSessionId?: string | null): Promise<ReturnScanResult> => {
  const operationId = newOperationId();
  try {
    return await callScannerApi('return_decrement_item', { itemId, activeSessionId: activeSessionId || null, operationId });
  } catch (err: any) {
    return { success: false, error: err?.message, debugCode: err?.debugCode, operationId: err?.operationId || operationId, outcome: err?.outcome || 'rejected', outcomeUnknown: err?.outcomeUnknown === true };
  }
};

export const returnResetItem = async (itemId: string, activeSessionId?: string | null): Promise<ReturnScanResult> => {
  const operationId = newOperationId();
  try {
    return await callScannerApi('reset_return_item', { itemId, activeSessionId: activeSessionId || null, operationId });
  } catch (err: any) {
    return { success: false, error: err?.message, debugCode: err?.debugCode, operationId: err?.operationId || operationId, outcome: err?.outcome || 'rejected', outcomeUnknown: err?.outcomeUnknown === true };
  }
};
const sortPackingItems = (items: any[]) => {
  const mainProducts: typeof items = [];
  const childrenByParent: Record<string, typeof items> = {};
  
  items.forEach(item => {
    const parentId = item.booking_products?.parent_product_id;
    if (!parentId) {
      mainProducts.push(item);
    } else {
      if (!childrenByParent[parentId]) childrenByParent[parentId] = [];
      childrenByParent[parentId].push(item);
    }
  });
  
  Object.values(childrenByParent).forEach(children => {
    children.sort((a, b) => {
      const aName = a.booking_products?.name || '';
      const bName = b.booking_products?.name || '';
      const aIsAccessory = aName.startsWith('↳') || aName.startsWith('└') || aName.startsWith('L,');
      const bIsAccessory = bName.startsWith('↳') || bName.startsWith('└') || bName.startsWith('L,');
      if (!aIsAccessory && bIsAccessory) return -1;
      if (aIsAccessory && !bIsAccessory) return 1;
      return 0;
    });
  });
  
  mainProducts.sort((a, b) => {
    const aName = a.booking_products?.name || '';
    const bName = b.booking_products?.name || '';
    return aName.localeCompare(bName, 'sv');
  });

  const orderedItems: typeof items = [];
  mainProducts.forEach(main => {
    orderedItems.push(main);
    const parentId = main.booking_products?.id;
    if (parentId && childrenByParent[parentId]) {
      orderedItems.push(...childrenByParent[parentId]);
    }
  });
  
  const mainProductIds = new Set(mainProducts.map(m => m.booking_products?.id).filter(Boolean));
  Object.entries(childrenByParent).forEach(([parentId, children]) => {
    if (!mainProductIds.has(parentId)) {
      orderedItems.push(...children);
    }
  });
  
  return orderedItems;
};

// Verify a product by SKU
export const verifyProductBySku = async (
  packingId: string,
  sku: string,
  verifiedBy: string,
  activeParcelId?: string | null,
  verifiedByStaffId?: string | null,
  activeSessionId?: string | null,
  operationId: string = newOperationId(),
): Promise<LegacyWmsResult & {
  success: boolean;
  productName?: string;
  error?: string;
  overscan?: boolean;
  itemId?: string;
  newQuantity?: number;
  quantityToPack?: number;
  notInPackingList?: boolean;
  scannedSku?: string | null;
  scannedName?: string | null;
  bookingId?: string;
  alreadyScanned?: boolean;
  matchedBy?: 'item_type_id' | 'sku' | 'name_fallback' | null;
  wmsInstanceId?: string | null;
  wmsItemTypeId?: string | null;
  wmsSerialNumber?: string | null;
  wmsSku?: string | null;
}> => {
  try {
    return await callScannerApi('verify_product', { packingId, sku, verifiedBy, activeParcelId: activeParcelId || null, verifiedByStaffId: verifiedByStaffId || null, activeSessionId: activeSessionId || null, operationId });
  } catch (err: any) {
    return { success: false, error: err?.message, debugCode: err?.debugCode, operationId: err?.operationId || operationId, outcome: err?.outcome || 'rejected', authority: err?.authority ?? null, outcomeUnknown: err?.outcomeUnknown === true };
  }
};

export interface UnknownProductWmsContext {
  wmsItemTypeId?: string | null;
  wmsSku?: string | null;
  wmsInstanceId?: string | null;
  wmsSerialNumber?: string | null;
}

export const addUnknownProduct = async (
  packingId: string,
  sku: string | null,
  name: string,
  quantityToPack: number,
  verifiedBy: string,
  verifiedByStaffId?: string | null,
  wms?: UnknownProductWmsContext,
  activeSessionId?: string | null,
): Promise<LegacyWmsResult & { itemId?: string; bookingProductId?: string; productName?: string }> => {
  const operationId = newOperationId();
  return callScannerApi('add_unknown_product', {
    packingId,
    sku,
    name,
    quantityToPack,
    verifiedBy,
    verifiedByStaffId: verifiedByStaffId || null,
    inventoryItemTypeId: wms?.wmsItemTypeId || null,
    wmsItemTypeId: wms?.wmsItemTypeId || null,
    wmsSku: wms?.wmsSku || null,
    wmsInstanceId: wms?.wmsInstanceId || null,
    wmsSerialNumber: wms?.wmsSerialNumber || null,
    activeSessionId: activeSessionId || null,
    operationId,
  });
};

export const togglePackingItemManually = async (
  itemId: string,
  currentlyPacked: boolean,
  quantityToPack: number,
  verifiedBy: string,
  activeParcelId?: string | null,
  verifiedByStaffId?: string | null,
  activeSessionId?: string | null,
): Promise<LegacyWmsResult & {
  manualScan?: boolean;
  bundleSynced?: boolean;
  warning?: string;
  productName?: string;
  newQuantity?: number;
  bundleErrorCode?: string | null;
  bundleError?: string | null;
  hardWmsError?: boolean;
}> => {
  const operationId = newOperationId();
  try {
    return await callScannerApi('toggle_item', { itemId, currentlyPacked, quantityToPack, verifiedBy, activeParcelId: activeParcelId || null, verifiedByStaffId: verifiedByStaffId || null, activeSessionId: activeSessionId || null, operationId });
  } catch (err: any) {
    return { success: false, error: err?.message, debugCode: err?.debugCode, operationId: err?.operationId || operationId, outcome: err?.outcome || 'rejected', authority: err?.authority ?? null, outcomeUnknown: err?.outcomeUnknown === true };
  }
};

export const decrementPackingItem = async (
  itemId: string,
  verifiedBy: string,
  activeSessionId?: string | null,
): Promise<LegacyWmsResult> => {
  const operationId = newOperationId();
  try {
    return await callScannerApi('decrement_item', { itemId, activeSessionId: activeSessionId || null, operationId });
  } catch (err: any) {
    return { success: false, error: err?.message, debugCode: err?.debugCode, operationId: err?.operationId || operationId, outcome: err?.outcome || 'rejected', outcomeUnknown: err?.outcomeUnknown === true };
  }
};

export const decrementBySerial = async (
  packingId: string,
  serialNumber: string,
  activeSessionId?: string | null,
  operationId: string = newOperationId(),
): Promise<LegacyWmsResult & { itemId?: string; newQuantity?: number; productName?: string }> => {
  try {
    return await callScannerApi('decrement_by_serial', { packingId, serialNumber, activeSessionId: activeSessionId || null, operationId });
  } catch (err: any) {
    return { success: false, error: err?.message, debugCode: err?.debugCode, operationId: err?.operationId || operationId, outcome: err?.outcome || 'rejected', authority: err?.authority ?? null, outcomeUnknown: err?.outcomeUnknown === true };
  }
};

// Get verification progress
export const getVerificationProgress = async (packingId: string) => {
  return callScannerApi('get_progress', { packingId });
};

// Sign a packing project
export const signPacking = async (
  packingId: string,
  signedBy: string,
  signedByStaffId?: string | null
): Promise<void> => {
  await callScannerApi('sign_packing', { packingId, signedBy, signedByStaffId: signedByStaffId || null });
};

// ============== PREFLIGHT CHECK (WMS coupling validation) ==============
// Calls the read-only `packing-preflight-check` edge function which checks
// each packing_list_item against booking_products and WMS to surface
// mis-coupled products BEFORE scanning starts.

export type PreflightRowStatus = 'PASS' | 'WARNING' | 'BLOCKED';

export interface PreflightWmsMatch {
  id: string | null;
  sku: string | null;
  name: string | null;
  matchedBy: string;
}

export interface PreflightItem {
  packingItemId: string;
  bookingProductId: string | null;
  name: string | null;
  sku: string | null;
  inventoryItemTypeId: string | null;
  quantityToPack: number;
  status: PreflightRowStatus;
  reason: string;
  suggestedFix?: string | null;
  wmsMatches: PreflightWmsMatch[];
}

export interface PreflightResult {
  success: boolean;
  packingId?: string;
  bookingNumber?: string | null;
  summary: { total: number; pass: number; warning: number; blocked: number };
  pendingShortNoticeChanges?: number;
  readiness?: {
    tenantVerified: boolean;
    staffVerified: boolean;
    sessionVerified: boolean;
    bookingVerified: boolean;
    reservationVerified: boolean;
    wmsVerified: boolean;
  };
  canStartScanning: boolean;
  items: PreflightItem[];
  error?: string;
  debugCode?: string;
}

export const runPackingPreflightCheck = async (
  packingId: string,
  bookingNumber?: string | null,
  options?: { sessionId?: string | null; reservationId?: string | null },
): Promise<PreflightResult> => {
  const token = getToken();
  const baseUrl = ((import.meta as any).env?.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
  if (!token) throw new Error('Aktiv mobil session saknas');
  if (!baseUrl) throw new Error('Scanner backend saknas');

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/functions/v1/packing-preflight-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        packing_id: packingId,
        booking_number: bookingNumber ?? null,
        session_id: options?.sessionId ?? null,
        reservation_id: options?.reservationId ?? null,
      }),
    });
  } catch {
    throw new Error('WMS-kontrollen kunde inte nås');
  }
  const data = await response.json().catch(() => ({})) as PreflightResult;
  if (!response.ok || !data?.success || data.canStartScanning !== true) {
    const err: any = new Error(data?.error || 'Packlistan är inte verifierad för scanning');
    err.debugCode = data?.debugCode || `PREFLIGHT_${response.status}`;
    throw err;
  }
  return data;
};

// Identify a product by serial number or SKU (home screen lookup)
export const identifyProduct = async (serialOrSku: string): Promise<{
  found: boolean;
  name?: string;
  sku?: string;
  itemTypeId?: string | null;
  reservationLineId?: string | null;
  sourceBookingProductId?: string | null;
  status?: string;
  currentBooking?: string;
  client?: string;
  location?: string;
  error?: string;
}> => {
  return callScannerApi('identify_product', { serialNumber: serialOrSku });
};

// ============== WMS RESERVATION ALLOCATIONS ==============
export interface WmsAllocation {
  serial_number: string;
  instance_id?: string | null;
  reservation_line_id?: string | null;
  source_booking_product_id?: string | null;
  item_type_id?: string | null;
  sku?: string | null;
  item_type_name?: string | null;
}
export interface WmsReservationLine {
  reservation_line_id: string;
  source_booking_product_id: string | null;
  item_type_id: string | null;
  sku: string | null;
  quantity: number | null;
}
export interface ReservationAllocationsResponse {
  success: boolean;
  reservation_id?: string;
  packing_id?: string;
  allocations: WmsAllocation[];
  reservation_lines?: WmsReservationLine[];
  current_state?: any;
  error?: string;
}

/** Hydrera lokal scan-state med WMS-allokerade serienummer för denna packlista. */
export const getReservationAllocations = async (
  packingId: string,
): Promise<ReservationAllocationsResponse> => {
  return callScannerApi('get_reservation_allocations', { packingId });
};
