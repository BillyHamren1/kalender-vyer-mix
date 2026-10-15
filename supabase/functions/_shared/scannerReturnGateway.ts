import { buildBundleScannerCommand, parseScannerMvpCommand, type ScannerMvpCommand } from './scannerCommandGateway.ts'

export type ScannerReturnCommand = Omit<ScannerMvpCommand, 'schema' | 'command' | 'reason'> & {
  schema: 'eventflow-scanner-return-gateway.v1'
  command: 'RETURN_INSTANCE' | 'RETURN_QUANTITY'
  condition: 'ok' | 'damaged'
  damageNote: string | null
}

export function parseScannerReturnCommand(input: unknown):
  { ok: true; value: ScannerReturnCommand } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'invalid_body' }
  const body = input as Record<string, unknown>
  if (body.schema !== 'eventflow-scanner-return-gateway.v1') return { ok: false, error: 'unsupported_schema' }
  if (body.command !== 'RETURN_INSTANCE' && body.command !== 'RETURN_QUANTITY') return { ok: false, error: 'invalid_command' }
  if ('reason' in body) return { ok: false, error: 'unexpected_field' }
  if (body.condition !== 'ok' && body.condition !== 'damaged') return { ok: false, error: 'invalid_condition' }
  if (body.damageNote !== null && (typeof body.damageNote !== 'string' || body.damageNote !== body.damageNote.trim() || body.damageNote.length < 3 || body.damageNote.length > 500)) {
    return { ok: false, error: 'invalid_damage_note' }
  }
  if (body.condition === 'damaged' && body.damageNote === null) return { ok: false, error: 'damage_note_required' }
  const { condition, damageNote, ...identity } = body
  // Reuse canonical UUID, strict extra-field, exact scan and bounded quantity checks.
  const parsed = parseScannerMvpCommand({ ...identity, schema: 'eventflow-scanner-command-gateway.v1',
    command: body.command === 'RETURN_INSTANCE' ? 'PACK_INSTANCE' : 'PACK_QUANTITY' })
  if (parsed.ok === false) return parsed
  return { ok: true, value: { ...parsed.value, schema: 'eventflow-scanner-return-gateway.v1',
    command: body.command, condition, damageNote: damageNote as string | null } }
}

export function buildBundleScannerReturn(input: {
  command: ScannerReturnCommand; organizationId: string; staffId: string; staffName: string; bookingNumber: string
}) {
  const { condition, damageNote, ...command } = input.command
  const owner = buildBundleScannerCommand({ ...input, command: { ...command,
    schema: 'eventflow-scanner-command-gateway.v1', command: command.command === 'RETURN_INSTANCE' ? 'PACK_INSTANCE' : 'PACK_QUANTITY' } })
  return { ...owner, schema: 'eventflow-scanner-bundle-return.v1' as const,
    command: input.command.command, condition, damageNote }
}

const record = (v: unknown): Record<string, unknown> | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0

/** Require exact operation and owner identity before forwarding a successful receipt. */
export function validBundleReturnReceipt(value: unknown, expected: ReturnType<typeof buildBundleScannerReturn>): boolean {
  const r = record(value), id = record(r?.canonicalIdentity), state = record(r?.authoritativeReturnState)
  if (!r || !id || !state || r.schema !== 'bundle-scanner-return-receipt.v1' ||
      r.operationId !== expected.operationId || r.command !== expected.command || !uuid(r.bundleOperationId) ||
      !['COMMITTED', 'ALREADY_COMMITTED', 'REJECTED'].includes(String(r.status)) ||
      typeof r.serverTimestamp !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(r.serverTimestamp) || Number.isNaN(Date.parse(r.serverTimestamp))) return false
  for (const key of ['organizationId', 'reservationId', 'bookingNumber', 'reservationLineId', 'itemTypeId'] as const) {
    if (id[key] !== expected[key]) return false
  }
  if (r.reason !== null && typeof r.reason !== 'string' || r.reasonDetail !== null && typeof r.reasonDetail !== 'string') return false
  if (r.status === 'REJECTED') return typeof r.reason === 'string' && r.reason.length > 0 &&
    state.returnedQuantity === null && state.outstandingQuantity === null && state.manualOutstandingQuantity === null && r.itemInstance === null
  if (r.reason !== null || !count(state.returnedQuantity) || !count(state.outstandingQuantity) || !count(state.manualOutstandingQuantity) ||
      Number(state.manualOutstandingQuantity) > Number(state.outstandingQuantity)) return false
  if (expected.command === 'RETURN_QUANTITY') return r.itemInstance === null
  const instance = record(r.itemInstance)
  return !!instance && uuid(instance.itemInstanceId) && instance.status === (expected.condition === 'damaged' ? 'in_repair' : 'available')
}

