// TEST ONLY: pure fixed controller contract. No executor, env, network or caller SQL.
// Root integration remains blocked until genuine product/native admission and closure review.
import { Buffer } from 'node:buffer';
export const SCOPE_INVOICE_MOUNTED_CONTROL_PURPOSE =
  "operations-scope-invoice-mounted-v1";
export const SCOPE_INVOICE_MOUNTED_STATE_PATH =
  "/scope-invoice-mounted-v1/state";
export const SCOPE_INVOICE_MOUNTED_STATE_SQL =
  "scripts/project-economy/operations-scope-invoice-mounted-v1-state.sql";
export const scopeInvoiceMountedV1FixtureGuard = `
if current_database()<>'eventflow_project_evidence_http_runtime' then raise exception 'wrong_isolated_database' using errcode='42501';end if;
if not exists(select 1 from auth.users where id='00000000-0000-4000-8000-000000000199')
or not exists(select 1 from public.profiles where user_id='00000000-0000-4000-8000-000000000199' and organization_id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000099'))
or not exists(select 1 from public.projects where id='00000000-0000-4000-8000-000000001017' and organization_id='00000000-0000-4000-8000-000000000001' and booking_id is null)
or not exists(select 1 from public.project_purchases where id='00000000-0000-4000-8000-000000001030' and organization_id='00000000-0000-4000-8000-000000000001' and project_id='00000000-0000-4000-8000-000000001017')
then raise exception 'exact_scope_invoice_mounted_fixture_required' using errcode='55000';end if;`;
// Root's existing bounded transaction wrapper MUST check ROW_COUNT=1 after each literal.
// No financial gate, head, source, provider, amount or arbitrary identity mutation is exposed.
export const scopeInvoiceMountedV1Mutations = Object.freeze({
  "scope-invoice-mounted-v1/move-admin-org": `
if not exists(select 1 from public.profiles where user_id='00000000-0000-4000-8000-000000000093' and organization_id='00000000-0000-4000-8000-000000000099') then raise exception 'exact_foreign_fixture_required' using errcode='55000';end if;
update public.profiles set organization_id='00000000-0000-4000-8000-000000000099' where user_id='00000000-0000-4000-8000-000000000199' and organization_id='00000000-0000-4000-8000-000000000001';`,
  "scope-invoice-mounted-v1/restore-admin-org": `update public.profiles set organization_id='00000000-0000-4000-8000-000000000001' where user_id='00000000-0000-4000-8000-000000000199' and organization_id='00000000-0000-4000-8000-000000000099';`,
  "scope-invoice-mounted-v1/revoke-admin": `delete from public.user_roles where user_id='00000000-0000-4000-8000-000000000199' and organization_id='00000000-0000-4000-8000-000000000001' and role='admin';`,
});
export function scopeInvoiceMountedV1ControlOperation(method, path, rawBody) {
  if (
    method === "GET" &&
    path === SCOPE_INVOICE_MOUNTED_STATE_PATH &&
    (rawBody === undefined || rawBody === "")
  )
    return Object.freeze({
      kind: "state",
      sqlPath: SCOPE_INVOICE_MOUNTED_STATE_SQL,
    });
  const key =
    typeof path === "string" && path.startsWith("/") ? path.slice(1) : "";
  if (
    method !== "POST" ||
    !Object.hasOwn(scopeInvoiceMountedV1Mutations, key) ||
    typeof rawBody !== "string" ||
    Buffer.byteLength(rawBody) > 1024
  )
    throw new Error("scope invoice mounted control boundary");
  const body = JSON.parse(rawBody);
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    body.fixture !== SCOPE_INVOICE_MOUNTED_CONTROL_PURPOSE
  )
    throw new Error("scope invoice mounted control boundary");
  return Object.freeze({ kind: "mutation", operation: key });
}
