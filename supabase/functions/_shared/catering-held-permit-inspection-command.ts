/** Inspection encoding only: no receipt authority, permit storage, signing or admission. */
import { parseReconciliationJson, reconciliationRawHash } from "./catering-reconciliation-contract.ts";
const keys = ["schema_version","source_stream_id","expected_publication_revision","expected_allocation_revision","expected_event_id","expected_observation_id","expected_mapping_id","finance_cursor_id","finance_cursor_sha256","preview_sha256","idempotency_key","reason"] as const;
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const uuidPattern = new RegExp("^"+uuid+"$");
function fail(): never { throw new Error("catering_held_inspection_command_invalid"); }
export function encodeHeldPermitInspectionCommand(raw: string): string {
  const value = parseReconciliationJson(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const p = value as Record<string,unknown>;
  if (Object.keys(p).length !== keys.length || keys.some(k=>!Object.hasOwn(p,k))) fail();
  if (p["schema_version"] !== "operations-catering-reconciliation-command.v1" || typeof p["source_stream_id"] !== "string" || !new RegExp("^catering:"+uuid+":"+uuid+"$").test(p["source_stream_id"])) fail();
  for (const k of ["expected_event_id","expected_observation_id","expected_mapping_id","finance_cursor_id"]) if (typeof p[k] !== "string" || !uuidPattern.test(p[k])) fail();
  for (const k of ["expected_publication_revision","expected_allocation_revision"]) if (typeof p[k] !== "number" || !Number.isSafeInteger(p[k]) || (p[k] as number) < 1) fail();
  for (const k of ["finance_cursor_sha256","preview_sha256"]) if (typeof p[k] !== "string" || !/^[0-9a-f]{64}$/.test(p[k])) fail();
  for (const k of ["reason","idempotency_key"]) {
    const text = p[k]; if (typeof text !== "string" || text.trim() !== text) fail();
    const length = Array.from(text).length;
    if (length < (k === "reason" ? 3 : 12) || length > (k === "reason" ? 1000 : 200)) fail();
  }
  return "{"+[...keys].sort().map(k=>JSON.stringify(k)+":"+JSON.stringify(p[k])).join(",")+"}";
}
/** Plain existing canonical command SHA; deliberately no ninth reconciliation domain. */
export function heldPermitInspectionCommandHash(raw: string): Promise<string> {
  return reconciliationRawHash(encodeHeldPermitInspectionCommand(raw));
}
