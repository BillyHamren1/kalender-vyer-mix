/** Pure immutable encoding only. No authorization/currentness, pricing, signing or I/O. */
import { validateWholeScopeGrantedPublicationCommand } from "./whole-scope-grant-publication-successor-command-v2.ts";
import {
  wholeScopeProductCanonicalJson,
  wholeScopeProductCaptureFingerprint,
} from "./whole-scope-product-source-proof.ts";
import {
  validateWholeScopeProductGrantEvent,
  wholeScopeProductGrantEventProjection,
} from "./whole-scope-product-grant-event-v1.ts";

type Row = Record<string, unknown>;
export const GRANTED_SCOPE_RENDERER_INPUT_SCHEMA =
  "operations-whole-scope-granted-product-renderer-input.v1";
export const GRANTED_SCOPE_RENDERER_RESULT_SCHEMA =
  "operations-whole-scope-granted-product-renderer-result.v1";
export const GRANTED_SCOPE_RENDERER_BODY_LIMIT = 262144;
const encoder = new TextEncoder();
const documentKeys = [
  "schema_version",
  "publication_id",
  "organization_id",
  "economic_scope_id",
  "publication_revision",
  "actor_id",
  "command",
  "calculation_version",
  "full_membership",
  "scope_snapshot_id",
  "scope_revision",
  "membership_fingerprint",
  "composition_snapshot_id",
  "composition_revision",
  "composition_fingerprint",
  "capture",
  "projection",
  "source_manifest",
  "source_evidence_fingerprint",
  "observed_at",
  "export_grant",
  "shadow_only",
];
const receiptKeys = [
  "schema_version",
  "outcome",
  "publication_id",
  "publication_revision",
  "source_publication_fingerprint",
  "source_evidence_fingerprint",
  "grant_event_id",
  "grant_revision",
  "grant_fingerprint",
  "historical_only",
  "delivery_state",
  "shadow_only",
];
const projectionKeys = [
  "schema_version",
  "authority_scope",
  "organization_id",
  "economic_scope_id",
  "currency",
  "scope_snapshot_id",
  "scope_revision",
  "membership_fingerprint",
  "composition_snapshot_id",
  "composition_revision",
  "composition_fingerprint",
  "root_kind",
  "root_id",
  "membership_currentness",
  "source_currentness",
  "as_of",
  "known_captured_invoice_cost_minor",
  "confirmed_captured_invoice_cost_minor",
  "preliminary_captured_invoice_cost_minor",
  "resolved_source_count",
  "excluded_source_anchors",
  "member_count",
  "captured_inventory_fingerprint",
  "captured_inventory_matches_current",
  "diagnostics",
  "category_coverage",
  "source_coverage",
  "credit_eligible",
  "remaining_minor",
  "eac_minor",
  "budget_minor",
  "margin_minor",
  "shadow_only",
];
const manifestKeys = [
  "source_anchor",
  "project_id",
  "obligation_id",
  "binding_event_id",
  "source_snapshot_id",
  "source_economic_revision",
  "source_economic_fingerprint",
  "source_raw_sha256",
  "current_snapshot_id",
  "current_raw_sha256",
  "policy_state",
  "policy_event_id",
  "policy_revision",
  "policy_fingerprint",
  "mapping_state",
  "reason",
];
const reasons = [
  "unsupported_cost_basis",
  "missing_invoice_obligation",
  "missing_source_binding",
  "changed_baseline",
  "changed_invoice_economics",
  "saved_source_provenance_unavailable",
  "positive_original_unavailable",
  "unified_current_economics_unavailable",
];
const diagnosticCodes = [
  "category_coverage_unavailable",
  "source_inventory_incomplete",
  "credit_mapping_unavailable",
  "time_and_native_catering_mapping_unavailable",
  "unsupported_cost_basis",
  "captured_inventory_changed",
];
const selectors = [
  "scope_snapshot_id",
  "scope_revision",
  "membership_fingerprint",
  "composition_snapshot_id",
  "composition_revision",
  "composition_fingerprint",
];
function invalid(): never {
  throw new Error("invalid_whole_scope_granted_product_renderer_input");
}
function check(value: unknown): asserts value {
  if (value !== true) invalid();
}
function exact(value: unknown, keys: string[]): Row {
  check(value !== null && typeof value === "object" && !Array.isArray(value));
  const row = value as Row;
  check(Object.keys(row).sort().join(",") === [...keys].sort().join(","));
  return row;
}
function canonical(value: unknown): string {
  return wholeScopeProductCanonicalJson(JSON.stringify(value));
}
function same(a: unknown, b: unknown): void {
  check(canonical(a) === canonical(b));
}
function uuid(value: unknown): void {
  check(
    typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        value,
      ),
  );
}
function hash(value: unknown): void {
  check(typeof value === "string" && /^[0-9a-f]{64}$/.test(value));
}
function integer(value: unknown, positive = false): asserts value is number {
  check(
    typeof value === "number" &&
      Number.isSafeInteger(value) &&
      !Object.is(value, -0) &&
      value >= (positive ? 1 : 0),
  );
}
function array(value: unknown, limit: number): unknown[] {
  check(Array.isArray(value) && value.length <= limit);
  return value as unknown[];
}
function timestamp(value: unknown): void {
  check(
    typeof value === "string" &&
      /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
        value,
      ) &&
      Number.isFinite(Date.parse(value)),
  );
  const day = new Date(0);
  day.setUTCFullYear(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10)),
  );
  check(
    day.getUTCFullYear() === Number(value.slice(0, 4)) &&
      day.getUTCMonth() + 1 === Number(value.slice(5, 7)) &&
      day.getUTCDate() === Number(value.slice(8, 10)),
  );
}
async function sha(raw: string): Promise<string> {
  const owned = encoder.encode(raw);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", owned));
  return Array.from(digest, (x) => x.toString(16).padStart(2, "0")).join("");
}
function validateManifest(value: unknown): Row[] {
  let previous = "";
  return array(value, 10000).map((item) => {
    const r = exact(item, manifestKeys);
    hash(r.source_anchor);
    check((r.source_anchor as string) > previous);
    previous = r.source_anchor as string;
    for (const k of [
      "project_id",
      "obligation_id",
      "binding_event_id",
      "source_snapshot_id",
    ])
      uuid(r[k]);
    integer(r.source_economic_revision, true);
    hash(r.source_economic_fingerprint);
    hash(r.source_raw_sha256);
    check(["current", "missing", "stale"].includes(r.policy_state as string));
    if (r.policy_state === "missing")
      check(
        r.policy_event_id === null &&
          r.policy_revision === null &&
          r.policy_fingerprint === null,
      );
    else {
      uuid(r.policy_event_id);
      integer(r.policy_revision, true);
      hash(r.policy_fingerprint);
    }
    if (r.mapping_state === "charging") {
      check(r.reason === null);
      uuid(r.current_snapshot_id);
      hash(r.current_raw_sha256);
    } else {
      check(
        ["excluded", "unsupported_basis"].includes(r.mapping_state as string) &&
          reasons.includes(r.reason as string) &&
          r.current_snapshot_id === null &&
          r.current_raw_sha256 === null &&
          r.policy_state !== "current",
      );
      if (r.mapping_state === "unsupported_basis")
        check(r.reason === "unsupported_cost_basis");
    }
    return r;
  });
}
function validateProjection(
  value: unknown,
  publication: Row,
  sources: Row[],
): Row {
  const p = exact(value, projectionKeys);
  check(
    p.schema_version === "operations-scope-invoice-kernel-projection.v1" &&
      p.authority_scope === "canonical_scope_invoice_capture" &&
      p.membership_currentness === "as_of_graph" &&
      p.source_currentness === "saved_receiver_heads_only" &&
      p.source_coverage === "unavailable" &&
      p.credit_eligible === false &&
      p.shadow_only === true,
  );
  check(
    p.organization_id === publication.organization_id &&
      p.economic_scope_id === publication.economic_scope_id,
  );
  for (const k of selectors) check(p[k] === publication[k]);
  uuid(p.root_id);
  check(
    ["project", "large_project", "packing_project"].includes(
      p.root_kind as string,
    ),
  );
  check(typeof p.currency === "string" && /^[A-Z]{3}$/.test(p.currency));
  timestamp(p.as_of);
  check(p.as_of === publication.observed_at);
  hash(p.captured_inventory_fingerprint);
  check(typeof p.captured_inventory_matches_current === "boolean");
  integer(p.member_count);
  check(p.member_count <= 1000);
  integer(p.resolved_source_count);
  check(
    p.resolved_source_count <= 10000 &&
      sources.filter((s) => s.mapping_state === "charging").length ===
        p.resolved_source_count,
  );
  for (const k of [
    "known_captured_invoice_cost_minor",
    "confirmed_captured_invoice_cost_minor",
    "preliminary_captured_invoice_cost_minor",
  ]) {
    if (p.resolved_source_count === 0) check(p[k] === null);
    else integer(p[k]);
  }
  for (const k of [
    "remaining_minor",
    "eac_minor",
    "budget_minor",
    "margin_minor",
  ])
    check(p[k] === null);
  const coverage = exact(p.category_coverage, [
    "personnel",
    "supplier",
    "catering",
    "other",
  ]);
  check(Object.values(coverage).every((v) => v === "unavailable"));
  const excluded = array(p.excluded_source_anchors, 10000);
  excluded.forEach(hash);
  same(
    excluded,
    sources
      .filter((s) => s.mapping_state !== "charging")
      .map((s) => s.source_anchor),
  );
  const diagnostics = array(p.diagnostics, 50000);
  for (const value of diagnostics) {
    check(typeof value === "string");
    if (
      diagnosticCodes.includes(value) ||
      /^unavailable_source_policy:[0-9a-f]{64}$/.test(value)
    )
      continue;
    const m =
      /^(?:excluded_source|excluded_scope_source):[0-9a-f]{64}:([a-z_]+)$/.exec(
        value,
      );
    check(m !== null && reasons.includes(m[1]));
  }
  if (p.captured_inventory_matches_current === false)
    check(diagnostics.includes("captured_inventory_changed"));
  return p;
}
export type GrantedScopeRendererResult = Readonly<{
  schema_version: typeof GRANTED_SCOPE_RENDERER_RESULT_SCHEMA;
  destination_raw_body: string;
  destination_body_sha256: string;
  source_publication_fingerprint: string;
}>;
/** Raw immutable shape/integrity only. The result is never disclosure or cost authority. */
export async function renderWholeScopeGrantedProductDestination(
  raw: string,
): Promise<GrantedScopeRendererResult> {
  try {
    check(typeof raw === "string" && raw.length > 0 && raw.length <= 4194304);
    // Existing duplicate-aware/exact-decimal parser snapshots the complete bounded input.
    const input = exact(JSON.parse(wholeScopeProductCanonicalJson(raw)), [
      "schema_version",
      "publication",
      "binding",
      "grant_event",
      "receipt",
    ]);
    check(input.schema_version === GRANTED_SCOPE_RENDERER_INPUT_SCHEMA);
    const p = exact(input.publication, documentKeys),
      b = exact(input.binding, [
        "publication_id",
        "organization_id",
        "economic_scope_id",
        "grant_event_id",
      ]),
      r = exact(input.receipt, receiptKeys);
    check(
      p.schema_version ===
        "operations-whole-scope-granted-product-publication.v2" &&
        p.calculation_version ===
          "operations-whole-scope-invoice-capture-sql.v1" &&
        p.shadow_only === true,
    );
    for (const k of [
      "publication_id",
      "organization_id",
      "economic_scope_id",
      "actor_id",
      "scope_snapshot_id",
      "composition_snapshot_id",
    ])
      uuid(p[k]);
    for (const k of [
      "publication_revision",
      "scope_revision",
      "composition_revision",
    ])
      integer(p[k], true);
    for (const k of [
      "membership_fingerprint",
      "composition_fingerprint",
      "source_evidence_fingerprint",
    ])
      hash(p[k]);
    timestamp(p.observed_at);
    const command = validateWholeScopeGrantedPublicationCommand(p.command);
    same(command, p.command);
    check(
      command.economic_scope_id === p.economic_scope_id &&
        command.expected_publication_revision + 1 === p.publication_revision &&
        command.expected_scope_revision === p.scope_revision &&
        command.expected_membership_fingerprint === p.membership_fingerprint &&
        command.expected_composition_revision === p.composition_revision &&
        command.expected_composition_fingerprint === p.composition_fingerprint,
    );
    const e = await validateWholeScopeProductGrantEvent(input.grant_event),
      g = await wholeScopeProductGrantEventProjection(e);
    same(p.export_grant, g);
    check(
      e.organization_id === p.organization_id &&
        e.economic_scope_id === p.economic_scope_id &&
        e.revision === command.expected_grant_revision,
    );
    for (const k of selectors) check(e[k] === p[k]);
    same(e.full_membership, p.full_membership);
    for (const k of ["publication_id", "organization_id", "economic_scope_id"])
      check(b[k] === p[k]);
    check(b.grant_event_id === e.event_id);
    const c = p.capture as Row;
    check(c !== null && typeof c === "object" && !Array.isArray(c));
    check(
      c.organization_id === p.organization_id &&
        c.economic_scope_id === p.economic_scope_id,
    );
    for (const k of selectors) check(c[k] === p[k]);
    check(c.as_of === p.observed_at);
    check(
      (await wholeScopeProductCaptureFingerprint(canonical(c))) ===
        p.source_evidence_fingerprint,
    );
    // Exact private-to-redacted inventory transformation, not money arithmetic.
    const redacted = array(c.source_inventory, 10000).map((item) => {
      const row = item as Row;
      const copy: Row = {};
      for (const k of Object.keys(row))
        if (k !== "source_organization_id" && k !== "invoice_id")
          copy[k] = row[k];
      return copy;
    });
    same(p.source_manifest, redacted);
    const manifest = validateManifest(p.source_manifest),
      projection = validateProjection(p.projection, p, manifest);
    for (const k of [
      "root_kind",
      "root_id",
      "currency",
      "membership_currentness",
      "source_currentness",
      "captured_inventory_fingerprint",
      "captured_inventory_matches_current",
      "source_coverage",
      "credit_eligible",
      "shadow_only",
    ])
      same(projection[k], c[k]);
    same(projection.category_coverage, c.category_coverage);
    check(projection.member_count === array(c.members, 1000).length);
    const publicationFingerprint = await sha(
      canonical(["operations-whole-scope-granted-product-publication-v2", p]),
    );
    const expectedReceipt = {
      schema_version:
        "operations-whole-scope-granted-product-publication-receipt.v2",
      outcome: "accepted",
      publication_id: p.publication_id,
      publication_revision: p.publication_revision,
      source_publication_fingerprint: publicationFingerprint,
      source_evidence_fingerprint: p.source_evidence_fingerprint,
      grant_event_id: g.event_id,
      grant_revision: g.revision,
      grant_fingerprint: g.fingerprint,
      historical_only: false,
      delivery_state: "blocked_missing_protected_source_export",
      shadow_only: true,
    };
    same(r, expectedReceipt);
    const body = {
      schema_version: "operations-whole-scope-cost-destination.v1",
      delivery_kind: "snapshot",
      source_organization_id: p.organization_id,
      destination_organization_id: g.destination_organization_id,
      economic_scope_id: p.economic_scope_id,
      destination_scope_id: g.destination_scope_id,
      publication_id: p.publication_id,
      publication_revision: p.publication_revision,
      source_publication_fingerprint: publicationFingerprint,
      source_evidence_fingerprint: p.source_evidence_fingerprint,
      scope_snapshot_id: p.scope_snapshot_id,
      scope_revision: p.scope_revision,
      membership_fingerprint: p.membership_fingerprint,
      composition_snapshot_id: p.composition_snapshot_id,
      composition_revision: p.composition_revision,
      composition_fingerprint: p.composition_fingerprint,
      destination_mapping_id: g.destination_mapping_id,
      destination_mapping_revision: g.destination_mapping_revision,
      scope_semantics: "full_canonical_scope",
      calculation_basis: "current_invoice_capture_only",
      projection,
      source_manifest: manifest,
      shadow_only: true,
    };
    const destinationRaw = canonical(body);
    check(
      encoder.encode(destinationRaw).byteLength <=
        GRANTED_SCOPE_RENDERER_BODY_LIMIT,
    );
    return Object.freeze({
      schema_version: GRANTED_SCOPE_RENDERER_RESULT_SCHEMA,
      destination_raw_body: destinationRaw,
      destination_body_sha256: await sha(destinationRaw),
      source_publication_fingerprint: publicationFingerprint,
    });
  } catch {
    invalid();
  }
}
