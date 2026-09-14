export const SCANNER_INVENTORY_GATEWAY_SCHEMA = 'eventflow-scanner-inventory-gateway.v1' as const
export const SCANNER_INVENTORY_COMMANDS = ['RETURN_FROM_SERVICE'] as const

const OPERATION_RE = /^op-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.length > 0 && value.length <= max && value === value.trim()
    ? value
    : null

export type ScannerInventoryGatewayCommand = {
  schema: typeof SCANNER_INVENTORY_GATEWAY_SCHEMA
  operationId: string
  command: (typeof SCANNER_INVENTORY_COMMANDS)[number]
  deviceId: string
  scanValue: string
  occurredAt: string
}

export function parseScannerInventoryGatewayCommand(input: unknown):
  | { ok: true; value: ScannerInventoryGatewayCommand }
  | { ok: false; error: string } {
  const body = record(input)
  if (!body) return { ok: false, error: 'invalid_body' }
  const allowed = new Set([
    'schema', 'operationId', 'command', 'deviceId', 'scanValue', 'occurredAt',
    'scanner_contract_version',
  ])
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return { ok: false, error: 'unexpected_field' }
  }
  if (
    body.schema !== SCANNER_INVENTORY_GATEWAY_SCHEMA ||
    body.scanner_contract_version !== 'scanner_contract_v1'
  ) {
    return { ok: false, error: 'unsupported_schema' }
  }
  if (typeof body.operationId !== 'string' || !OPERATION_RE.test(body.operationId)) {
    return { ok: false, error: 'invalid_operation_id' }
  }
  if (!SCANNER_INVENTORY_COMMANDS.includes(body.command as ScannerInventoryGatewayCommand['command'])) {
    return { ok: false, error: 'invalid_command' }
  }
  const deviceId = text(body.deviceId, 160)
  const scanValue = text(body.scanValue, 512)
  const occurredAt = text(body.occurredAt, 40)
  if (!deviceId || !scanValue) return { ok: false, error: 'missing_required_value' }
  if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) {
    return { ok: false, error: 'invalid_occurred_at' }
  }
  return {
    ok: true,
    value: {
      schema: SCANNER_INVENTORY_GATEWAY_SCHEMA,
      operationId: body.operationId.toLowerCase(),
      command: body.command as ScannerInventoryGatewayCommand['command'],
      deviceId,
      scanValue,
      occurredAt: new Date(occurredAt).toISOString(),
    },
  }
}

export function buildBundleScannerInventoryCommand(input: {
  command: ScannerInventoryGatewayCommand
  organizationId: string
  staffId: string
  staffName: string
}) {
  return {
    schema: 'eventflow-scanner-inventory-command.v1',
    operationId: input.command.operationId,
    command: input.command.command,
    organizationId: input.organizationId,
    performedBy: input.staffId,
    performedByLabel: input.staffName.slice(0, 160),
    deviceId: input.command.deviceId,
    scanValue: input.command.scanValue,
    occurredAt: input.command.occurredAt,
  } as const
}
