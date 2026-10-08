/** Contract-only alias preview. No authorization, database mutation, pricing or
 * currentness assertion occurs here. A future server must capture both graphs,
 * the canonical head and permanent ownership in ONE coherent database snapshot. */
import {buildProjectScopeMembership, serializeProjectScopeMembership, type EconomicScopeRootKind, type ProjectScopeMembership, type ScopeServerCatalog} from './canonical-project-scope.ts';

export interface ScopeAliasCanonicalContext {
  organization_id:string; economic_scope_id:string; canonical_root_kind:EconomicScopeRootKind;
  canonical_root_id:string; canonical_scope_revision:number; canonical_membership_fingerprint:string;
}
export interface ScopeAliasMemberOwner {
  organization_id:string; member_kind:'source_project'|'local_booking'; member_id:string;
  economic_scope_id:string; first_scope_revision:number;
}
export interface ScopeViewAliasCommand {
  schema_version:'operations-canonical-scope-view-alias.v1'; economic_scope_id:string;
  view_root_kind:EconomicScopeRootKind; view_root_id:string; expected_alias_revision:number;
  expected_canonical_scope_revision:number; expected_canonical_membership_fingerprint:string;
  expected_view_membership_fingerprint:string; expected_catalog_fingerprint:string;
  idempotency_key:string; reason:string;
}
export interface ScopeViewAliasPreview {
  schema_version:'operations-canonical-scope-view-alias-preview.v1';
  integration_state:'contract_only'; required_authority:'live_organization_admin';
  display_scope:'full_canonical_scope'; economic_scope_id:string; canonical_scope_revision:number;
  canonical_membership:ProjectScopeMembership; view_membership:ProjectScopeMembership;
  canonical_membership_fingerprint:string; view_membership_fingerprint:string; catalog_fingerprint:string;
  additional_source_project_ids:string[]; additional_local_booking_ids:string[];
  economic_mapping:'unavailable'; eac_minor:null;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const KINDS=['project','large_project','packing_project'];
function uuid(x:unknown):x is string{return typeof x==='string'&&UUID.test(x);}
function hash(x:unknown):x is string{return typeof x==='string'&&HASH.test(x);}
function positive(x:unknown):x is number{return Number.isSafeInteger(x)&&Number(x)>0;}
function boundedText(x:unknown,max:number):x is string{return typeof x==='string'&&x.length>0&&Array.from(x).length<=max&&x.trim()===x&&!x.includes('\0')&&new TextDecoder().decode(new TextEncoder().encode(x))===x;}
function exact(x:unknown,keys:string[]):x is Record<string,unknown>{return !!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));}
function cmp(a:string,b:string):number{const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];return x.length-y.length;}
function canonical(x:unknown):string{if(x===null||typeof x==='string'||typeof x==='boolean')return JSON.stringify(x);if(typeof x==='number'&&Number.isSafeInteger(x))return String(x);if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort(cmp).map(k=>JSON.stringify(k)+':'+canonical((x as Record<string,unknown>)[k])).join(',')+'}';throw new Error('invalid_alias_canonical_value');}
async function sha(raw:string):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(x=>x.toString(16).padStart(2,'0')).join('');}

export function validateScopeViewAliasCommand(value:unknown):ScopeViewAliasCommand {
  if(!exact(value,['schema_version','economic_scope_id','view_root_kind','view_root_id','expected_alias_revision','expected_canonical_scope_revision','expected_canonical_membership_fingerprint','expected_view_membership_fingerprint','expected_catalog_fingerprint','idempotency_key','reason'])||value.schema_version!=='operations-canonical-scope-view-alias.v1'||!uuid(value.economic_scope_id)||!uuid(value.view_root_id)||!KINDS.includes(value.view_root_kind as string)||!Number.isSafeInteger(value.expected_alias_revision)||Number(value.expected_alias_revision)<0||Number(value.expected_alias_revision)>=Number.MAX_SAFE_INTEGER||!positive(value.expected_canonical_scope_revision)||!hash(value.expected_canonical_membership_fingerprint)||!hash(value.expected_view_membership_fingerprint)||!hash(value.expected_catalog_fingerprint)||!boundedText(value.idempotency_key,256)||!boundedText(value.reason,2000))throw new Error('invalid_scope_view_alias_command');
  return {...value,economic_scope_id:value.economic_scope_id.toLowerCase(),view_root_id:value.view_root_id.toLowerCase()} as unknown as ScopeViewAliasCommand;
}

