/** TEST ONLY: private in-memory WASM PostgreSQL rehearsal; never native proof. */
import { readFile, lstat } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { isAbsolute } from "node:path";
import assert from "node:assert/strict";

const baseLabels = [
  "invoice6_missing_policy",
  "invoice6_current_policy",
  "invoice6_coequal_v2",
  "invoice6_newer_v2",
  "invoice6_empty_catalog",
  "invoice6_time_basis",
  "scope5_split_initial",
  "scope5_new_policy",
  "scope5_coequal_v2",
  "scope5_higher_v2",
  "scope5_empty_selection",
  "kernel_empty",
  "kernel_confirmed",
  "kernel_partial",
  "kernel_unknown_baseline",
  "kernel_null_source",
  "kernel_rejected",
  "kernel_unresolved",
  "kernel_missing_policy",
  "kernel_noncharging_time",
  "kernel_noncharging_time_consumes",
  "kernel_credit_before_original",
  "kernel_credit_unresolved",
  "kernel_credit_numeric_reference",
  "kernel_credit_capacity",
  "kernel_two_credit_capacity",
  "kernel_credit_rejected_original",
  "kernel_negative_original",
  "kernel_replacement_overflow",
  "kernel_consumption_overflow",
  "kernel_duplicate_source",
  "kernel_cross_currency",
  "kernel_fraction",
  "kernel_unsafe_input",
  "kernel_aggregate_overflow",
  "kernel_eac_overflow",
  "kernel_ecmascript_whitespace_id",
  "kernel_unicode_id",
  "leaf_unknown_estimate",
  "scope_partial_excluded",
  "scope_aggregate_overflow",
];
const actualCatalogLabels = [
  "actual_catalog_leaf_coequal_v2",
  "actual_catalog_leaf_current_policy",
  "actual_catalog_leaf_empty_catalog",
  "actual_catalog_leaf_missing_policy",
  "actual_catalog_leaf_newer_v2",
  "actual_catalog_leaf_time_basis",
  "actual_catalog_scope_coequal_v2",
  "actual_catalog_scope_empty_selection",
  "actual_catalog_scope_higher_v2",
  "actual_catalog_scope_new_policy",
  "actual_catalog_scope_split_initial",
];
let phase = "arguments";
let db;
try {
  if (process.argv.length !== 5 || process.argv[2] !== "--pglite-supplement")
    throw new Error("closed");
  const vectorPath = process.argv[3],
    modulePath = process.argv[4];
  if (![vectorPath, modulePath].every(isAbsolute)) throw new Error("closed");
  for (const path of [vectorPath, modulePath]) {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("closed");
  }
  const bytes = await readFile(vectorPath);
  if (bytes.length > 8 * 1024 * 1024) throw new Error("closed");
  const catalog = JSON.parse(bytes.toString("utf8"));
  if (
    catalog.schema !== "whole-scope-projection-prototype-vectors.v1" ||
    !Array.isArray(catalog.vectors) ||
    ![
      baseLabels.length,
      baseLabels.length + actualCatalogLabels.length,
    ].includes(catalog.vectors.length) ||
    catalog.ts_only_source_version_denials !== 5
  )
    throw new Error("closed");
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  db = new PGlite();
  phase = "temporary_sql";
  await db.exec(
    await readFile(
      fileURLToPath(
        new URL("./whole-scope-projection-sql-prototype.sql", import.meta.url),
      ),
      "utf8",
    ),
  );
  const requiredLabels = new Set(
    catalog.vectors.length === baseLabels.length
      ? baseLabels
      : [...baseLabels, ...actualCatalogLabels],
  );
  const labels = new Set();
  for (const vector of catalog.vectors) {
    if (
      !vector ||
      Object.keys(vector).sort().join(",") !==
        "error,expected,function,input,label" ||
      typeof vector.label !== "string" ||
      !requiredLabels.has(vector.label) ||
      labels.has(vector.label) ||
      !["obligation", "leaf", "scope"].includes(vector.function) ||
      !(
        vector.error === null ||
        (typeof vector.error === "string" && vector.error.length <= 200)
      )
    )
      throw new Error("closed");
    labels.add(vector.label);
    phase = vector.label;
    let result = null,
      error = null;
    try {
      // Function name comes from the fixed enum, JSON travels as a DB parameter.
      const reply = await db.query(
        `select pg_temp.prototype_${vector.function}($1::jsonb) as result`,
        [JSON.stringify(vector.input)],
      );
      result = reply.rows[0].result;
    } catch (e) {
      error = e.message;
    }
    assert.equal(error, vector.error);
    if (error === null) assert.deepEqual(result, vector.expected);
  }
  assert.equal(labels.size, requiredLabels.size);
  await db.close();
  db = undefined;
  console.log(`whole-scope-projection-pglite-supplement PASS ${labels.size}`);
  console.log("whole-scope-projection-native-postgres NOT_RUN");
} catch {
  if (db) await db.close().catch(() => {});
  // No body, SQL, engine error or credential appears in diagnostics.
  console.error("whole-scope-projection-pglite-supplement FAIL " + phase);
  process.exitCode = 1;
}
