import { describe, it, expect } from "vitest";
import {
  calculateCateringPersonnelEvidence,
  type CateringTimeEntry,
} from "./catering-project-evidence.ts";
import { rawBodySha256 } from "./project-personnel-ingestion-transport.ts";
import {
  dispatchCateringFinanceClaim as dispatch,
  verifyCateringFinanceReceipt as verify,
  signCateringFinanceRequest as sign,
  type CateringFinanceClaim,
  type CateringFinanceReceipt,
} from "./catering-finance-transport.ts";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const endpoint =
  "https://finance.example/functions/v1/operations-catering-cost-receive";
const config = {
  enabled: true,
  endpoint,
  keyId: "native-finance-key",
  secret: "isolated-only-native-finance-hmac-at-least32",
};
async function fixture(): Promise<CateringFinanceClaim> {
  const entry: CateringTimeEntry = {
    id: id(5),
    organization_id: id(3),
    person_id: id(4),
    workplace_id: id(6),
    started_at: "2026-09-30T08:00:00Z",
    ended_at: "2026-09-30T10:00:00Z",
    break_minutes: 15,
    status: "pending",
    approved_by: null,
    approved_at: null,
    version: 1,
    source: "manual",
  };
  // Unit-only source fixture calculated by the actual Operations historical helper.
  const snapshot = await calculateCateringPersonnelEvidence(
    entry,
    null,
    {
      catering_organization_id: id(3),
      catering_person_id: id(4),
      organization_id: id(1),
      worker_id: id(2),
      project_id: id(7),
      obligation_id: id(8),
      mapping_revision: "allocation-v1",
      work_date: "2026-09-30",
      time_zone: "Europe/Stockholm",
      currency: "SEK",
      publication_revision: 1,
      project_review_status: "preliminary",
    },
    [
      {
        organization_id: id(1),
        worker_id: id(2),
        category: "work",
        currency: "SEK",
        rate_revision: "native-september-rate",
        hourly_rate_minor: 30001,
        effective_from: "2026-09-01",
        effective_to: "2026-10-01",
      },
    ],
  );
  const rawEntry = JSON.stringify(entry);
  const body = {
    schema_version: "operations-catering-delivery.v1",
    operations_organization_id: id(1),
    destination_organization_id: id(20),
    route_id: id(21),
    route_revision: "route-v1",
    key_id: config.keyId,
    source_stream_id: `catering:${id(3)}:${id(5)}`,
    source_outbox_id: id(22),
    source_observation_id: id(23),
    source_mapping_id: id(24),
    destinations: [{ project_id: id(7), obligation_id: id(8) }],
    destination_mappings: [
      {
        mapping_id: id(25),
        mapping_revision: "destination-v1",
        source_project_id: id(7),
        source_obligation_id: id(8),
        destination_project_id: id(26),
        currency: "SEK",
      },
    ],
    snapshot,
    raw_entry: rawEntry,
    raw_review: null,
    raw_entry_sha256: await rawBodySha256(rawEntry),
    raw_review_sha256: null,
    source_request_hash: await rawBodySha256(
      JSON.stringify({
        organizationId: id(3),
        personId: id(4),
        timeEntryId: id(5),
        expectedVersion: 1,
      }),
    ),
  };
  const raw = JSON.stringify(body);
  return {
    id: id(30),
    source_outbox_id: body.source_outbox_id,
    organization_id: id(1),
    source_stream_id: body.source_stream_id,
    source_revision: 1,
    raw_body: raw,
    body_sha256: await rawBodySha256(raw),
    destination_organization_id: id(20),
    route_id: id(21),
    route_revision: "route-v1",
    key_id: config.keyId,
    endpoint_url: endpoint,
    lease_owner: "native-fixture-worker",
    lease_token: id(31),
  };
}
const receipt = (c: CateringFinanceClaim): CateringFinanceReceipt => ({
  schema: "operations-catering-receipt.v1",
  outcome: "accepted",
  source_organization_id: c.organization_id,
  source_stream_id: c.source_stream_id,
  requested_source_revision: c.source_revision,
  applied_source_revision: c.source_revision,
  current_source_revision: c.source_revision,
  request_body_sha256: c.body_sha256,
  snapshot_receipt_id: id(40),
  snapshot_fingerprint: c.body_sha256,
  receipt_id: id(41),
  destination_organization_id: c.destination_organization_id,
  shadow_only: true,
});
describe("dedicated native Catering Finance transport", () => {
  it("sends the exact captured actual-engine105/52502 body and no database bearer", async () => {
    const c = await fixture();
    let request: RequestInit | undefined;
    const result = await dispatch(c, config, async (_url, init) => {
      request = init;
      return Response.json(receipt(c));
    });
    expect(result.outcome).toBe("delivered");
    expect(JSON.parse(c.raw_body).snapshot.amount_minor).toBe(52502);
    expect(request?.body).toBe(c.raw_body);
    expect(new Headers(request?.headers).has("authorization")).toBe(false);
  });
  it("never treats an arbitrary2xx as acknowledgement", async () => {
    const c = await fixture();
    expect(
      (await dispatch(c, config, async () => Response.json({ ok: true })))
        .outcome,
    ).toBe("retry");
  });
  it("binds accepted/replayed rawbody fingerprint rather than an arbitrary64hex", async () => {
    const c = await fixture();
    expect(() =>
      verify({ ...receipt(c), snapshot_fingerprint: "b".repeat(64) }, c, 200),
    ).toThrow();
    expect(
      verify({ ...receipt(c), outcome: "replayed" }, c, 200)
        .snapshot_fingerprint,
    ).toBe(c.body_sha256);
  });
  it("binds stale to a higher current revision and its separate saved hash", async () => {
    const c = await fixture();
    const r = {
      ...receipt(c),
      outcome: "stale" as const,
      applied_source_revision: 2,
      current_source_revision: 2,
      snapshot_fingerprint: "b".repeat(64),
    };
    expect(verify(r, c, 409).outcome).toBe("stale");
    expect(() =>
      verify({ ...r, current_source_revision: 3 }, c, 409),
    ).toThrow();
  });
  it("rejects foreign tenant, wrong stream, extra receipt field and array UUID", async () => {
    const c = await fixture();
    for (const r of [
      { ...receipt(c), destination_organization_id: id(99) },
      { ...receipt(c), source_organization_id: id(3) },
      { ...receipt(c), source_stream_id: "time:invented" },
      { ...receipt(c), extra: true },
      { ...receipt(c), snapshot_receipt_id: [id(40)] },
    ])
      expect(() => verify(r, c, 200)).toThrow();
  });
  it("blocks mutated capture or redirected route before HTTP", async () => {
    const c = await fixture();
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return Response.json(receipt(c));
    };
    expect(
      (await dispatch({ ...c, raw_body: c.raw_body + " " }, config, fetcher))
        .outcome,
    ).toBe("blocked");
    expect(
      (
        await dispatch(
          c,
          { ...config, endpoint: endpoint + "?redirect=evil" },
          fetcher,
        )
      ).outcome,
    ).toBe("blocked");
    expect(calls).toBe(0);
  });
  it("requires literal enabledtrue and retries unknown commit with identical body", async () => {
    const c = await fixture();
    expect(
      (await dispatch(c, { ...config, enabled: "true" as unknown as boolean }))
        .outcome,
    ).toBe("blocked");
    const result = await dispatch(c, config, async () => {
      throw new Error("unknown commit");
    });
    expect(result).toEqual({
      outcome: "retry",
      error: "catering_finance_ack_unknown",
    });
  });
  it("uses a dedicated signature purpose and bounded native key configuration", async () => {
    const c = await fixture();
    const signed = await sign(c.raw_body, c.key_id, config.secret, {
      now: new Date("2026-10-02T01:00:00Z"),
      nonce: "native-finance-fixed-nonce",
    });
    expect(signed["x-eventflow-signature"]).toMatch(/^v1=[0-9a-f]{64}$/);
    await expect(sign(c.raw_body, c.key_id, "short")).rejects.toThrow();
    await expect(
      sign("x".repeat(262145), c.key_id, config.secret),
    ).rejects.toThrow();
  });
  it("bounds abort-ignoring fetch and cancels late Finance body", async () => {
    const c = await fixture();
    let resolve: ((r: Response) => void) | undefined;
    let cancelled = false;
    const f: typeof fetch = () =>
      new Promise((r) => {
        resolve = r;
      });
    const result = await dispatch(c, { ...config, timeoutMs: 1000 }, f);
    expect(result.outcome).toBe("retry");
    resolve?.(
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
      ),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(cancelled).toBe(true);
  });
  it("cancelled slow receipt never becomes a successful delivery", async () => {
    const c = await fixture();
    let cancelled = false;
    const f: typeof fetch = async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
            return new Promise(() => {});
          },
        }),
      );
    expect((await dispatch(c, { ...config, timeoutMs: 1000 }, f)).outcome).toBe(
      "retry",
    );
    expect(cancelled).toBe(true);
  });
});