const ROW_KEYS:Record<string,string[]>={
  projects:['id','organization_id','booking_id','deleted_at'],
  large_projects:['id','organization_id','primary_booking_id','deleted_at'],
  packing_projects:['id','organization_id','booking_id','large_project_id','status'],
  bookings:['id','organization_id','large_project_id'],
  large_project_bookings:['id','organization_id','large_project_id','booking_id'],
  packing_project_bookings:['id','organization_id','packing_id','booking_id'],
};
/** Copy and freeze the full shared catalog synchronously before the first await.
 * UUID columns normalize; legacy booking TEXT and source status remain exact. */
function copyCatalog(value:unknown):ScopeServerCatalog {
  if(!exact(value,[...Object.keys(ROW_KEYS),'allowed_packing_statuses']))throw new Error('invalid_alias_shared_catalog');
  const result:Record<string,unknown>={};
  for(const [table,keys] of Object.entries(ROW_KEYS)){
    const rows=value[table];if(!Array.isArray(rows)||rows.length>10000)throw new Error('invalid_alias_shared_catalog');
    result[table]=rows.map(row=>{
      if(!exact(row,keys))throw new Error('invalid_alias_catalog_row');
      const copied:Record<string,unknown>={};
      for(const key of keys){const v=row[key];const uuidColumn=key==='organization_id'||key==='large_project_id'||key==='packing_id'||(key==='id'&&table!=='bookings');
        if(uuidColumn){if(v===null&&(key==='large_project_id'))copied[key]=null;else{if(!uuid(v))throw new Error('invalid_alias_catalog_uuid');copied[key]=v.toLowerCase();}}
        else {if(v!==null&&!boundedText(v,key==='status'?64:256))throw new Error('invalid_alias_catalog_text');copied[key]=v;}
      }return copied;
    }).sort((a,b)=>cmp(canonical(a),canonical(b)));
  }
  if(!Array.isArray(value.allowed_packing_statuses)||value.allowed_packing_statuses.length>1000||!value.allowed_packing_statuses.every(x=>boundedText(x,64))||new Set(value.allowed_packing_statuses).size!==value.allowed_packing_statuses.length)throw new Error('invalid_alias_packing_policy');
  result.allowed_packing_statuses=[...value.allowed_packing_statuses].sort(cmp);
  return result as unknown as ScopeServerCatalog;
}
function copyContext(value:unknown):ScopeAliasCanonicalContext {
  if(!exact(value,['organization_id','economic_scope_id','canonical_root_kind','canonical_root_id','canonical_scope_revision','canonical_membership_fingerprint'])||!uuid(value.organization_id)||!uuid(value.economic_scope_id)||!uuid(value.canonical_root_id)||!KINDS.includes(value.canonical_root_kind as string)||!positive(value.canonical_scope_revision)||!hash(value.canonical_membership_fingerprint))throw new Error('invalid_alias_canonical_context');
  return {...value,organization_id:value.organization_id.toLowerCase(),economic_scope_id:value.economic_scope_id.toLowerCase(),canonical_root_id:value.canonical_root_id.toLowerCase()} as unknown as ScopeAliasCanonicalContext;
}
function copyOwners(value:unknown,context:ScopeAliasCanonicalContext,membership:ProjectScopeMembership):ScopeAliasMemberOwner[] {
  if(!Array.isArray(value)||value.length>2000)throw new Error('invalid_alias_member_owners');
  const expected=new Set([...membership.source_project_ids.map(id=>'source_project:'+id),...membership.local_booking_ids.map(id=>'local_booking:'+id)]),seen=new Set<string>();
  const result=value.map(row=>{
    if(!exact(row,['organization_id','member_kind','member_id','economic_scope_id','first_scope_revision'])||!uuid(row.organization_id)||!uuid(row.economic_scope_id)||!positive(row.first_scope_revision)||Number(row.first_scope_revision)>context.canonical_scope_revision||(row.member_kind!=='source_project'&&row.member_kind!=='local_booking')||(row.member_kind==='source_project'?!uuid(row.member_id):!boundedText(row.member_id,256)))throw new Error('invalid_alias_member_owner');
    const owner={...row,organization_id:row.organization_id.toLowerCase(),economic_scope_id:row.economic_scope_id.toLowerCase(),member_id:row.member_kind==='source_project'?(row.member_id as string).toLowerCase():row.member_id} as unknown as ScopeAliasMemberOwner;
    const key=owner.member_kind+':'+owner.member_id;
    if(owner.organization_id!==context.organization_id||owner.economic_scope_id!==context.economic_scope_id||!expected.has(key)||seen.has(key))throw new Error('alias_permanent_owner_conflict');
    seen.add(key);return owner;
  });
  if(seen.size!==expected.size)throw new Error('alias_permanent_owner_missing');
  return result.sort((a,b)=>cmp(canonical(a),canonical(b)));
}

