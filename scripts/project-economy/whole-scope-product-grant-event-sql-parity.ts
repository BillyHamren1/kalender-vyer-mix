/** Test-only private actual SQL event vectors; no grant or remote authority. */
import {
  validateWholeScopeProductGrantEvent,
  wholeScopeProductGrantEventBytes,
  wholeScopeProductGrantEventFingerprint,
  wholeScopeProductGrantEventProjection,
} from "../../supabase/functions/_shared/whole-scope-product-grant-event-v1.ts";
import { wholeScopeProductGrantCommandFingerprint } from "../../supabase/functions/_shared/whole-scope-product-grant-command-v1.ts";
const labels = [
  "enabled_successor",
  "first_disabled",
  "recorded_revoke",
  "version_rotation",
];
function check(v: unknown): asserts v {
  if (!v) throw new Error("closed_grant_parity_failure");
}
async function run(): Promise<void> {
  check(Deno.args.length === 1);
  const file = await Deno.open(Deno.args[0], { read: true });
  let owned: Uint8Array;
  try {
    const stat = await file.stat();
    check(stat.isFile && stat.size > 0 && stat.size <= 16777216);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    const chunk = new Uint8Array(65536);
    for (;;) {
      const read = await file.read(chunk);
      if (read === null) break;
      check(read > 0);
      bytes += read;
      check(bytes <= 16777216);
      chunks.push(chunk.slice(0, read));
    }
    owned = new Uint8Array(bytes);
    let offset = 0;
    for (const part of chunks) {
      owned.set(part, offset);
      offset += part.length;
    }
  } finally {
    file.close();
  }
  // Input is a privately captured actual SQL fixture artifact, not a raw endpoint
  // parser or untrusted proof packet. No lexical JSON/number admission is claimed.
  const rows: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(owned),
  );
  check(Array.isArray(rows) && rows.length === labels.length);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    check(row && typeof row === "object" && !Array.isArray(row));
    check(
      Object.keys(row).sort().join(",") ===
        "command_fingerprint,document,fingerprint,label,raw_body",
    );
    check(row.label === labels[i] && typeof row.raw_body === "string");
    const event = await validateWholeScopeProductGrantEvent(row.document);
    check(
      (await wholeScopeProductGrantEventBytes(row.document)) === row.raw_body,
    );
    check(
      (await wholeScopeProductGrantEventFingerprint(row.document)) ===
        row.fingerprint,
    );
    check(
      (await wholeScopeProductGrantCommandFingerprint(event.command)) ===
        row.command_fingerprint,
    );
    const projection = await wholeScopeProductGrantEventProjection(
      row.document,
    );
    check(
      projection.event_id === event.event_id &&
        projection.revision === event.revision &&
        projection.fingerprint === row.fingerprint,
    );
    for (const key of [
      "destination_organization_id",
      "destination_scope_id",
      "destination_mapping_id",
      "destination_mapping_revision",
    ])
      check(projection[key] === event[key]);
    check(
      !("destination_mapping_fingerprint" in projection) &&
        !("authorised" in projection),
    );
  }
  console.log("PASS whole_scope_grant_event_actual_sql_parity4_metadata_only");
}
try {
  await run();
} catch {
  console.error("FAIL whole_scope_grant_event_actual_sql_parity_closed");
  Deno.exit(1);
}