export function parseScannerReturnProjection(input: unknown):
  { ok: true; value: { bookingId: string; reservationId: string } } | { ok: false; error: string } {
  const body = record(input)
  if (!body) return { ok: false, error: 'invalid_body' }
  if (Object.keys(body).some(k => !['schema', 'scanner_contract_version', 'bookingId', 'reservationId'].includes(k))) return { ok: false, error: 'unexpected_field' }
  if (body.schema !== 'eventflow-scanner-return-read-gateway.v1' || body.scanner_contract_version !== 'scanner_contract_v1') return { ok: false, error: 'unsupported_schema' }
  if (!uuid(body.bookingId) || !uuid(body.reservationId)) return { ok: false, error: 'invalid_canonical_id' }
  return { ok: true, value: { bookingId: String(body.bookingId).toLowerCase(), reservationId: String(body.reservationId).toLowerCase() } }
}

export function buildBundleReturnProjection(input: { organizationId: string; reservationId: string; bookingNumber: string }) {
  if (!uuid(input.organizationId) || !uuid(input.reservationId) || !input.bookingNumber || input.bookingNumber.length > 128 || input.bookingNumber.trim() !== input.bookingNumber) throw new Error('owner_identity_unavailable')
  return { schema: 'eventflow-scanner-bundle-return-projection-request.v1' as const, ...input }
}

export function validBundleReturnProjection(value: unknown, expected: ReturnType<typeof buildBundleReturnProjection>): boolean {
  const r = record(value)
  if (!r || r.schema !== 'eventflow-scanner-bundle-return-projection.v1' ||
      r.organizationId !== expected.organizationId || r.reservationId !== expected.reservationId || r.bookingNumber !== expected.bookingNumber ||
      typeof r.returnCommandsEnabled !== 'boolean' ||
      typeof r.generatedAt !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(r.generatedAt) || Number.isNaN(Date.parse(r.generatedAt)) ||
      !Array.isArray(r.lines) || r.lines.length > 10000) return false
  const ids = new Set<string>(), instances = new Set<string>()
  for (const value of r.lines) {
    const line = record(value)
    if (!line || !uuid(line.reservationLineId) || ids.has(`${line.reservationLineId}:${line.itemTypeId ?? 'manual'}`) ||
        line.itemTypeId !== null && !uuid(line.itemTypeId) ||
        !count(line.returnedQuantity) || !count(line.outstandingQuantity) || !count(line.manualOutstandingQuantity) ||
        Number(line.manualOutstandingQuantity) > Number(line.outstandingQuantity) ||
        !Array.isArray(line.instances) || line.instances.length > 10000) return false
    ids.add(`${line.reservationLineId}:${line.itemTypeId ?? 'manual'}`)
    for (const value of line.instances) {
      const instance = record(value)
      if (!instance || !uuid(instance.itemInstanceId) || instances.has(String(instance.itemInstanceId)) ||
          typeof instance.scanValue !== 'string' || !instance.scanValue || instance.scanValue.length > 512 ||
          typeof instance.status !== 'string' || !instance.status || instance.status.length > 100) return false
      instances.add(String(instance.itemInstanceId))
    }
    if (Number(line.outstandingQuantity) !== Number(line.manualOutstandingQuantity) + line.instances.length ||
        line.itemTypeId === null && line.instances.length > 0) return false
  }
  return true
}
