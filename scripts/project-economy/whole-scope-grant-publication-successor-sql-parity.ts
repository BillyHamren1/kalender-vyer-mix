/** Private actual SQL evidence only. No source admission, authorization or transport. */
import {
  wholeScopeGrantedPublicationCommandBytes,
  wholeScopeGrantedPublicationCommandFingerprint,
} from "../../supabase/functions/_shared/whole-scope-grant-publication-successor-command-v2.ts";
import {
  wholeScopeProductCanonicalJson,
  wholeScopeProductCaptureFingerprint,
} from "../../supabase/functions/_shared/whole-scope-product-source-proof.ts";
import {
  wholeScopeProductGrantEventBytes,
  wholeScopeProductGrantEventFingerprint,
  wholeScopeProductGrantEventProjection,
} from "../../supabase/functions/_shared/whole-scope-product-grant-event-v1.ts";
import { projectScopeInvoiceKernelEvidence } from "../../supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts";

function check(value: unknown): asserts value {
  if (!value) throw new Error("actual_successor_crosswire_failed");
}
function canonical(value: unknown): string {
  return wholeScopeProductCanonicalJson(JSON.stringify(value));
}
async function fingerprint(value: unknown): Promise<string> {
  const owned = new TextEncoder().encode(canonical(value));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", owned));
  return Array.from(digest, (x) => x.toString(16).padStart(2, "0")).join("");
}
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
].sort();
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
].sort();

