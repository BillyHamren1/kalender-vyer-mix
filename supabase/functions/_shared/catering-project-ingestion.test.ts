import { describe, it, expect } from "vitest";
import {
  buildCateringPublication as build,
  verifyCateringEntryRead as verify,
  readAuthenticatedCateringEntry as readAuthenticated,
  trustedCateringReadEndpoint,
  type CateringEntryRead,
  type CateringSourceBinding,
  type CateringResolvedAllocation,
  type CateringCurrentPublication,
} from "./catering-project-ingestion.ts";
import {
  fingerprintCateringSource,
  reviseCateringProjectReview,
  type CateringTimeEntry,
  type CateringTimeReview,
} from "./catering-project-evidence.ts";
import { rawBodySha256 } from "./project-personnel-ingestion-transport.ts";
import { deriveSigningKeyFromSeed } from "./timeServiceProof.ts";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding: CateringSourceBinding = {
  organization_id: id(1),
  worker_id: id(2),
  catering_organization_id: id(3),
  catering_person_id: id(4),
  endpoint_url: "https://catering.example/api/project-economy-read",
  key_id: "catering-key-1",
  enabled: true,
};
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
const allocation: CateringResolvedAllocation = {
  organization_id: id(1),
  catering_organization_id: id(3),
  catering_person_id: id(4),
  time_entry_id: id(5),
  workplace_id: id(6),
  work_date: "2026-09-30",
  time_zone: "Europe/Stockholm",
  project_id: id(7),
  obligation_id: id(8),
  currency: "SEK",
  mapping_revision: "map-1",
  enabled: true,
};
const rate = {
  organization_id: id(1),
  worker_id: id(2),
  category: "work" as const,
  currency: "SEK",
  rate_revision: "rate-september",
  hourly_rate_minor: 30001,
  effective_from: "2026-09-01",
  effective_to: "2026-10-01",
};
const empty: CateringCurrentPublication = {
  current_revision: 0,
  evidence: null,
  raw_entry: null,
  raw_review: null,
};
const attempt = {
  key_id: binding.key_id,
  nonce: "native-read-nonce-1",
  request_body_sha256: "a".repeat(64),
};
async function response(
  e = entry,
  review: CateringTimeReview | null = null,
): Promise<CateringEntryRead> {
  const rawEntry = JSON.stringify(e),
    rawReview = review ? JSON.stringify(review) : null;
  return {
    schema: "catering-project-economy-read-response.v1",
    entry: e,
    review,
    rawEntry,
    rawEntrySha256: await rawBodySha256(rawEntry),
    rawReview,
    rawReviewSha256: rawReview ? await rawBodySha256(rawReview) : null,
    metadata: {
      organizationId: e.organization_id,
      personId: e.person_id,
      timeEntryId: e.id,
      entryVersion: e.version,
      currentVersion: e.version,
      workplaceId: e.workplace_id,
    },
    proofReceipt: {
      issuer: "eventflow-operations",
      audience: "eventflow-catering-project-economy-read",
      keyId: attempt.key_id,
      nonce: attempt.nonce,
      requestBodySha256: attempt.request_body_sha256,
    },
  };
}
function reviewed(
  before: CateringTimeEntry,
  changes: Partial<CateringTimeEntry>,
) {
  const after = { ...before, ...changes, version: before.version + 1 };
  const review: CateringTimeReview = {
    id: id(100 + after.version),
    organization_id: id(3),
    time_entry_id: id(5),
    from_status: before.status,
    to_status: after.status,
    before_payload: before,
    after_payload: after,
    reviewed_by: id(9),
    reviewed_at: "2026-10-01T09:00:00Z",
  };
  return { after, review };
}
async function first(rates = [rate]) {
  const r = await response();
  const result = await build({
    read: r,
    binding,
    allocation,
    current: empty,
    rates,
  });
  if (!result) throw new Error("missing first");
  return {
    result,
    current: {
      current_revision: 2,
      evidence: reviseCateringProjectReview(result.evidence, 2, "confirmed"),
      raw_entry: r.rawEntry,
      raw_review: r.rawReview,
    },
  };
}
describe("protected native Catering publication builder", () => {
  it("actual native entry canonical fingerprint matches frozen SQL parity fixture", async () => {
    expect(await fingerprintCateringSource(entry)).toBe(
      "707c0e992a6b4afc373b71e7cf26b77c3b5da9b4ae7072c4fac1fb36664eb137",
    );
  });
  it("publishes persisted pending genuine native identity as preliminary, exact amount and no Time IDs", async () => {
    const { result } = await first();
    expect(result.evidence).toMatchObject({
      amount_minor: 52502,
      minutes: 105,
      project_review_status: "preliminary",
      source_status: "pending",
      source_time_entry_version: 1,
    });
    expect(result.stream_id).toBe(`catering:${id(3)}:${id(5)}`);
    expect(
      Object.keys(result.evidence).some((k) => k.includes("submission")),
    ).toBe(false);
  });
  it("retains project confirmation across payroll approval only when economics identical", async () => {
    const { current } = await first();
    const s = reviewed(entry, {
      status: "approved",
      approved_by: id(9),
      approved_at: "2026-10-01T09:00:01Z",
    });
    const next = await build({
      read: await response(s.after, s.review),
      binding,
      allocation,
      current,
      rates: [rate],
    });
    expect(next?.evidence).toMatchObject({
      amount_minor: 52502,
      publication_revision: 3,
      project_review_status: "confirmed",
      source_status: "approved",
      source_review_id: s.review.id,
    });
  });
  it("payroll approval never automatically confers project confirmation", async () => {
    const s = reviewed(entry, {
      status: "approved",
      approved_by: id(9),
      approved_at: "2026-10-01T09:00:01Z",
    });
    expect(
      (
        await build({
          read: await response(s.after, s.review),
          binding,
          allocation,
          current: empty,
          rates: [rate],
        })
      )?.evidence.project_review_status,
    ).toBe("preliminary");
  });
  it("corrected minutes invalidate confirmation while retaining captured historical rate", async () => {
    const { current } = await first();
    const s = reviewed(entry, { break_minutes: 30 });
    const next = await build({
      read: await response(s.after, s.review),
      binding,
      allocation,
      current,
      rates: [
        rate,
        { ...rate, rate_revision: "new-rate", hourly_rate_minor: 60000 },
      ],
    });
    expect(next?.evidence).toMatchObject({
      minutes: 90,
      amount_minor: 45002,
      project_review_status: "preliminary",
      rate_revision: rate.rate_revision,
    });
  });
  it("economic allocation changes invalidate earlier decision on a new source version", async () => {
    const { current } = await first();
    const s = reviewed(entry, {});
    expect(
      (
        await build({
          read: await response(s.after, s.review),
          binding,
          allocation: {
            ...allocation,
            project_id: id(11),
            mapping_revision: "map-2",
          },
          current,
          rates: [rate],
        })
      )?.evidence.project_review_status,
    ).toBe("preliminary");
  });
  it("same economic fingerprint retains explicit project rejection, independent from payroll", async () => {
    const { current } = await first();
    current.evidence = reviseCateringProjectReview(
      current.evidence!,
      3,
      "rejected",
    );
    current.current_revision = 3;
    const s = reviewed(entry, {});
    expect(
      (
        await build({
          read: await response(s.after, s.review),
          binding,
          allocation,
          current,
          rates: [rate],
        })
      )?.evidence.project_review_status,
    ).toBe("rejected");
  });
  it("global rejection overrides project confirmation", async () => {
    const { current } = await first();
    const s = reviewed(entry, { status: "rejected" });
    expect(
      (
        await build({
          read: await response(s.after, s.review),
          binding,
          allocation,
          current,
          rates: [rate],
        })
      )?.evidence,
    ).toMatchObject({
      source_status: "rejected",
      project_review_status: "rejected",
    });
  });
  it("missing captured rate remains unavailable during payroll-only versions", async () => {
    const { current } = await first([]);
    const s = reviewed(entry, {});
    expect(
      (
        await build({
          read: await response(s.after, s.review),
          binding,
          allocation,
          current,
          rates: [rate],
        })
      )?.evidence,
    ).toMatchObject({
      coverage: "missing_rate",
      amount_minor: null,
      project_review_status: "confirmed",
    });
  });
  it("exact source replay cannot overwrite Operations decision", async () => {
    const { current } = await first();
    expect(
      await build({
        read: await response(),
        binding,
        allocation,
        current,
        rates: [rate],
      }),
    ).toBeNull();
  });
  it("same source version changed raw evidence or allocation fails closed", async () => {
    const { current } = await first();
    await expect(
      build({
        read: await response({ ...entry, employee_note: "changed" }),
        binding,
        allocation,
        current,
        rates: [rate],
      }),
    ).rejects.toThrow("same_native_version_changed");
    await expect(
      build({
        read: await response(),
        binding,
        allocation: { ...allocation, mapping_revision: "map-2" },
        current,
        rates: [rate],
      }),
    ).rejects.toThrow("native_allocation_changed_requires_review");
  });
  it("stale source and missing captured rate fail rather than silently recalculate", async () => {
    const { current } = await first();
    const s = reviewed(entry, {});
    await expect(
      build({
        read: await response(s.after, s.review),
        binding,
        allocation,
        current,
        rates: [],
      }),
    ).rejects.toThrow("captured_native_rate_unavailable");
    current.evidence = { ...current.evidence!, source_time_entry_version: 3 };
    await expect(
      build({
        read: await response(),
        binding,
        allocation,
        current,
        rates: [rate],
      }),
    ).rejects.toThrow("stale_native_entry_version");
  });
  it("scope, body hash, receipt and raw observation must match exact read attempt", async () => {
    const r = await response();
    for (const bad of [
      { ...r, rawEntry: r.rawEntry + " " },
      { ...r, metadata: { ...r.metadata, currentVersion: 2 } },
      { ...r, proofReceipt: { ...r.proofReceipt, nonce: "other" } },
      { ...r, entry: { ...entry, person_id: id(99) } },
    ])
      await expect(verify(bad, binding, id(5), 1, attempt)).rejects.toThrow();
  });
  it("foreign, disabled and coercible identity allocation is rejected", async () => {
    for (const bad of [
      { ...allocation, enabled: false },
      { ...allocation, workplace_id: id(99) },
      { ...allocation, project_id: [id(7)] as unknown as string },
    ])
      await expect(
        build({
          read: await response(),
          binding,
          allocation: bad,
          current: empty,
          rates: [rate],
        }),
      ).rejects.toThrow("native_allocation_missing_or_foreign");
  });
  it("rejects truthy coercible runtime enabled flags in bindings and allocations", async () => {
    for (const enabled of ["false", [true], 1]) {
      const bad = { ...binding, enabled: enabled as unknown as boolean };
      await expect(
        verify(await response(), bad, id(5), 1, attempt),
      ).rejects.toThrow("invalid_catering_source_binding");
      await expect(
        readAuthenticated(bad, id(5), 1, {
          endpoint: binding.endpoint_url,
          keyId: binding.key_id,
          signingSeed: "isolated-catering-test-key-seed-not-Time",
        }),
      ).rejects.toThrow("catering_source_route_mismatch");
      await expect(
        build({
          read: await response(),
          binding,
          allocation: { ...allocation, enabled: enabled as unknown as boolean },
          current: empty,
          rates: [rate],
        }),
      ).rejects.toThrow("native_allocation_missing_or_foreign");
    }
  });
  it("only exact HTTPS route without credentials or query is trusted", () => {
    for (const u of [
      "http://catering.example/api/project-economy-read",
      "https://x:y@catering.example/api/project-economy-read",
      "https://catering.example/other",
      "https://catering.example/api/project-economy-read?q=1",
    ])
      expect(() => trustedCateringReadEndpoint(u)).toThrow();
  });
  it("signs dedicated native proof binding actual body and verifies returned receipt", async () => {
    const seed = "isolated-catering-test-key-seed-not-Time-production";
    const key = await deriveSigningKeyFromSeed(seed);
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      key.publicJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const mocked: typeof fetch = async (url, init) => {
      expect(url).toBe(binding.endpoint_url);
      expect(init?.redirect).toBe("error");
      const headers = new Headers(init?.headers);
      expect(headers.has("authorization")).toBe(false);
      const token = headers.get("x-project-economy-service-proof")!.split(".");
      const decode = (s: string) =>
        JSON.parse(Buffer.from(s, "base64url").toString());
      expect(decode(token[0]).kid).toBe(binding.key_id);
      const claims = decode(token[1]);
      expect(claims).toMatchObject({
        aud: "eventflow-catering-project-economy-read",
        purpose: "time-entry.read",
        timeEntryId: id(5),
        expectedVersion: 1,
      });
      expect(claims.bodySha256).toBe(await rawBodySha256(String(init?.body)));
      expect(
        await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" },
          publicKey,
          Buffer.from(token[2], "base64url"),
          new TextEncoder().encode(token.slice(0, 2).join(".")),
        ),
      ).toBe(true);
      const r = await response();
      r.proofReceipt.nonce = claims.nonce;
      r.proofReceipt.requestBodySha256 = claims.bodySha256;
      return Response.json(r);
    };
    expect(
      (
        await readAuthenticated(
          binding,
          id(5),
          1,
          {
            endpoint: binding.endpoint_url,
            keyId: binding.key_id,
            signingSeed: seed,
          },
          mocked,
        )
      ).entry.id,
    ).toBe(id(5));
  });
});

