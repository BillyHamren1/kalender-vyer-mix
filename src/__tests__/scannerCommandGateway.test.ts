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
    [{ ...command, command: "PACK_QUANTITY" }, "invalid_command"],
    [{ ...command, organizationId: ID.org }, "unexpected_field"],
  ])("rejects non-canonical or client-owned input %#", (input, error) => {
    expect(parseScannerMvpCommand(input)).toEqual({ ok: false, error });
  });
});
