import { PackingWithBooking, PackingParcel } from "@/types/packing";
import { getToken, clearAuth } from "@/services/mobileApiService";

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
      setTimeout(() => { window.location.href = '/login'; }, 300);
    }
    throw new Error('Session expired — logga in igen');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    console.error(`[scanner-api] ✗ ${response.status} ${action}`, errorData);
    const err: any = new Error(errorData.error || `API error: ${response.status}`);
    err.debugCode = errorData.debugCode;
    err.status = response.status;
    // Structured envelope for read-only get_packing_items when list isn't ready.
    if (response.status === 409 && errorData?.__packingListNotReady) {
      err.notReadyPayload = errorData;
    }
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

// ============== EXISTING FUNCTIONS ==============

// Parse a scanned value to determine what type it is (client-side only, no DB)
// Always trims the input to handle trailing whitespace/newlines from hardware scanners.
//
// Classification:
//   - packing_id  → URL or bare UUID pointing at a packing list (not a product)
//   - rfid_tag    → long hex string (>=20 hex chars) — UNIQUE EPC, dedup per session
//   - serial      → mixed alphanum >=14 chars — UNIQUE physical instance, dedup
//   - product_sku → everything else — REPEATABLE (e.g. same article scanned N times)
export const parseScanResult = (scannedValue: string): ScanResult => {
  const trimmed = scannedValue.trim();

  const packingUrlMatch = trimmed.match(/\/warehouse\/packing\/([a-f0-9-]+)\/verify/);
  if (packingUrlMatch) {
    return { type: 'packing_id', value: packingUrlMatch[1], packingId: packingUrlMatch[1], unique: false };
  }

  const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (uuidPattern.test(trimmed)) {
    return { type: 'packing_id', value: trimmed, packingId: trimmed, unique: false };
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

/**
 * Result envelope returned by `fetchPackingListItems`.
 * Either an array of items, or a `not_ready` marker the UI can render.
 */
export interface PackingListNotReady {
  __packingListNotReady: true;
  reason: 'missing_items';
  bookingProductCount: number;
  packingId: string;
  message: string;
}

export type PackingListItemsResult = any[] | PackingListNotReady;

// Fetch packing list items. READ-ONLY on the server — never mutates.
// When the list is empty but the source booking has products, returns a
// `not_ready` envelope so the caller can show a Regenerate button instead
// of mounting the scanner with a half-broken list.
export const fetchPackingListItems = async (packingId: string): Promise<PackingListItemsResult> => {
  try {
    const data = await callScannerApi('get_packing_items', { packingId });
    if (data && typeof data === 'object' && (data as any).__packingListNotReady) {
      return data as PackingListNotReady;
    }
    return sortPackingItems(data || []);
  } catch (err: any) {
    // Edge function returns HTTP 409 with the not_ready envelope; surface that
    // payload to the caller instead of bubbling as a generic error.
    if (err?.status === 409 && err?.notReadyPayload) {
      return err.notReadyPayload as PackingListNotReady;
    }
    throw err;
  }
};

// Explicit, operator-triggered repair of an out-of-sync packing list.
export const repairPackingItems = async (
  packingId: string,
): Promise<{ success: boolean; inserted: number; updated: number; deleted: number; error?: string }> => {
  return callScannerApi('repair_packing_items', { packingId });
};

// Sort packing items: parents first with children underneath
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
  activeParcelId?: string | null
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
}> => {
  return callScannerApi('verify_product', { packingId, sku, verifiedBy, activeParcelId: activeParcelId || null });
};

// Add an unknown product (scanned but not in packing list) to both
// the booking_products and packing_list_items, with 1 already packed.
export const addUnknownProduct = async (
  packingId: string,
  sku: string | null,
  name: string,
  quantityToPack: number,
  verifiedBy: string
): Promise<{ success: boolean; itemId?: string; bookingProductId?: string; productName?: string; error?: string }> => {
  return callScannerApi('add_unknown_product', { packingId, sku, name, quantityToPack, verifiedBy });
};

// Toggle a packing item manually (optionally allocate the increment to an active parcel)
export const togglePackingItemManually = async (
  itemId: string,
  currentlyPacked: boolean,
  quantityToPack: number,
  verifiedBy: string,
  activeParcelId?: string | null
): Promise<{ success: boolean; error?: string }> => {
  return callScannerApi('toggle_item', { itemId, currentlyPacked, quantityToPack, verifiedBy, activeParcelId: activeParcelId || null });
};

// Decrement a packing item by 1
export const decrementPackingItem = async (
  itemId: string,
  verifiedBy: string
): Promise<{ success: boolean; error?: string }> => {
  return callScannerApi('decrement_item', { itemId });
};

// Get verification progress
export const getVerificationProgress = async (packingId: string) => {
  return callScannerApi('get_progress', { packingId });
};

// Sign a packing project
export const signPacking = async (packingId: string, signedBy: string): Promise<void> => {
  await callScannerApi('sign_packing', { packingId, signedBy });
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
