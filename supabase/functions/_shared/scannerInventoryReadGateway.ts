export const SCANNER_INVENTORY_READ_GATEWAY_SCHEMA = 'eventflow-scanner-inventory-read-gateway.v1' as const

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null

export type ScannerInventoryReadGatewayRequest = {
  schema: typeof SCANNER_INVENTORY_READ_GATEWAY_SCHEMA
  scanValue: string
}

export function parseScannerInventoryReadGatewayRequest(input: unknown):
  | { ok: true; value: ScannerInventoryReadGatewayRequest }
  | { ok: false; error: string } {
  const body = record(input)
  if (!body) return { ok: false, error: 'invalid_body' }
  const allowed = new Set(['schema', 'scanValue', 'scanner_contract_version'])
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return { ok: false, error: 'unexpected_field' }
  }
  if (
    body.schema !== SCANNER_INVENTORY_READ_GATEWAY_SCHEMA ||
    body.scanner_contract_version !== 'scanner_contract_v1'
  ) {
    return { ok: false, error: 'unsupported_schema' }
  }
  const scanValue = typeof body.scanValue === 'string' ? body.scanValue.trim() : ''
  if (!scanValue || scanValue.length > 512) return { ok: false, error: 'invalid_scan_value' }
  return {
    ok: true,
    value: { schema: SCANNER_INVENTORY_READ_GATEWAY_SCHEMA, scanValue },
  }
}

export function buildBundleScannerInventoryRead(input: {
  request: ScannerInventoryReadGatewayRequest
  organizationId: string
}) {
  return {
    schema: 'eventflow-scanner-inventory-read.v1',
    organizationId: input.organizationId,
    scanValue: input.request.scanValue,
  } as const
}
