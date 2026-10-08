import { describe, expect, it } from "vitest";
import {
  validateFinanceProjectInvoice as validate,
  acceptFinanceProjectInvoice as accept,
  type ProjectInvoiceEvidence,
} from "./finance-project-invoice";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fixture = (): ProjectInvoiceEvidence => ({
  schema_version: "finance-project-invoice-v1",
  organization_id: id(1),
  invoice_id: id(2),
  source_revision: 1,
  source_observation_id: id(3),
  provider_document_number: "4711",
  document_fingerprint: "a".repeat(64),
  invoice_kind: "invoice",
  currency: "SEK",
  signed_net_minor: 10000,
  unallocated_minor: 0,
  invoice_status: "received",
  provider_source_changed: false,
  accounting_state: "draft",
  settlement_state: "unpaid",
  provider_approval_state: "pending",
  credit_relation_coverage: "not_applicable",
  allocations: [
    {
      allocation_id: id(4),
      project_id: id(5),
      cost_line_id: id(6),
      destination_organization_id: id(7),
      destination_project_id: id(8),
      amount_minor: 10000,
      consumes_commitment: true,
      status: "preliminary",
    },
  ],
});
describe("Fortnox-backed full invoice evidence", () => {
  it("shows allocations before approval and retains same cost identity after approval", () => {
    const x = fixture(),
      next = fixture();
    next.source_revision = 2;
    next.invoice_status = "approved";
    next.allocations[0]!.status = "confirmed";
    const result = accept(x, next);
    expect(result.snapshot.allocations[0]!.allocation_id).toBe(
      x.allocations[0]!.allocation_id,
    );
    expect(result.snapshot.signed_net_minor).toBe(10000);
  });
  it("replaces removed allocations rather than adding costs", () => {
    const x = fixture(),
      next = fixture();
    next.source_revision = 2;
    next.allocations = [];
    next.unallocated_minor = 10000;
    expect(accept(x, next).snapshot.allocations).toEqual([]);
  });
  it("replays exact status-independent object key order", () => {
    const x = fixture();
    expect(
      accept(x, Object.fromEntries(Object.entries(x).reverse())).outcome,
    ).toBe("replayed");
  });
  it("ignores valid stale deliveries", () => {
    const x = fixture();
    x.source_revision = 3;
    expect(accept(x, fixture()).outcome).toBe("stale");
  });
  it("rejects changed same-revision replay", () => {
    const next = fixture();
    next.accounting_state = "booked";
    expect(() => accept(fixture(), next)).toThrow("replay");
  });
  it("reconciles split invoice and unallocated amount exactly", () => {
    const x = fixture();
    x.allocations[0]!.amount_minor = 6000;
    x.allocations.push({
      ...x.allocations[0]!,
      allocation_id: id(9),
      project_id: id(10),
      destination_project_id: id(11),
      amount_minor: 3000,
    });
    x.unallocated_minor = 1000;
    expect(validate(x).unallocated_minor).toBe(1000);
    x.unallocated_minor = 999;
    expect(() => validate(x)).toThrow("reconciliation");
  });
  it("preserves signed credits without inventing an original relationship", () => {
    const x = fixture();
    x.invoice_kind = "credit";
    x.credit_relation_coverage = "unresolved";
    x.signed_net_minor = -10000;
    x.allocations[0]!.amount_minor = -10000;
    expect(validate(x).signed_net_minor).toBe(-10000);
  });
  it("keeps external booked/paid separate from internal preliminary", () => {
    const x = fixture();
    x.accounting_state = "booked";
    x.settlement_state = "paid";
    x.provider_approval_state = "not_pending";
    expect(validate(x).allocations[0]!.status).toBe("preliminary");
  });
  it("retains investigated source evidence without claiming confirmation", () => {
    const x = fixture();
    x.invoice_status = "investigation";
    x.provider_source_changed = true;
    expect(validate(x).allocations[0]!.status).toBe("preliminary");
  });
  it.each(["signed_net_minor", "unallocated_minor"])(
    "rejects missing %s instead of defaulting to zero",
    (key) => {
      const x = fixture() as unknown as Record<string, unknown>;
      delete x[key];
      expect(() => validate(x)).toThrow();
    },
  );
  it("rejects mixed tenant destinations and duplicates", () => {
    const x = fixture();
    x.allocations.push({
      ...x.allocations[0]!,
      destination_organization_id: id(90),
    });
    expect(() => validate(x)).toThrow();
  });
  it("rejects fractional and unsafe money", () => {
    for (const value of [1.1, Number.MAX_SAFE_INTEGER + 1, NaN]) {
      const x = fixture();
      x.signed_net_minor = value;
      expect(() => validate(x)).toThrow();
    }
  });
  it("rejects confirmation with unresolved allocation or changed source", () => {
    const x = fixture();
    x.invoice_status = "approved";
    x.allocations[0]!.status = "confirmed";
    x.provider_source_changed = true;
    expect(() => validate(x)).toThrow();
  });
  it("returns detached evidence", () => {
    const x = fixture(),
      saved = validate(x);
    x.allocations[0]!.amount_minor = 1;
    expect(saved.allocations[0]!.amount_minor).toBe(10000);
  });
  it("rejects different stream identity", () => {
    const x = fixture();
    x.organization_id = id(90);
    expect(() => accept(fixture(), x)).toThrow("identity");
  });
});
