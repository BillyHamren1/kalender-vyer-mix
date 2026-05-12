import { PackingWithBooking, PackingParcel } from "@/types/packing";
import { getToken, clearAuth } from "@/services/mobileApiService";
import { supabase } from "@/integrations/supabase/client";

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
    throw new Error('Nätverksfel — kontrollera anslutningen');
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
    throw err;
  }

  return response.json();
};

// ============== PARCEL (KOLLI) FUNCTIONS ==============

export const createParcel = async (
  packingId: string, 
  createdBy: string
): Promise<PackingParcel> => {
  return callScannerApi('create_parcel', { packingId, createdBy });
};

export const assignItemToParcel = async (
  itemId: string,
  parcelId: string | null,
  options?: { quantity?: number; scannedBy?: string; clearAllocations?: boolean }
): Promise<void> => {
  await callScannerApi('assign_item_to_parcel', {
    itemId,
    parcelId,
    quantity: options?.quantity,
    scannedBy: options?.scannedBy,
    clearAllocations: options?.clearAllocations,
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
): Promise<{ success: boolean; parcel?: QrParcel; error?: string }> => {
  return callScannerApi('register_qr_parcel', { packingId, qrCode, createdBy });
};
export const listQrParcels = async (packingId: string): Promise<QrParcel[]> => {
  const res = await callScannerApi('list_qr_parcels', { packingId });
  return res?.parcels || [];
};
export const deleteQrParcel = async (parcelId: string): Promise<void> => {
  await callScannerApi('delete_qr_parcel', { parcelId });
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

export interface ReturnScanResult {
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
): Promise<ReturnScanResult> => {
  try {
    return await callScannerApi('return_scan_sku', { packingId, sku, returnedBy });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Scan failed', debugCode: err?.debugCode };
  }
};

export const physicalReturnScan = async (
  packingId: string,
  scannedValue: string,
  returnedBy?: string,
): Promise<ReturnScanResult> => {
  try {
    return await callScannerApi('physical_return_scan', { packingId, scannedValue, returnedBy });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Scan failed', debugCode: err?.debugCode };
  }
};

export const returnToggleItem = async (
  itemId: string,
  returnedBy?: string,
): Promise<ReturnScanResult> => {
  return callScannerApi('return_toggle_item', { itemId, returnedBy });
};

export const returnDecrementItem = async (itemId: string): Promise<ReturnScanResult> => {
  return callScannerApi('return_decrement_item', { itemId });
};

export const returnResetItem = async (itemId: string): Promise<{ success: boolean }> => {
  return callScannerApi('reset_return_item', { itemId });
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
  verifiedByStaffId?: string | null
): Promise<{
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
  // WMS debug fields (source of truth for the scanned QR)
  matchedBy?: 'item_type_id' | 'sku' | 'name_fallback' | null;
  wmsInstanceId?: string | null;
  wmsItemTypeId?: string | null;
  wmsSerialNumber?: string | null;
  wmsSku?: string | null;
}> => {
  return callScannerApi('verify_product', { packingId, sku, verifiedBy, activeParcelId: activeParcelId || null, verifiedByStaffId: verifiedByStaffId || null });
};

// Add an unknown product (scanned but not in packing list) to both
// the booking_products and packing_list_items, with 1 already packed.
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
): Promise<{ success: boolean; itemId?: string; bookingProductId?: string; productName?: string; error?: string }> => {
  return callScannerApi('add_unknown_product', {
    packingId,
    sku,
    name,
    quantityToPack,
    verifiedBy,
    verifiedByStaffId: verifiedByStaffId || null,
    // Preserve WMS identity so the new booking_products row stays linked to inventory.
    inventoryItemTypeId: wms?.wmsItemTypeId || null,
    wmsItemTypeId: wms?.wmsItemTypeId || null,
    wmsSku: wms?.wmsSku || null,
    wmsInstanceId: wms?.wmsInstanceId || null,
    wmsSerialNumber: wms?.wmsSerialNumber || null,
  });
};

// Toggle a packing item manually (optionally allocate the increment to an active parcel).
// On increment, scanner-api also pushes a manual-pack-scan to Bundle Builder.
export const togglePackingItemManually = async (
  itemId: string,
  currentlyPacked: boolean,
  quantityToPack: number,
  verifiedBy: string,
  activeParcelId?: string | null,
  verifiedByStaffId?: string | null
): Promise<{
  success: boolean;
  error?: string;
  manualScan?: boolean;
  bundleSynced?: boolean;
  warning?: string;
  productName?: string;
  newQuantity?: number;
  // WMS rejection details — surfaced so UIs can show a clear, specific error
  // and skip optimistic updates when the manual check-off was refused.
  bundleErrorCode?: string | null;
  bundleError?: string | null;
  hardWmsError?: boolean;
}> => {
  return callScannerApi('toggle_item', { itemId, currentlyPacked, quantityToPack, verifiedBy, activeParcelId: activeParcelId || null, verifiedByStaffId: verifiedByStaffId || null });
};

// Decrement a packing item by 1
export const decrementPackingItem = async (
  itemId: string,
  verifiedBy: string
): Promise<{ success: boolean; error?: string }> => {
  return callScannerApi('decrement_item', { itemId });
};

// Decrement by serial / RFID (looks up SKU via WMS first)
export const decrementBySerial = async (
  packingId: string,
  serialNumber: string
): Promise<{ success: boolean; error?: string; itemId?: string; newQuantity?: number; productName?: string }> => {
  return callScannerApi('decrement_by_serial', { packingId, serialNumber });
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
  canStartScanning: boolean;
  items: PreflightItem[];
  error?: string;
}

export const runPackingPreflightCheck = async (
  packingId: string,
  bookingNumber?: string | null,
): Promise<PreflightResult> => {
  const { data, error } = await supabase.functions.invoke('packing-preflight-check', {
    body: { packing_id: packingId, booking_number: bookingNumber ?? undefined },
  });
  if (error) throw new Error(error.message || 'Preflight failed');
  return data as PreflightResult;
};

// Identify a product by serial number or SKU (home screen lookup)
export const identifyProduct = async (serialOrSku: string): Promise<{
  found: boolean;
  name?: string;
  sku?: string;
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
  item_type_id?: string | null;
  sku?: string | null;
  item_type_name?: string | null;
}
export interface ReservationAllocationsResponse {
  success: boolean;
  reservation_id?: string;
  packing_id?: string;
  allocations: WmsAllocation[];
  current_state?: any;
  error?: string;
}

/** Hydrera lokal scan-state med WMS-allokerade serienummer för denna packlista. */
export const getReservationAllocations = async (
  packingId: string,
): Promise<ReservationAllocationsResponse> => {
  return callScannerApi('get_reservation_allocations', { packingId });
};

