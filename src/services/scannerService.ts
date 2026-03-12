import { PackingWithBooking, PackingParcel } from "@/types/packing";

export interface ScanResult {
  type: 'packing_id' | 'product_sku' | 'unknown';
  value: string;
  packingId?: string;
}

// Helper to call the scanner-api edge function
const callScannerApi = async (action: string, params: Record<string, any> = {}) => {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/scanner-api`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `API error: ${response.status}`);
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
  parcelId: string | null
): Promise<void> => {
  await callScannerApi('assign_item_to_parcel', { itemId, parcelId });
};

export const getParcelsByPacking = async (packingId: string): Promise<PackingParcel[]> => {
  return callScannerApi('get_parcels', { packingId });
};

export const getItemParcels = async (packingId: string): Promise<Record<string, number>> => {
  return callScannerApi('get_item_parcels', { packingId });
};

// ============== EXISTING FUNCTIONS ==============

// Parse a scanned value to determine what type it is (client-side only, no DB)
export const parseScanResult = (scannedValue: string): ScanResult => {
  const packingUrlMatch = scannedValue.match(/\/warehouse\/packing\/([a-f0-9-]+)\/verify/);
  if (packingUrlMatch) {
    return { type: 'packing_id', value: packingUrlMatch[1], packingId: packingUrlMatch[1] };
  }

  const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (uuidPattern.test(scannedValue)) {
    return { type: 'packing_id', value: scannedValue, packingId: scannedValue };
  }

  return { type: 'product_sku', value: scannedValue };
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
  verifiedBy: string
): Promise<{ success: boolean; productName?: string; error?: string }> => {
  return callScannerApi('verify_product', { packingId, sku, verifiedBy });
};

// Toggle a packing item manually
export const togglePackingItemManually = async (
  itemId: string,
  currentlyPacked: boolean,
  quantityToPack: number,
  verifiedBy: string
): Promise<{ success: boolean; error?: string }> => {
  return callScannerApi('toggle_item', { itemId, currentlyPacked, quantityToPack, verifiedBy });
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
