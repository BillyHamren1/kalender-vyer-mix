export const SCANNER_COMMAND_GATEWAY_SCHEMA =
  "eventflow-scanner-command-gateway.v1" as const;

export const SCANNER_COMMANDS = [
  "PACK_INSTANCE", "UNPACK_INSTANCE", "PACK_QUANTITY", "UNPACK_QUANTITY",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPERATION_RE =
  /^op-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const uuid = (value: unknown): string | null =>
  typeof value === "string" && UUID_RE.test(value)
    ? value.toLowerCase()
    : null;

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= max &&
  value === value.trim()
    ? value
    : null;

export type ScannerMvpCommand = {
  schema: typeof SCANNER_COMMAND_GATEWAY_SCHEMA;
  operationId: string;
  command: (typeof SCANNER_COMMANDS)[number];
  bookingId: string;
  reservationId: string;
  reservationLineId: string;
  itemTypeId: string | null;
  deviceId: string;
  scanValue: string | null;
  quantity: number;
  reason?: string;
  occurredAt: string;
};

export function parseScannerMvpCommand(input: unknown):
  | { ok: true; value: ScannerMvpCommand }
  | { ok: false; error: string } {
  const body = record(input);
  if (!body) return { ok: false, error: "invalid_body" };
  const allowed = new Set([
    "schema",
    "operationId",
    "command",
    "bookingId",
    "reservationId",
    "reservationLineId",
    "itemTypeId",
    "deviceId",
    "scanValue",
    "occurredAt",
    "quantity",
    "reason",
    "scanner_contract_version",
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return { ok: false, error: "unexpected_field" };
  }
  if (
    body.schema !== SCANNER_COMMAND_GATEWAY_SCHEMA ||
    body.scanner_contract_version !== "scanner_contract_v1"
  ) {
    return { ok: false, error: "unsupported_schema" };
  }
  if (
    typeof body.operationId !== "string" ||
    !OPERATION_RE.test(body.operationId)
  ) {
    return { ok: false, error: "invalid_operation_id" };
  }
  if (
    !SCANNER_COMMANDS.includes(
      body.command as (typeof SCANNER_COMMANDS)[number],
    )
  ) {
    return { ok: false, error: "invalid_command" };
  }
  const bookingId = uuid(body.bookingId);
  const reservationId = uuid(body.reservationId);
  const reservationLineId = uuid(body.reservationLineId);
  const itemTypeId = uuid(body.itemTypeId);
  const deviceId = text(body.deviceId, 160);
  const scanValue = text(body.scanValue, 512);
  const occurredAt = text(body.occurredAt, 40);
  const isQuantity = body.command === "PACK_QUANTITY" || body.command === "UNPACK_QUANTITY";
  const isUnpack = body.command === "UNPACK_INSTANCE" || body.command === "UNPACK_QUANTITY";
  const quantity = body.quantity ?? (isQuantity ? null : 1);
  const reason = body.reason === undefined ? undefined : text(body.reason, 500);
  // Null is an explicit manual-row identity, never an omitted or malformed UUID.
  // Bundle verifies that this exact reservation row really is manual.
  if (!bookingId || !reservationId || !reservationLineId ||
      (!itemTypeId && !(isQuantity && body.itemTypeId === null))) {
    return { ok: false, error: "invalid_canonical_id" };
  }
  if (!deviceId || (!isQuantity && !scanValue)) {
    return { ok: false, error: "missing_required_value" };
  }
  if (!Number.isSafeInteger(quantity) || (quantity as number) < 1 ||
      (quantity as number) > 1000 || (!isQuantity && quantity !== 1)) {
    return { ok: false, error: "invalid_quantity" };
  }
  if (isQuantity && body.scanValue != null) {
    return { ok: false, error: "quantity_scan_value_forbidden" };
  }
  if (body.reason !== undefined && (!isUnpack || !reason || reason.length < 3)) {
    return { ok: false, error: "invalid_reason" };
  }
  // Existing instance clients may omit the reason. New manual undo requires it.
  if (body.command === "UNPACK_QUANTITY" && !reason) {
    return { ok: false, error: "unpack_reason_required" };
  }
  if (
    !occurredAt ||
    Number.isNaN(Date.parse(occurredAt)) ||
    new Date(occurredAt).toISOString() !== occurredAt
  ) {
    return { ok: false, error: "invalid_occurred_at" };
  }
  return {
    ok: true,
    value: {
      schema: SCANNER_COMMAND_GATEWAY_SCHEMA,
      operationId: body.operationId.toLowerCase(),
      command: body.command as ScannerMvpCommand["command"],
      bookingId,
      reservationId,
      reservationLineId,
      itemTypeId,
      deviceId,
      scanValue: isQuantity ? null : scanValue,
      quantity: quantity as number,
      ...(reason ? { reason } : {}),
      occurredAt,
    },
  };
}

export function buildBundleScannerCommand(input: {
  command: ScannerMvpCommand;
  organizationId: string;
  staffId: string;
  staffName: string;
  bookingNumber: string;
}) {
  const organizationId = uuid(input.organizationId);
  const staffId = uuid(input.staffId);
  const bookingNumber = text(input.bookingNumber, 128);
  if (!organizationId || !staffId || !bookingNumber) {
    throw new Error("owner_identity_unavailable");
  }
  return {
    schema: "eventflow-scanner-bundle-command.v1",
    operationId: input.command.operationId,
    command: input.command.command,
    organizationId,
    reservationId: input.command.reservationId,
    bookingNumber,
    reservationLineId: input.command.reservationLineId,
    itemTypeId: input.command.itemTypeId,
    itemInstanceId: null,
    quantity: input.command.quantity,
    packingSessionId: null,
    performedBy: staffId,
    performedByLabel: input.staffName.slice(0, 160),
    deviceId: input.command.deviceId,
    scanSource: "eventflow_scanner",
    scanValue: input.command.scanValue,
    occurredAt: input.command.occurredAt,
    ...(input.command.reason ? { reason: input.command.reason } : {}),
  } as const;
}
