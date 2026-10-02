/** Source parity only; this does not prove SQL authority, locks or delivery. */
function assert(value: boolean, message: string): void { if (!value) throw new Error(message); }
const root = new URL('../../supabase/migrations/', import.meta.url);
const candidate = await Deno.readTextFile(new URL('20261002125625_operations_catering_held_receipt_eligibility_v1.sql', root));
function definition(source: string, name: string): string {
 const start = source.indexOf(`create function operations_catering_reconciliation_private.${name}(`);
 assert(start >= 0, 'function missing'); const end = source.indexOf('end;$$;', start);
 assert(end >= start, 'function boundary missing'); return source.slice(start, end + 'end;$$;'.length);
}
for (const [file, original, held] of [
 ['20261002101049_operations_catering_reconciliation_admission_v1.sql', 'delivery_eligibility_v1', 'delivery_eligibility_held_v1'],
 ['20261002112625_operations_catering_reconciliation_historical_capture_v1.sql', 'historical_delivered_cursor_v1', 'historical_delivery_eligibility_held_v1'],
]) {
 Deno.test(`full strict saved queue/publication/13-field parity: ${original}`, async () => {
  const prior = definition(await Deno.readTextFile(new URL(file, root)), original);
  const next = definition(candidate, held)
   .replace(`${held}(p_cursor_id uuid,p_scope_hold_id uuid)`, `${original}(p_cursor_id uuid)`)
   .replace(' perform operations_catering_reconciliation_private.require_admission_receipt_scope_v1(p_cursor_id,p_scope_hold_id);\n', '')
   .replace('perform operations_catering_reconciliation_private.require_saved_original_receipt_v1(c.cursor_id,receipt,p_scope_hold_id);', 'perform operations_catering_reconciliation_private.require_verified_original_receipt_v1(c.cursor_id,receipt);');
  assert(next === prior, 'existing strict financial/source/receipt predicate drift');
 });
}
Deno.test('private collector authorizes actual admin before acquiring cache scopes', () => {
 const collector = definition(candidate, 'collect_admission_receipt_scopes_v1');
 assert(collector.indexOf('authorize_scope_admin_v1()') < collector.indexOf('lock_original_receipt_cursor_scopes_v1(p_cursor_id)'), 'permission lock order changed');
 for (const name of ['collect_admission_receipt_scopes_v1', 'require_admission_receipt_scope_v1', 'delivery_eligibility_held_v1', 'historical_delivery_eligibility_held_v1']) {
  const signature = name === 'collect_admission_receipt_scopes_v1' ? 'uuid' : 'uuid,uuid';
  assert(candidate.includes(`revoke all on function operations_catering_reconciliation_private.${name}(${signature}) from public,anon,authenticated,service_role;`), 'private helper exposed');
 }
 assert(!/create\s+(?:or\s+replace\s+)?function\s+public\./i.test(candidate), 'public integration appeared');
 assert(!/create\s+or\s+replace/i.test(candidate), 'existing protocol mutated');
});