import { createCateringPublishHandler } from "../catering-project-cost-publish/handler.ts";
const internalSecret = "isolated-internal-Catering-secret-at-least-32";
const command = {
  schema: "operations-catering-ingest.v1",
  operation: "time-entry.ingest",
  organization_id: id(1),
  worker_id: id(2),
  time_entry_id: id(5),
  expected_version: 1,
};
const request = (body: unknown = command, auth = internalSecret) =>
  new Request("https://ops.example/catering-project-cost-publish", {
    method: "POST",
    headers: { authorization: "Bearer " + auth },
    body: JSON.stringify(body),
  });
function handlerConfig(fetchImpl: typeof fetch) {
  return {
    enabled: true,
    internalSecret,
    databaseUrl: "https://operations-db.example",
    databaseServiceKey: "own-operations-service-key",
    cateringSigningSeed: "isolated-catering-test-key-seed-not-Time",
    fetchImpl,
  };
}
function verticalFetch(
  options: { gate?: unknown; casOnce?: boolean; receiptWrong?: boolean } = {},
) {
  const calls: string[] = [];
  let publishes = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    const u = new URL(String(url));
    calls.push(u.hostname + u.pathname);
    const headers = new Headers(init?.headers);
    if (u.hostname === "catering.example") {
      expect(headers.has("apikey")).toBe(false);
      expect(headers.has("authorization")).toBe(false);
      const claims = JSON.parse(
        Buffer.from(
          headers.get("x-project-economy-service-proof")!.split(".")[1],
          "base64url",
        ).toString(),
      );
      const r = await response();
      r.proofReceipt.nonce = claims.nonce;
      r.proofReceipt.requestBodySha256 = claims.bodySha256;
      return Response.json(r);
    }
    expect(u.hostname).toBe("operations-db.example");
    expect(headers.get("authorization")).toBe(
      "Bearer own-operations-service-key",
    );
    if (u.pathname.endsWith("/operations_catering_publish_gates"))
      return Response.json([{ enabled: options.gate ?? true }]);
    if (u.pathname.endsWith("/operations_catering_source_bindings"))
      return Response.json([binding]);
    if (u.pathname.endsWith("/operations_catering_project_mappings"))
      return Response.json([{ ...allocation, id: id(10) }]);
    if (u.pathname.endsWith("/operations_catering_cost_streams"))
      return Response.json([]);
    if (u.pathname.endsWith("/operations_personnel_rate_history"))
      return Response.json([rate]);
    if (u.pathname.endsWith("/rpc/publish_operations_catering_cost_v1")) {
      publishes++;
      const body = JSON.parse(String(init?.body));
      expect(body.p_snapshot).toMatchObject({
        amount_minor: 52502,
        source_time_entry_id: id(5),
        project_review_status: "preliminary",
      });
      if (options.casOnce && publishes === 1)
        return Response.json({ code: "40001" }, { status: 409 });
      return Response.json({
        outcome: "accepted",
        source_revision: options.receiptWrong ? 2 : 1,
        current_revision: 1,
        observation_id: id(30),
        delivery_status: "parked",
      });
    }
    throw new Error("unexpected fixture route");
  };
  return { fetchImpl, calls, publishes: () => publishes };
}
describe("protected Catering publisher isolated HTTP vertical", () => {
  it("gets scoped native source itself, persists one parked publication without forwarding Operations keys", async () => {
    const mock = verticalFetch();
    const result = await createCateringPublishHandler(
      handlerConfig(mock.fetchImpl),
    )(request());
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      outcome: "accepted",
      source_revision: 1,
      delivery_status: "parked",
    });
    expect(mock.publishes()).toBe(1);
  });
  it("environment, authorization and method gates deny before database or source requests", async () => {
    const mock = verticalFetch();
    const config = handlerConfig(mock.fetchImpl);
    expect(
      (
        await createCateringPublishHandler({ ...config, enabled: false })(
          request(),
        )
      ).status,
    ).toBe(503);
    expect(
      (await createCateringPublishHandler(config)(request(command, "wrong")))
        .status,
    ).toBe(401);
    expect(
      (
        await createCateringPublishHandler(config)(
          new Request("https://ops.example", { method: "GET" }),
        )
      ).status,
    ).toBe(405);
    expect(mock.calls).toEqual([]);
  });
  it("never accepts caller-supplied source document, allocation, rate or coercible version", async () => {
    const mock = verticalFetch();
    const handler = createCateringPublishHandler(handlerConfig(mock.fetchImpl));
    for (const extra of [
      { raw_entry: entry },
      { allocation },
      { rates: [rate] },
      { expected_version: "1" },
    ])
      expect((await handler(request({ ...command, ...extra }))).status).toBe(
        400,
      );
    expect(mock.calls).toEqual([]);
  });
  it("explicit database gate rejects truthy wrong-type flags before native reads", async () => {
    const mock = verticalFetch({ gate: "false" });
    expect(
      (
        await createCateringPublishHandler(handlerConfig(mock.fetchImpl))(
          request(),
        )
      ).status,
    ).toBe(503);
    expect(mock.calls).toHaveLength(1);
    expect(mock.publishes()).toBe(0);
  });
  it("CAS conflict retries bounded head resolution using same frozen native read", async () => {
    const mock = verticalFetch({ casOnce: true });
    expect(
      (
        await createCateringPublishHandler(handlerConfig(mock.fetchImpl))(
          request(),
        )
      ).status,
    ).toBe(200);
    expect(mock.publishes()).toBe(2);
    expect(
      mock.calls.filter((c) => c.startsWith("catering.example")),
    ).toHaveLength(1);
  });
  it("malformed durable acknowledgement cannot masquerade as accepted publication", async () => {
    const mock = verticalFetch({ receiptWrong: true });
    expect(
      (
        await createCateringPublishHandler(handlerConfig(mock.fetchImpl))(
          request(),
        )
      ).status,
    ).toBe(503);
  });
});
