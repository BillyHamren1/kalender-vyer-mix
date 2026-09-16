export const WMS_PACKABILITY_BASE_URL = 'https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1';

export type WarehousePackabilityOverride = boolean | null;

export interface WarehousePackabilityReceipt {
  operation_id: string;
  line_id: string;
  product_packable_default: boolean;
  booking_packability_override: boolean | null;
  warehouse_packability_override: boolean | null;
  is_packable: boolean;
  packability_source: 'warehouse_override' | 'booking_override' | 'product_default';
  packability_revision: number;
  updated_at: string;
  idempotent: boolean;
}

export interface WarehousePackabilityRequest {
  url: string;
  init: RequestInit;
}

const isNullableBoolean = (value: unknown): value is boolean | null =>
  value === null || typeof value === 'boolean';

export function buildWarehousePackabilityRequest(args: {
  baseUrl: string;
  apiKey: string;
  organizationId: string;
  operationId: string;
  lineId: string;
  override: WarehousePackabilityOverride;
  expectedRevision: number;
}): WarehousePackabilityRequest {
  if (!args.apiKey) throw new Error('wms_secret_missing');
  if (!args.baseUrl) throw new Error('wms_base_url_missing');
  if (!args.lineId) throw new Error('wms_line_id_missing');
  if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 1) {
    throw new Error('invalid_expected_revision');
  }

  return {
    url: `${args.baseUrl.replace(/\/$/, '')}/reservation-lines/${encodeURIComponent(args.lineId)}/packability`,
    init: {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.apiKey}`,
        'x-organization-id': args.organizationId,
        'Idempotency-Key': args.operationId,
      },
      body: JSON.stringify({
        source: 'warehouse',
        override: args.override,
        expected_revision: args.expectedRevision,
      }),
    },
  };
}

export function parseWarehousePackabilityReceipt(
  value: unknown,
  expected: {
    operationId: string;
    lineId: string;
    override: WarehousePackabilityOverride;
  },
): WarehousePackabilityReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('wms_bad_receipt');
  }
  const receipt = value as Record<string, unknown>;
  const validSource = receipt.packability_source === 'warehouse_override'
    || receipt.packability_source === 'booking_override'
    || receipt.packability_source === 'product_default';

  if (
    receipt.operation_id !== expected.operationId
    || receipt.line_id !== expected.lineId
    || receipt.warehouse_packability_override !== expected.override
    || typeof receipt.product_packable_default !== 'boolean'
    || !isNullableBoolean(receipt.booking_packability_override)
    || !isNullableBoolean(receipt.warehouse_packability_override)
    || typeof receipt.is_packable !== 'boolean'
    || !validSource
    || !Number.isSafeInteger(receipt.packability_revision)
    || Number(receipt.packability_revision) < 1
    || typeof receipt.updated_at !== 'string'
    || !Number.isFinite(Date.parse(receipt.updated_at))
    || typeof receipt.idempotent !== 'boolean'
  ) {
    throw new Error('wms_bad_receipt');
  }

  if (expected.override !== null && receipt.is_packable !== expected.override) {
    throw new Error('wms_bad_receipt');
  }
  if (expected.override !== null && receipt.packability_source !== 'warehouse_override') {
    throw new Error('wms_bad_receipt');
  }

  return receipt as unknown as WarehousePackabilityReceipt;
}
