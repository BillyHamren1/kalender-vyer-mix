/** Exact source preservation; not native lock or delivered-authority evidence. */
function assert(value: boolean, message: string): void { if (!value) throw new Error(message); }
const root = new URL('../../supabase/migrations/', import.meta.url);
const candidate = await Deno.readTextFile(new URL('20261002135138_operations_catering_held_historical_inventory_v1.sql', root));
const baseline = await Deno.readTextFile(new URL('20261002112625_operations_catering_reconciliation_historical_capture_v1.sql', root));
function definition(source: string, name: string): string {
 const start = source.indexOf(`create function operations_catering_reconciliation_private.${name}(`);
 assert(start >= 0, 'function missing'); const end = source.indexOf('end;$$;', start);
 assert(end >= start, 'function boundary missing'); return source.slice(start, end + 'end;$$;'.length);
}
Deno.test('entire historical inventory economics/provenance/hash/lock predicates preserved', () => {
 const normalized = definition(candidate, 'inventory_held_v1')
  .replace('inventory_held_v1(p_source_stream_id text,p_cursor_id uuid,p_cursor_sha256 text,p_receipt_scope_hold_id uuid)', 'inventory_v1(p_source_stream_id text,p_cursor_id uuid,p_cursor_sha256 text)')
  .replace(' perform operations_catering_reconciliation_private.require_current_admission_receipt_scope_v1(p_cursor_id,p_receipt_scope_hold_id);\n', '')
  .replace('historical_delivery_eligibility_held_v1(p_cursor_id,p_receipt_scope_hold_id)', 'historical_delivered_cursor_v1(p_cursor_id)');
 assert(normalized === definition(baseline, 'inventory_v1'), 'frozen inventory predicate drift');
});
Deno.test('full server selection is checked before all subsequent resolver and lock scopes', () => {
 const body = definition(candidate, 'inventory_held_v1').split('begin\n')[1];
 const early = body.indexOf('require_current_admission_receipt_scope_v1');
 assert(body.indexOf('authorize_scope_admin_v1()') < early, 'admin must precede scope check');
 for (const marker of ['resolve_cursor_v1(', 'admission_policies', 'routes where', 'public.projects', 'operations_project_obligation_heads', 'for update;', 'historical_delivery_eligibility_held_v1(']) assert(early < body.indexOf(marker), 'hold check must precede '+marker);
 const guard = definition(candidate, 'require_current_admission_receipt_scope_v1');
 assert(guard.indexOf('require_admission_receipt_scope_v1(') < guard.indexOf('original_receipt_candidates_v1('), 'actor/TX binding must precede selector');
 for (const key of ['cursor_id','cursor_sha256','organization_id','finance_organization_id','candidate_ids','candidate_keys']) assert(guard.includes(`f->${key.endsWith('_ids') || key.endsWith('_keys') ? '' : '>'}'${key}' is distinct from`), 'full selected scope missing '+key);
 assert(!/for\s+(share|update)/i.test(guard), 'early guard must not acquire new key locks');
});
Deno.test('private-only additive slice preserves unavailable public permit authority', () => {
 for (const [name,signature] of [['require_current_admission_receipt_scope_v1','uuid,uuid'],['inventory_held_v1','text,uuid,text,uuid']]) assert(candidate.includes(`revoke all on function operations_catering_reconciliation_private.${name}(${signature}) from public,anon,authenticated,service_role;`), 'private execute exposed');
 assert(!/create\s+or\s+replace|create\s+trigger|grant\s|function\s+public\./i.test(candidate), 'public or existing protocol changed');
 assert(!candidate.includes('resolve_permit_v1('), 'permit integration outside slice');
});
