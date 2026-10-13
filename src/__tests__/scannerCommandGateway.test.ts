import { describe, expect, it } from "vitest";

import {
  buildBundleScannerCommand,
  parseScannerMvpCommand,
} from "../../supabase/functions/_shared/scannerCommandGateway";

const ID = {
  booking: "11111111-1111-4111-8111-111111111111",
  reservation: "22222222-2222-4222-8222-222222222222",
  line: "33333333-3333-4333-8333-333333333333",
  type: "44444444-4444-4444-8444-444444444444",
  staff: "55555555-5555-4555-8555-555555555555",
  org: "66666666-6666-4666-8666-666666666666",
};

const command = {
  schema: "eventflow-scanner-command-gateway.v1",
  scanner_contract_version: "scanner_contract_v1",
  operationId: "op-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  command: "PACK_INSTANCE",
  bookingId: ID.booking,
  reservationId: ID.reservation,
  reservationLineId: ID.line,
  itemTypeId: ID.type,
  deviceId: "tc22-01",
  scanValue: "SERIAL-001",
  occurredAt: "2026-09-11T08:00:00.000Z",
};

describe("Scanner MVP command gateway", () => {
  it("builds the exact server-owned Bundle command", () => {
    const parsed = parseScannerMvpCommand(command);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(
      buildBundleScannerCommand({
        command: parsed.value,
        organizationId: ID.org,
        staffId: ID.staff,
        staffName: "Lager Ett",
        bookingNumber: "B-1001",
      }),
    ).toEqual({
      schema: "eventflow-scanner-bundle-command.v1",
      operationId: command.operationId,
      command: "PACK_INSTANCE",
      organizationId: ID.org,
      reservationId: ID.reservation,
      bookingNumber: "B-1001",
      reservationLineId: ID.line,
      itemTypeId: ID.type,
      itemInstanceId: null,
      quantity: 1,
      packingSessionId: null,
      performedBy: ID.staff,
      performedByLabel: "Lager Ett",
      deviceId: "tc22-01",
      scanSource: "eventflow_scanner",
      scanValue: "SERIAL-001",
      occurredAt: command.occurredAt,
    });
  });

  it.each([
    [{ ...command, bookingId: "planning-local" }, "invalid_canonical_id"],
    [{ ...command, reservationId: "packing-local" }, "invalid_canonical_id"],
    [{ ...command, reservationLineId: "line-name" }, "invalid_canonical_id"],
    [{ ...command, itemTypeId: "product-name" }, "invalid_canonical_id"],
    [{ ...command, command: "PACK_QUANTITY" }, "invalid_quantity"],
    [{ ...command, organizationId: ID.org }, "unexpected_field"],
  ])("rejects non-canonical or client-owned input %#", (input, error) => {
    expect(parseScannerMvpCommand(input)).toEqual({ ok: false, error });
  });

  it("preserves exact row identity and amount without a fabricated scan code", () => {
    const { scanValue: _scanValue, ...base } = command;
    const parsed = parseScannerMvpCommand({ ...base, command: "PACK_QUANTITY", quantity: 12 });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const owner = buildBundleScannerCommand({ command: parsed.value, organizationId: ID.org,
      staffId: ID.staff, staffName: "Lager Ett", bookingNumber: "B-1001" });
    expect(owner).toMatchObject({ command: "PACK_QUANTITY", quantity: 12,
      reservationLineId: ID.line, itemTypeId: ID.type, itemInstanceId: null, scanValue: null });
  });

  it.each([0, -1, 1.5, 1001, "2", null, undefined, Infinity])("rejects invalid manual quantity %s", (quantity) => {
    expect(parseScannerMvpCommand({ ...command, command: "PACK_QUANTITY", scanValue: null,
      quantity })).toEqual({ ok: false, error: "invalid_quantity" });
  });

  it("accepts the current app's instance undo reason and retains it for owner audit", () => {
    const parsed = parseScannerMvpCommand({ ...command, command: "UNPACK_INSTANCE", reason: "Fel artikel" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(buildBundleScannerCommand({ command: parsed.value, organizationId: ID.org,
      staffId: ID.staff, staffName: "Lager Ett", bookingNumber: "B-1001" })).toMatchObject({
      command: "UNPACK_INSTANCE", reason: "Fel artikel", scanValue: command.scanValue, quantity: 1 });
  });

  it("accepts legacy instance undo without a reason", () => {
    expect(parseScannerMvpCommand({ ...command, command: "UNPACK_INSTANCE" }).ok).toBe(true);
  });

  it.each([
    [{ command: "UNPACK_QUANTITY", scanValue: null, quantity: 2 }, "unpack_reason_required"],
    [{ command: "UNPACK_QUANTITY", scanValue: null, quantity: 2, reason: "ok" }, "invalid_reason"],
    [{ command: "UNPACK_INSTANCE", reason: "  Fel artikel " }, "invalid_reason"],
    [{ command: "PACK_QUANTITY", scanValue: null, quantity: 2, reason: "Orsak" }, "invalid_reason"],
    [{ command: "PACK_QUANTITY", quantity: 2 }, "quantity_scan_value_forbidden"],
    [{ quantity: 2 }, "invalid_quantity"],
  ])("rejects mixed scan/manual or malformed audit input %#", (changes, error) => {
    expect(parseScannerMvpCommand({ ...command, ...changes })).toEqual({ ok: false, error });
  });

  it("accepts explicit manual undo amount and reason", () => {
    const parsed = parseScannerMvpCommand({ ...command, command: "UNPACK_QUANTITY",
      scanValue: null, quantity: 4, reason: "Fyra togs bort" });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toMatchObject({ quantity: 4, reason: "Fyra togs bort", scanValue: null });
  });
});


describe("manual order row identity", () => {
  it.each(["PACK_QUANTITY", "UNPACK_QUANTITY"])("forwards explicit null unchanged for %s", (name) => {
    const parsed = parseScannerMvpCommand({ ...command, command: name, itemTypeId: null,
      scanValue: null, quantity: 2, ...(name === "UNPACK_QUANTITY" ? { reason: "Fel antal" } : {}) });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(buildBundleScannerCommand({ command: parsed.value, organizationId: ID.org,
      staffId: ID.staff, staffName: "Lager Ett", bookingNumber: "B-1001" })).toMatchObject({
      itemTypeId: null, itemInstanceId: null, reservationLineId: ID.line,
      quantity: 2, performedBy: ID.staff, organizationId: ID.org,
    });
  });
  it.each([undefined, "", "manual", "not-a-uuid"])("rejects missing or malformed type %s", (itemTypeId) => {
    expect(parseScannerMvpCommand({ ...command, command: "PACK_QUANTITY", itemTypeId,
      scanValue: null, quantity: 2 })).toEqual({ ok: false, error: "invalid_canonical_id" });
  });
  it.each(["PACK_INSTANCE", "UNPACK_INSTANCE"])("requires type identity for %s", (name) => {
    expect(parseScannerMvpCommand({ ...command, command: name, itemTypeId: null }))
      .toEqual({ ok: false, error: "invalid_canonical_id" });
  });
});
