import { describe, expect, it } from "vitest";
import {
  calculateProjectCostObligation as calculate,
  type CostObligationInput,
  type ObligationSource,
} from "./project-cost-obligations";
const scope = {
  organization_id: "00000000-0000-4000-8000-000000000001",
  project_id: "00000000-0000-4000-8000-000000000002",
  obligation_id: "00000000-0000-4000-8000-000000000003",
  currency: "SEK",
};
const source = (changes: Partial<ObligationSource> = {}): ObligationSource => ({
  ...scope,
  source_id: "invoice-allocation-1",
  kind: "invoice",
  status: "preliminary",
  amount_minor: 5400,
  replaces_estimate_minor: 5000,
  consumes_commitment_minor: 5000,
  credited_source_id: null,
  relation_coverage: "complete",
  ...changes,
});
const fixture = (): CostObligationInput => ({
  ...scope,
  cost_basis: "invoice",
  estimate_minor: 5000,
  committed_minor: 5000,
  relation_coverage: "complete",
  sources: [source()],
});
describe("Operations owns obligation replacement calculation", () => {
  it("replaces estimate5000 by preliminary invoice5400 exactly once", () => {
    const x = calculate(fixture());
    expect(x.eac_minor).toBe(5400);
    expect(x.remaining_minor).toBe(0);
    expect(x.preliminary_minor).toBe(5400);
  });
  it("confirms same invoice without growing EAC", () => {
    const x = fixture();
    x.sources[0]!.status = "confirmed";
    const result = calculate(x);
    expect(result.eac_minor).toBe(5400);
    expect(result.confirmed_minor).toBe(5400);
    expect(result.preliminary_minor).toBe(0);
  });
  it("supports invoice partial with explicit remaining estimate", () => {
    const x = fixture();
    x.estimate_minor = 10000;
    x.committed_minor = 10000;
    const result = calculate(x);
    expect(result.remaining_minor).toBe(5000);
    expect(result.eac_minor).toBe(10400);
  });
  it("does not add forecast and commitment for same remaining obligation", () => {
    const x = fixture();
    x.estimate_minor = 12000;
    x.committed_minor = 10000;
    expect(calculate(x).remaining_minor).toBe(7000);
  });
  it("credit reduces actual without resurrecting estimate", () => {
    const x = fixture();
    x.sources[0]!.status = "confirmed";
    x.sources.push(
      source({
        source_id: "credit-1",
        kind: "credit",
        status: "confirmed",
        amount_minor: -1400,
        replaces_estimate_minor: 0,
        consumes_commitment_minor: 0,
        credited_source_id: "invoice-allocation-1",
      }),
    );
    const result = calculate(x);
    expect(result.confirmed_minor).toBe(4000);
    expect(result.remaining_minor).toBe(0);
    expect(result.eac_minor).toBe(4000);
  });
  it("rejects aggregate overcredit", () => {
    const x = fixture();
    x.sources.push(
      source({
        source_id: "credit-1",
        kind: "credit",
        amount_minor: -5401,
        replaces_estimate_minor: 0,
        consumes_commitment_minor: 0,
        credited_source_id: "invoice-allocation-1",
      }),
    );
    expect(() => calculate(x)).toThrow("Credit exceeds");
  });
  it("keeps real obligation when invoice rejected", () => {
    const x = fixture();
    x.sources[0]!.status = "rejected";
    const result = calculate(x);
    expect(result.known_cost_minor).toBe(0);
    expect(result.remaining_minor).toBe(5000);
    expect(result.eac_minor).toBe(5000);
  });
  it("explicit invoice authority makes hiredtime noncharging evidence", () => {
    const x = fixture();
    x.sources.push(
      source({
        source_id: "hired-time",
        kind: "time",
        amount_minor: 6000,
        replaces_estimate_minor: 0,
        consumes_commitment_minor: 0,
      }),
    );
    expect(calculate(x).eac_minor).toBe(5400);
  });
  it("does not hide unresolved hiredtime relation", () => {
    const x = fixture();
    x.sources.push(
      source({
        source_id: "hired-time",
        kind: "time",
        amount_minor: 6000,
        replaces_estimate_minor: 0,
        consumes_commitment_minor: 0,
        relation_coverage: "unresolved",
      }),
    );
    expect(calculate(x).eac_minor).toBeNull();
  });
  it("missing money remains unavailable rather than zero", () => {
    const x = fixture();
    x.sources[0]!.amount_minor = null;
    expect(calculate(x).eac_minor).toBeNull();
    expect(calculate(x).coverage).toBe("unavailable");
  });
  it("missing replacement preserves known cost but withholds forecast", () => {
    const x = fixture();
    x.sources[0]!.replaces_estimate_minor = null;
    const result = calculate(x);
    expect(result.known_cost_minor).toBe(5400);
    expect(result.eac_minor).toBeNull();
  });
  it("unknown estimate remains null", () => {
    const x = fixture();
    x.estimate_minor = null;
    expect(calculate(x).remaining_minor).toBeNull();
  });
  it("unresolved credit original holds EAC back", () => {
    const x = fixture();
    x.sources.push(
      source({
        source_id: "credit-1",
        kind: "credit",
        amount_minor: -100,
        replaces_estimate_minor: 0,
        consumes_commitment_minor: 0,
        credited_source_id: "unknown",
      }),
    );
    expect(calculate(x).eac_minor).toBeNull();
  });
  it("rejects replacement/consumption exceeding baseline instead of clamping", () => {
    for (const key of [
      "replaces_estimate_minor",
      "consumes_commitment_minor",
    ] as const) {
      const x = fixture();
      x.sources[0]![key] = 5001;
      expect(() => calculate(x)).toThrow("exceeds obligation");
    }
  });
  it("rejects ambiguous duplicate and crossproject source bindings", () => {
    const x = fixture();
    x.sources.push(source());
    expect(() => calculate(x)).toThrow("identity");
    x.sources.pop();
    x.sources[0]!.project_id = "00000000-0000-4000-8000-000000000090";
    expect(() => calculate(x)).toThrow("Cross-scope");
  });
  it("own staff time is the charge only under time authority", () => {
    const x = fixture();
    x.cost_basis = "time";
    x.sources = [source({ kind: "time", amount_minor: 5400 })];
    expect(calculate(x).eac_minor).toBe(5400);
    x.sources.push(source({ source_id: "invoice-2" }));
    expect(() => calculate(x)).toThrow("Competing");
  });
  it("does not mutate source or hide unsafe sums", () => {
    const x = fixture();
    const before = JSON.stringify(x);
    calculate(x);
    expect(JSON.stringify(x)).toBe(before);
    x.estimate_minor = Number.MAX_SAFE_INTEGER;
    x.committed_minor = Number.MAX_SAFE_INTEGER;
    x.sources[0]!.amount_minor = Number.MAX_SAFE_INTEGER;
    expect(() => calculate(x)).toThrow("Unsafe");
  });
});
