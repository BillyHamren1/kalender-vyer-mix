export const TIME_WMS_PROJECTION_URL =
  'https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/time-wms-outbound/outbound/projection';
export const TIME_WMS_PROJECTION_SCHEMA = 'time-wms-outbound-projection-request.v1' as const;

export interface TimeWmsActor {
  organizationId: string;
  personnelId: string;
  label: string;
}

export interface TimeWmsProjectionRequest {
  schema: typeof TIME_WMS_PROJECTION_SCHEMA;
  bookingId: string;
  bookingNumber: string;
  reservationId: null;
  deviceId: string;
  actor: TimeWmsActor;
}

export interface TimeWmsProjectionDeps {
  hmacSecret: string;
  fetchImpl?: typeof fetch;
  endpoint?: string;
  now?: () => Date;
  nonce?: () => string;
}

export type TimeWmsProjectionResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; code: 'wms_not_configured' | 'wms_unavailable' | 'wms_bad_response'; error: string };

const encoder = new TextEncoder();

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return hex(new Uint8Array(signature));
}

export function buildTimeWmsProjectionRequest(input: {
  bookingId: string;
  bookingNumber: string;
  deviceId: string;
  actor: TimeWmsActor;
}): TimeWmsProjectionRequest {
  return {
    schema: TIME_WMS_PROJECTION_SCHEMA,
    bookingId: input.bookingId,
    bookingNumber: input.bookingNumber,
    reservationId: null,
    deviceId: input.deviceId,
    actor: input.actor,
  };
}

export async function fetchTimeWmsProjection(
  request: TimeWmsProjectionRequest,
  deps: TimeWmsProjectionDeps,
): Promise<TimeWmsProjectionResult> {
  if (!deps.hmacSecret) {
    return { ok: false, code: 'wms_not_configured', error: 'PLANNING_WMS_HMAC_SECRET saknas' };
  }
  if (
    !request.bookingId ||
    !request.bookingNumber ||
    !request.deviceId ||
    !request.actor.organizationId ||
    !request.actor.personnelId ||
    !request.actor.label
  ) {
    return { ok: false, code: 'wms_bad_response', error: 'WMS-anropet saknar verifierad scope eller aktör' };
  }

  const rawBody = JSON.stringify(request);
  // Serverkontraktet verifierar ISO-8601-tidsstämpel (unix-sekunder ger 401 unauthorized).
  const timestamp = (deps.now?.() ?? new Date()).toISOString();
  const nonce = (deps.nonce?.() ?? crypto.randomUUID()).replace(/-/g, '');
  const signature = await hmacSha256Hex(
    deps.hmacSecret,
    `${timestamp}.${nonce}.${rawBody}`,
  );

  let response: Response;
  try {
    response = await (deps.fetchImpl ?? fetch)(deps.endpoint ?? TIME_WMS_PROJECTION_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-time-timestamp': timestamp,
        'x-time-nonce': nonce,
        'x-time-signature': signature,
      },
      body: rawBody,
    });
  } catch (error: unknown) {
    return {
      ok: false,
      code: 'wms_unavailable',
      error: error instanceof Error ? error.message : 'network_error',
    };
  }

  const rawResponse = await response.text().catch(() => '');
  let parsed: unknown = null;
  try {
    parsed = rawResponse ? JSON.parse(rawResponse) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const upstreamError = parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>).error
      : null;
    return {
      ok: false,
      code: 'wms_unavailable',
      error: typeof upstreamError === 'string' ? upstreamError : `HTTP ${response.status}`,
    };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, code: 'wms_bad_response', error: 'WMS-projektionen kunde inte tolkas' };
  }
  return { ok: true, body: parsed as Record<string, unknown> };
}

export function normalizeTimeWmsProjectionBody(value: Record<string, unknown>): any {
  const source = value.projection && typeof value.projection === 'object'
    ? value.projection as Record<string, unknown>
    : value;
  const rawLines = Array.isArray(source.lines)
    ? source.lines
    : Array.isArray(source.rows)
      ? source.rows
      : null;
  if (!rawLines) return null;

  const groups = new Map<string, any>();
  const packageMembers = new Map<string, any[]>();
  const accessories = new Map<string, any[]>();
  const topLevel: any[] = [];
  for (const raw of rawLines) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const line = raw as Record<string, unknown>;
    const lineId = String(line.reservationLineId ?? line.lineId ?? '');
    if (!lineId) continue;
    const parentLineId = line.parentLineId ?? line.parentReservationLineId ?? null;
    const normalized = {
      ...line,
      line_id: lineId,
      name: String(line.sourceDisplayName ?? line.label ?? line.name ?? 'Okänd artikel'),
      source_display_name: line.sourceDisplayName ?? line.source_display_name ?? null,
      source_sort_index: Number.isFinite(Number(line.sourceSortIndex ?? line.source_sort_index))
        ? Number(line.sourceSortIndex ?? line.source_sort_index)
        : null,
      required_qty: Number(line.requiredQuantity ?? line.quantity ?? 0) || 0,
      packed_count: Number(line.packedQuantity ?? line.packed ?? 0) || 0,
      sku: line.sku ?? line.articleNumber ?? null,
      item_type_id: line.itemTypeId ?? line.inventoryTypeId ?? line.inventory_type_id ?? null,
      package_id: line.packageId ?? line.package_id ?? null,
      parent_line_id: parentLineId,
      line_type: line.lineType ?? line.line_type ?? 'catalog',
      product_packable_default: line.productPackableDefault ?? line.product_packable_default ?? true,
      booking_packability_override: line.bookingPackabilityOverride ?? line.booking_packability_override ?? null,
      warehouse_packability_override: line.warehousePackabilityOverride ?? line.warehouse_packability_override ?? null,
      packability_source: line.packabilitySource ?? line.packability_source ?? undefined,
      packability_revision: line.packabilityRevision ?? line.packability_revision ?? 1,
      is_packable: line.isPackable ?? line.is_packable ?? line.actionable ?? true,
    };
    if ((line.kind ?? '') === 'group') {
      groups.set(lineId, {
        ...normalized,
        type: 'package',
        package_id: normalized.package_id ?? lineId,
        components: [],
      });
    } else if (parentLineId) {
      const relationshipKind = String(
        line.relationshipKind ?? line.relationship_kind ?? '',
      );
      const isAccessory = relationshipKind === 'accessory' || line.isAccessory === true || line.is_accessory === true;
      const target = isAccessory ? accessories : packageMembers;
      const values = target.get(String(parentLineId)) ?? [];
      values.push(normalized);
      target.set(String(parentLineId), values);
    } else {
      topLevel.push({
        ...normalized,
        type: normalized.line_type === 'manual' ? 'manual' : 'item_type',
      });
    }
  }
  for (const [groupId, group] of groups) {
    group.components = packageMembers.get(groupId) ?? [];
    topLevel.push(group);
    for (const accessory of accessories.get(groupId) ?? []) {
      topLevel.push({ ...accessory, type: accessory.line_type === 'manual' ? 'manual' : 'item_type', is_accessory: true });
    }
    packageMembers.delete(groupId);
    accessories.delete(groupId);
  }
  for (const orphaned of [...packageMembers.values(), ...accessories.values()]) {
    topLevel.push(...orphaned.map((line) => ({
      ...line,
      type: line.line_type === 'manual' ? 'manual' : 'item_type',
    })));
  }
  return {
    ...source,
    reservation: { id: source.reservationId ?? source.reservation_id ?? null },
    lines: topLevel,
    raw_projection_lines: rawLines,
  };
}