export async function verifyGrantedPublicationSqlVectors(
  raw: string,
): Promise<void> {
  try {
    check(typeof raw === "string" && raw.length <= 12582912);
    check(new TextEncoder().encode(raw).byteLength <= 12582912);
    const rows = JSON.parse(raw);
    check(Array.isArray(rows) && rows.length === 2);
    check(
      rows.map((row) => row.label).join(",") === "first_granted,second_granted",
    );
    for (const row of rows) {
      check(
        Object.keys(row).sort().join(",") ===
          "command_fingerprint,document,grant_event,grant_fingerprint,grant_raw_body,label,publication_fingerprint,receipt",
      );
      const first = row.label === "first_granted";
      const d = row.document;
      check(d && Object.keys(d).sort().join(",") === documentKeys.join(","));
      check(
        d.schema_version ===
          "operations-whole-scope-granted-product-publication.v2" &&
          d.calculation_version ===
            "operations-whole-scope-invoice-capture-sql.v1" &&
          d.shadow_only === true,
      );
      check(
        d.publication_revision === (first ? 2 : 4) &&
          d.command.expected_publication_revision === (first ? 1 : 3) &&
          d.command.expected_grant_revision === (first ? 1 : 2) &&
          d.export_grant.revision === (first ? 1 : 2),
      );
      check(
        wholeScopeGrantedPublicationCommandBytes(d.command) ===
          canonical(d.command),
      );
      check(
        (await wholeScopeGrantedPublicationCommandFingerprint(d.command)) ===
          row.command_fingerprint,
      );
      check(
        (await wholeScopeProductGrantEventBytes(row.grant_event)) ===
          row.grant_raw_body,
      );
      check(
        (await wholeScopeProductGrantEventFingerprint(row.grant_event)) ===
          row.grant_fingerprint,
      );
      check(
        canonical(
          await wholeScopeProductGrantEventProjection(row.grant_event),
        ) === canonical(d.export_grant),
      );
      check(
        row.grant_event.enabled === true &&
          d.actor_id !== row.grant_event.actor_id,
      );
      for (const key of [
        "organization_id",
        "economic_scope_id",
        "scope_snapshot_id",
        "scope_revision",
        "membership_fingerprint",
        "composition_snapshot_id",
        "composition_revision",
        "composition_fingerprint",
        "full_membership",
      ])
        check(canonical(d[key]) === canonical(row.grant_event[key]));
      check(
        d.observed_at === d.capture.as_of &&
          d.projection.as_of === d.capture.as_of &&
          d.organization_id === d.capture.organization_id &&
          d.economic_scope_id === d.capture.economic_scope_id,
      );
      check(
        canonical(await projectScopeInvoiceKernelEvidence(d.capture)) ===
          canonical(d.projection),
      );
      check(
        (await wholeScopeProductCaptureFingerprint(
          JSON.stringify(d.capture),
        )) === d.source_evidence_fingerprint,
      );
      check(
        (await fingerprint([
          "operations-whole-scope-granted-product-publication-v2",
          d,
        ])) === row.publication_fingerprint,
      );
      const manifest = d.capture.source_inventory.map(
        (item: Record<string, unknown>) => {
          const copy = { ...item };
          delete copy.source_organization_id;
          delete copy.invoice_id;
          return copy;
        },
      );
      check(canonical(manifest) === canonical(d.source_manifest));
      for (const field of [
        "eac_minor",
        "budget_minor",
        "margin_minor",
        "remaining_minor",
      ])
        check(d.projection[field] === null);
      check(
        d.projection.source_coverage === "unavailable" &&
          d.projection.credit_eligible === false,
      );
      const r = row.receipt;
      check(r && Object.keys(r).sort().join(",") === receiptKeys.join(","));
      check(
        r.schema_version ===
          "operations-whole-scope-granted-product-publication-receipt.v2" &&
          r.outcome === "accepted" &&
          r.historical_only === false &&
          r.shadow_only === true &&
          r.delivery_state === "blocked_missing_protected_source_export",
      );
      check(
        r.publication_id === d.publication_id &&
          r.publication_revision === d.publication_revision &&
          r.source_publication_fingerprint === row.publication_fingerprint &&
          r.source_evidence_fingerprint === d.source_evidence_fingerprint &&
          r.grant_event_id === d.export_grant.event_id &&
          r.grant_revision === d.export_grant.revision &&
          r.grant_fingerprint === row.grant_fingerprint,
      );
    }
  } catch {
    throw new Error("actual_successor_crosswire_failed");
  }
}
const privateLimit = 12582912;
function sameFile(a: Deno.FileInfo, b: Deno.FileInfo): boolean {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.uid === b.uid &&
    a.mode === b.mode &&
    a.nlink === b.nlink &&
    a.size === b.size &&
    a.mtime?.getTime() === b.mtime?.getTime() &&
    a.ctime?.getTime() === b.ctime?.getTime()
  );
}
function privateFile(info: Deno.FileInfo): void {
  check(
    info.isFile &&
      !info.isSymlink &&
      info.uid === Deno.uid() &&
      info.mode !== null &&
      (info.mode & 0o7777) === 0o600 &&
      info.nlink === 1 &&
      info.size > 0 &&
      info.size <= privateLimit,
  );
}
/** Bounded FD read; the CLI accepts only an owned private source namespace. */
export async function readGrantedPublicationSqlVectors(
  path: string,
): Promise<string> {
  let file: Deno.FsFile | undefined;
  const deadline = performance.now() + 15000;
  try {
    check(
      /^\/tmp\/whole-scope-grant-publication-successor-private-[A-Za-z0-9_-]{8,64}\/sql-vectors\.json$/.test(
        path,
      ),
    );
    const parent = path.slice(0, path.lastIndexOf("/"));
    const parentBefore = await Deno.lstat(parent);
    check(
      parentBefore.isDirectory &&
        !parentBefore.isSymlink &&
        parentBefore.uid === Deno.uid() &&
        parentBefore.mode !== null &&
        (parentBefore.mode & 0o7777) === 0o700 &&
        (await Deno.realPath(parent)) === parent,
    );
    check(performance.now() < deadline);
    const before = await Deno.lstat(path);
    privateFile(before);
    check(performance.now() < deadline);
    // O_RDWR cannot wait for a FIFO writer after a hostile path replacement.
    // The acquired FD is checked as regular before reading; no write is performed.
    file = await Deno.open(path, { read: true, write: true });
    check(performance.now() < deadline);
    const opened = await file.stat();
    privateFile(opened);
    check(sameFile(before, opened));
    check(performance.now() < deadline);
    const buffer = new Uint8Array(16384);
    const chunks: Uint8Array[] = [];
    let total = 0;
    let ended = false;
    for (let count = 0; count < 770; count++) {
      check(performance.now() < deadline);
      const length = await file.read(buffer);
      check(performance.now() < deadline);
      if (length === null) {
        ended = true;
        break;
      }
      check(length > 0 && total + length <= privateLimit);
      total += length;
      chunks.push(buffer.slice(0, length));
    }
    check(ended && total === before.size);
    const after = await file.stat();
    const pathAfter = await Deno.lstat(path);
    const parentAfter = await Deno.lstat(parent);
    privateFile(after);
    privateFile(pathAfter);
    check(
      sameFile(before, after) &&
        sameFile(before, pathAfter) &&
        sameFile(parentBefore, parentAfter) &&
        (await Deno.realPath(parent)) === parent,
    );
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    check(performance.now() < deadline);
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    check(performance.now() < deadline);
    return raw;
  } catch {
    throw new Error("actual_successor_crosswire_failed");
  } finally {
    try {
      file?.close();
    } catch {
      throw new Error("actual_successor_crosswire_failed");
    }
  }
}
if (import.meta.main) {
  try {
    check(Deno.args.length === 1);
    await verifyGrantedPublicationSqlVectors(
      await readGrantedPublicationSqlVectors(Deno.args[0]),
    );
    console.log(
      "actual_successor_crosswire PASS saved_document_grant_projection_receipt",
    );
  } catch {
    throw new Error("actual_successor_crosswire_failed");
  }
}
