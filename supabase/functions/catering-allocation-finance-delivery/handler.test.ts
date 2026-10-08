import { describe, expect, it } from "vitest";
import { handleCateringAllocationDelivery as handle } from "./handler.ts";
import fixture from "../_shared/__fixtures__/cateringAllocationDelivery.json" with {
  type: "json",
};
const createIsolatedCateringFinanceClaim = async () => structuredClone(fixture);
const internal = "isolated-catering-dispatch-authority-at-least32";
const id = (n: number) =>
  `96000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const request = (
  body: unknown = { organization_id: id(1), delivery_id: fixture.id },
  secret: string | null = internal,
) =>
  new Request(
    "https://operations.example/functions/v1/catering-allocation-finance-delivery",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret
          ? { "x-eventflow-catering-allocation-dispatch-secret": secret }
          : {}),
      },
      body: JSON.stringify(body),
    },
  );
const config: Record<string, string> = {
  OPERATIONS_CATERING_ALLOCATION_DELIVERY_ENABLED: "true",
  OPERATIONS_CATERING_ALLOCATION_DISPATCH_SECRET: internal,
  SUPABASE_URL: "https://operations-db.example",
  SUPABASE_SERVICE_ROLE_KEY: "isolated-db-authority-only",
  OPERATIONS_CATERING_ALLOCATION_HMAC_KEYS_JSON: JSON.stringify({
    "isolated-allocation-key-v2": "isolated-finance-hmac-at-least32-bytes-long",
  }),
};
describe("native Catering dedicated dispatcher", () => {
  it("default-off and independent dispatch authority fail before DB or Finance HTTP", async () => {
    for (
      const [env, req, status] of [
        [{}, request(), 503],
        [config, request(undefined, null), 401],
        [config, request(undefined, "isolated-db-authority-only"), 401],
      ] as const
    ) {
      let calls = 0;
      const response = await handle(req, {
        env: (n) => env[n as keyof typeof env],
        fetch: async () => {
          calls++;
          throw new Error();
        },
      });
      expect(response.status).toBe(status);
      expect(calls).toBe(0);
    }
  });
  it("rejects foreign input shape and wrong runtime UUID types before DB", async () => {
    for (
      const body of [
        { organization_id: [id(1)], delivery_id: fixture.id },
        {
          organization_id: id(1),
          delivery_id: fixture.id,
          raw_entry: "invented",
        },
      ]
    ) {
      let calls = 0;
      expect(
        (
          await handle(request(body), {
            env: (n) => config[n],
            fetch: async () => {
              calls++;
              throw new Error();
            },
          })
        ).status,
      ).toBe(400);
      expect(calls).toBe(0);
    }
  });
  it("sends captured bytes with dedicated key and finishes exact lease without forwarding database authority", async () => {
    const claim = await createIsolatedCateringFinanceClaim();
    let financeCalls = 0;
    let finished = false;
    const f: typeof fetch = async (input, init) => {
      const url = String(input);
      const args = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (url.endsWith("claim_operations_catering_allocation_delivery_v2")) {
        claim.lease_owner = String(args.p_lease_owner);
        return Response.json(claim);
      }
      if (url.endsWith("finish_operations_catering_allocation_delivery_v2")) {
        expect(args.p_lease_token).toBe(claim.lease_token);
        expect(args.p_outcome).toBe("delivered");
        finished = true;
        return Response.json({
          delivery_id: claim.id,
          status: "delivered",
          source_outbox_status: "parked",
        });
      }
      financeCalls++;
      expect(String(init?.body)).toBe(claim.raw_body);
      const h = new Headers(init?.headers);
      expect(h.get("Authorization")).toBeNull();
      expect(h.get("apikey")).toBeNull();
      expect(h.get("x-eventflow-catering-allocation-dispatch-secret"))
        .toBeNull();
      expect(h.get("x-eventflow-key-id")).toBe(claim.key_id);
      return Response.json({
        schema: "operations-catering-receipt.v2",
        outcome: "accepted",
        source_organization_id: claim.organization_id,
        source_stream_id: claim.source_stream_id,
        requested_source_revision: 3,
        applied_source_revision: 3,
        current_source_revision: 3,
        request_body_sha256: claim.body_sha256,
        snapshot_receipt_id: id(41),
        snapshot_fingerprint: claim.body_sha256,
        receipt_id: id(42),
        destination_organization_id: claim.destination_organization_id,
        shadow_only: true,
      });
    };
    const result = await handle(request(), { env: (n) => config[n], fetch: f });
    expect(result.status).toBe(200);
    expect(financeCalls).toBe(1);
    expect(finished).toBe(true);
  });
  it("blocks missing dedicated signing key and keeps original parked source outbox", async () => {
    const claim = await createIsolatedCateringFinanceClaim();
    let counterparty = 0;
    const f: typeof fetch = async (input, init) => {
      const url = String(input),
        args = JSON.parse(String(init?.body));
      if (url.endsWith("claim_operations_catering_allocation_delivery_v2")) {
        claim.lease_owner = args.p_lease_owner;
        return Response.json(claim);
      }
      if (url.endsWith("finish_operations_catering_allocation_delivery_v2")) {
        expect(args.p_outcome).toBe("blocked");
        expect(args.p_receipt).toBeNull();
        return Response.json({
          delivery_id: claim.id,
          status: "blocked",
          source_outbox_status: "parked",
        });
      }
      counterparty++;
      throw new Error();
    };
    expect(
      (
        await handle(request(), {
          env: (n) =>
            n === "OPERATIONS_CATERING_ALLOCATION_HMAC_KEYS_JSON"
              ? undefined
              : config[n],
          fetch: f,
        })
      ).status,
    ).toBe(409);
    expect(counterparty).toBe(0);
  });
  it("denies wrong DB claim tenant before external delivery", async () => {
    const claim = await createIsolatedCateringFinanceClaim();
    let calls = 0;
    const f: typeof fetch = async (_input, init) => {
      calls++;
      claim.lease_owner = JSON.parse(String(init?.body)).p_lease_owner;
      return Response.json({ ...claim, organization_id: id(99) });
    };
    expect(
      (await handle(request(), { env: (n) => config[n], fetch: f })).status,
    ).toBe(503);
    expect(calls).toBe(1);
  });
  it("finishes a captured body mismatch as blocked with the locked SQL error enum", async () => {
    const claim = await createIsolatedCateringFinanceClaim();
    claim.body_sha256 = "0".repeat(64);
    let finished = false;
    let sent = false;
    const f: typeof fetch = async (input, init) => {
      const url = String(input),
        args = JSON.parse(String(init?.body));
      if (url.endsWith("claim_operations_catering_allocation_delivery_v2")) {
        claim.lease_owner = args.p_lease_owner;
        return Response.json(claim);
      }
      if (url.endsWith("finish_operations_catering_allocation_delivery_v2")) {
        expect(args.p_outcome).toBe("blocked");
        expect(args.p_error).toBe(
          "catering_allocation_finance_capture_or_configuration_invalid",
        );
        finished = true;
        return Response.json({
          delivery_id: claim.id,
          status: "blocked",
          source_outbox_status: "parked",
        });
      }
      sent = true;
      throw new Error();
    };
    expect(
      (await handle(request(), { env: (n) => config[n], fetch: f })).status,
    ).toBe(409);
    expect(finished).toBe(true);
    expect(sent).toBe(false);
  });
});
