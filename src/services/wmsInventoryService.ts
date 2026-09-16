import { supabase } from '@/integrations/supabase/client';

export interface WmsInventoryItemType {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  isPackableDefault: boolean;
  revision: number;
  updatedAt: string | null;
}
export interface WmsInventoryPage {
  items: WmsInventoryItemType[];
  total: number;
}

export interface PackabilityMutationItem {
  id: string;
  is_packable_default: boolean;
  expected_revision: number;
}

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/** Canonical external WMS item_types adapter. */
export function normalizeWmsInventoryItemType(raw: Record<string, unknown>): WmsInventoryItemType {
  const id = textOrNull(raw.id ?? raw.item_type_id);
  if (!id) throw new Error('WMS returnerade en produkt utan item_type-id.');

  return {
    id,
    sku: textOrNull(raw.sku),
    name: textOrNull(raw.name ?? raw.name_sv ?? raw.name_en) ?? 'Namnlös produkt',
    category: textOrNull(raw.category ?? raw.category_name),
    // Existing types stay packable when talking to a pre-migration WMS.
    isPackableDefault: raw.is_packable_default !== false,
    revision: Number.isFinite(raw.packability_revision ?? raw.revision)
      ? Number(raw.packability_revision ?? raw.revision)
      : 0,
    updatedAt: textOrNull(raw.packability_updated_at ?? raw.updated_at),
  };
}

export function buildPackabilityMutationItems(
  items: Array<Pick<WmsInventoryItemType, 'id' | 'revision'>>,
  isPackableDefault: boolean,
): PackabilityMutationItem[] {
  const unique = new Map(items.map((item) => [item.id.trim(), item]));
  unique.delete('');
  if (unique.size === 0) throw new Error('Välj minst en produkt.');
  return [...unique.values()].map((item) => ({
    id: item.id.trim(),
    is_packable_default: isPackableDefault,
    expected_revision: item.revision,
  }));
}

const invoke = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('wms-item-types-admin', { body });
  if (error) throw new Error(error.message || 'WMS-anropet misslyckades.');
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
};

export async function fetchWmsInventoryItemTypes(input: {
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<WmsInventoryPage> {
  const response = await invoke<any>({
    action: 'list',
    search: input.search?.trim() || undefined,
    limit: input.limit ?? 100,
    offset: input.offset ?? 0,
  });
  const payload = response?.data ?? response;
  const rows = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.item_types)
      ? payload.item_types
      : [];
  return {
    items: rows.map((row: Record<string, unknown>) => normalizeWmsInventoryItemType(row)),
    total: Number.isFinite(payload?.total) ? Number(payload.total) : rows.length,
  };
}

export async function updateWmsItemTypePackability(
  items: Array<Pick<WmsInventoryItemType, 'id' | 'revision'>>,
  isPackableDefault: boolean,
): Promise<WmsInventoryItemType[]> {
  const mutations = buildPackabilityMutationItems(items, isPackableDefault);
  const response = await invoke<any>({
    action: mutations.length === 1 ? 'update_packability' : 'bulk_update_packability',
    items: mutations,
  });
  const payload = response?.data ?? response;
  const rows = Array.isArray(payload?.items)
    ? payload.items
    : payload?.item_type
      ? [payload.item_type]
      : [];
  return rows.map((row: Record<string, unknown>) => normalizeWmsInventoryItemType(row));
}