/** Caller context/catalog/owners MUST be server-resolved. A successful preview
 * means only graph compatibility; it never grants permission or proves freshness. */
export async function previewScopeViewAlias(contextValue:unknown,viewKind:EconomicScopeRootKind,viewId:string,catalogValue:unknown,ownerValue:unknown):Promise<ScopeViewAliasPreview> {
  const context=copyContext(contextValue),catalog=copyCatalog(catalogValue);
  if(!KINDS.includes(viewKind)||!uuid(viewId))throw new Error('invalid_alias_view_root');
  const viewRoot=viewId.toLowerCase();
  if(viewKind===context.canonical_root_kind&&viewRoot===context.canonical_root_id)throw new Error('alias_redundant_canonical_root');
  // Both builds happen without an await against this exact copied catalog.
  const canonicalMembership=buildProjectScopeMembership(context.organization_id,context.canonical_root_kind,context.canonical_root_id,catalog);
  const viewMembership=buildProjectScopeMembership(context.organization_id,viewKind,viewRoot,catalog);
  const projects=new Set(canonicalMembership.source_project_ids),bookings=new Set(canonicalMembership.local_booking_ids);
  if(viewMembership.source_project_ids.length+viewMembership.local_booking_ids.length===0)throw new Error('alias_empty_view');
  if(viewMembership.source_project_ids.some(id=>!projects.has(id))||viewMembership.local_booking_ids.some(id=>!bookings.has(id)))throw new Error('alias_view_outside_canonical_scope');
  const owners=copyOwners(ownerValue,context,canonicalMembership);
  const canonicalRaw=serializeProjectScopeMembership(canonicalMembership),viewRaw=serializeProjectScopeMembership(viewMembership);
  const catalogRaw='operations-scope-alias-shared-catalog-v1\n'+canonical({context,view_selector:{root_kind:viewKind,root_id:viewRoot},catalog,member_owners:owners});
  const [canonicalHash,viewHash,catalogHash]=await Promise.all([sha(canonicalRaw),sha(viewRaw),sha(catalogRaw)]);
  if(canonicalHash!==context.canonical_membership_fingerprint)throw new Error('alias_canonical_graph_stale');
  const viewProjects=new Set(viewMembership.source_project_ids),viewBookings=new Set(viewMembership.local_booking_ids);
  return {schema_version:'operations-canonical-scope-view-alias-preview.v1',integration_state:'contract_only',required_authority:'live_organization_admin',display_scope:'full_canonical_scope',economic_scope_id:context.economic_scope_id,canonical_scope_revision:context.canonical_scope_revision,canonical_membership:canonicalMembership,view_membership:viewMembership,canonical_membership_fingerprint:canonicalHash,view_membership_fingerprint:viewHash,catalog_fingerprint:catalogHash,additional_source_project_ids:canonicalMembership.source_project_ids.filter(id=>!viewProjects.has(id)),additional_local_booking_ids:canonicalMembership.local_booking_ids.filter(id=>!viewBookings.has(id)),economic_mapping:'unavailable',eac_minor:null};
}

/** Token comparison only. A database implementation still needs live admin
 * checks, permanent view-root reservation, compare-and-swap and atomic capture. */
export function assertScopeViewAliasPreviewMatches(commandValue:unknown,preview:ScopeViewAliasPreview):ScopeViewAliasCommand {
  const command=validateScopeViewAliasCommand(commandValue);
  if(command.economic_scope_id!==preview.economic_scope_id||command.view_root_kind!==preview.view_membership.root_kind||command.view_root_id!==preview.view_membership.root_id||command.expected_canonical_scope_revision!==preview.canonical_scope_revision||command.expected_canonical_membership_fingerprint!==preview.canonical_membership_fingerprint||command.expected_view_membership_fingerprint!==preview.view_membership_fingerprint||command.expected_catalog_fingerprint!==preview.catalog_fingerprint)throw new Error('scope_view_alias_preview_stale');
  return command;
}
