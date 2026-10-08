/** PRIVATE actual SQL saved documents. Does not fabricate or admit source authority. */
import {
  wholeScopeProductCanonicalJson,
  wholeScopeProductCaptureFingerprint,
} from "../../supabase/functions/_shared/whole-scope-product-source-proof.ts";
import { projectScopeInvoiceKernelEvidence } from "../../supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts";

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
function assert(value: unknown): asserts value {
  if (!value) throw new Error("actual_product_publication_crosswire_failed");
}
/** Input must be the exact three rows emitted by the guarded real SQL fixture. */
export async function verifyWholeScopeProductPublicationSqlVectors(
  raw: string,
): Promise<void> {
  assert(
    typeof raw === "string" &&
      new TextEncoder().encode(raw).byteLength <= 12582912,
  );
  const rows = JSON.parse(raw);
  assert(Array.isArray(rows) && rows.length === 3);
  const streams = new Map<string, number[]>();
  for (const row of rows) {
    assert(
      row &&
        typeof row === "object" &&
        Object.keys(row).sort().join(",") ===
          "document,source_evidence_fingerprint,source_publication_fingerprint",
    );
    const d = row.document;
    assert(
      d &&
        typeof d === "object" &&
        Object.keys(d).length === 22 &&
        documentKeys.every((key) => Object.hasOwn(d, key)),
    );
    assert(
      d.schema_version === "operations-whole-scope-product-publication.v1" &&
        d.calculation_version ===
          "operations-whole-scope-invoice-capture-sql.v1" &&
        d.shadow_only === true &&
        d.export_grant === null,
    );
    assert(
      d.organization_id === d.capture.organization_id &&
        d.economic_scope_id === d.capture.economic_scope_id &&
        d.observed_at === d.capture.as_of &&
        d.projection.as_of === d.capture.as_of,
    );
    const projected = await projectScopeInvoiceKernelEvidence(d.capture);
    assert(
      wholeScopeProductCanonicalJson(JSON.stringify(projected)) ===
        wholeScopeProductCanonicalJson(JSON.stringify(d.projection)),
    );
    const evidenceFingerprint = await wholeScopeProductCaptureFingerprint(
      JSON.stringify(d.capture),
    );
    assert(
      evidenceFingerprint === row.source_evidence_fingerprint &&
        evidenceFingerprint === d.source_evidence_fingerprint,
    );
    const canonical = wholeScopeProductCanonicalJson(
      JSON.stringify(["operations-whole-scope-product-publication-v1", d]),
    );
    const fingerprint = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(canonical),
        ),
      ),
      (v) => v.toString(16).padStart(2, "0"),
    ).join("");
    assert(fingerprint === row.source_publication_fingerprint);
    assert(
      d.projection.eac_minor === null &&
        d.projection.budget_minor === null &&
        d.projection.margin_minor === null &&
        d.projection.remaining_minor === null &&
        d.projection.credit_eligible === false &&
        d.projection.source_coverage === "unavailable",
    );
    assert(
      Array.isArray(d.source_manifest) &&
        d.source_manifest.length === d.capture.source_inventory.length,
    );
    const expected = d.capture.source_inventory.map(
      (item: Record<string, unknown>) => {
        const copy = { ...item };
        delete copy.invoice_id;
        delete copy.source_organization_id;
        return copy;
      },
    );
    assert(
      wholeScopeProductCanonicalJson(JSON.stringify(expected)) ===
        wholeScopeProductCanonicalJson(JSON.stringify(d.source_manifest)),
    );
    assert(
      Number.isSafeInteger(d.publication_revision) &&
        d.publication_revision > 0,
    );
    const versions = streams.get(d.economic_scope_id) ?? [];
    versions.push(d.publication_revision);
    streams.set(d.economic_scope_id, versions);
  }
  assert(
    streams.size === 2 &&
      Array.from(streams.values())
        .map((v) => v.join(","))
        .sort()
        .join("|") === "1|1,2",
  );
}
if (import.meta.main) {
  if (Deno.args.length !== 1 || !Deno.args[0].startsWith("/"))
    throw new Error("exact_private_vector_path_required");
  const info = await Deno.lstat(Deno.args[0]);
  if (!info.isFile || info.isSymlink || info.size > 12582912)
    throw new Error("bounded_private_regular_catalog_required");
  await verifyWholeScopeProductPublicationSqlVectors(
    await Deno.readTextFile(Deno.args[0]),
  );
  console.log(
    "operations-whole-scope-product-publication SQL TS crosswire3 PASS",
  );
}
