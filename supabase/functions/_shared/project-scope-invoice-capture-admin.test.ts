import { describe, it, expect } from 'vitest';
import { scopeInvoiceInventoryFingerprint } from './project-scope-invoice-kernel-evidence.ts';
import { validateScopeInvoiceCaptureAdminRequest, validateScopeInvoiceCaptureAdminEvidence } from './project-scope-invoice-capture-admin.ts';

const org='11111111-1111-4111-8111-111111111111',root='cccccccc-cccc-4ccc-8ccc-cccccccccccc',snapshot='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const request=()=>({schema_version:'operations-scope-invoice-capture-admin-read.v1' as const,root_kind:'large_project' as const,root_id:root,expected_composition_snapshot_id:snapshot});
async function evidence(){return {schema_version:'operations-scope-invoice-capture-admin-evidence.v1',authority_scope:'canonical_scope_invoice_capture',evidence:{schema_version:'operations-scope-invoice-kernel-evidence.v1',organization_id:org,economic_scope_id:'90909090-9090-4909-8909-909090909090',scope_snapshot_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',scope_revision:1,membership_fingerprint:'a'.repeat(64),composition_snapshot_id:snapshot,composition_revision:1,composition_fingerprint:'b'.repeat(64),root_kind:'large_project',root_id:root,currency:'SEK',membership_currentness:'as_of_graph',source_currentness:'saved_receiver_heads_only',captured_inventory_matches_current:true,captured_inventory_fingerprint:await scopeInvoiceInventoryFingerprint([]),as_of:'2026-10-02T00:00:00Z',members:[],source_inventory:[],saved_source_references:[],diagnostics:[],category_coverage:{personnel:'unavailable',supplier:'unavailable',catering:'unavailable',other:'unavailable'},source_coverage:'unavailable',credit_eligible:false,remaining_minor:null,eac_minor:null,budget_minor:null,shadow_only:true}};}
describe('authenticated scope capture contract',()=>{
 it('accepts only the exact displayed composition token and copies unknowns unchanged',async()=>{
  const e=await evidence();expect(await validateScopeInvoiceCaptureAdminEvidence(e,org,request())).toBe(e);
  expect(validateScopeInvoiceCaptureAdminRequest({...request(),root_id:root.toUpperCase()})).toBeTruthy();
  expect(e.evidence.eac_minor).toBeNull();expect(e.evidence.members).toEqual([]);
 });
 it('rejects request actors, caller organizations, unknown purpose and coerced identities',()=>{
  for(const r of [{...request(),organization_id:org},{...request(),actor_id:org},{...request(),schema_version:'operations-scope-invoice-kernel-read.v1'},{...request(),root_id:[root]},{...request(),root_kind:null}])expect(()=>validateScopeInvoiceCaptureAdminRequest(r)).toThrow();
 });
 it('rejects foreign organization/root/composition and wrong envelope purpose',async()=>{
  const e=await evidence();
  for(const value of [{...e,schema_version:'operations-scope-obligation-drilldown.v1'},{...e,authority_scope:'local_project_only'},{...e,actor_id:org},{...e,evidence:{...e.evidence,organization_id:snapshot}},{...e,evidence:{...e.evidence,root_id:snapshot}},{...e,evidence:{...e.evidence,composition_snapshot_id:root}}])await expect(validateScopeInvoiceCaptureAdminEvidence(value,org,request())).rejects.toThrow();
 });
 it('delegates all source integrity/coverage/calendar checks to the frozen validator',async()=>{
  const e=await evidence();for(const patch of [{eac_minor:0},{source_coverage:'complete'},{as_of:'2026-02-30T00:00:00Z'},{captured_inventory_fingerprint:'f'.repeat(64)}])await expect(validateScopeInvoiceCaptureAdminEvidence({...e,evidence:{...e.evidence,...patch}},org,request())).rejects.toThrow();
 });
 it('rejects oversized response without truncating copied diagnostics',async()=>{
  const e=await evidence();e.evidence.diagnostics=['x'.repeat(262144)];await expect(validateScopeInvoiceCaptureAdminEvidence(e,org,request())).rejects.toThrow();
 });
});
