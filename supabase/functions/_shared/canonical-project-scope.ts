/** Membership-only contract. Catalog MUST be populated by complete, authorized
 * server database reads. A hash proves the captured view's integrity, not its
 * source authenticity or economic completeness. No monetary mapping occurs. */
export type EconomicScopeRootKind='project'|'large_project'|'packing_project';
export interface ProjectScopeEnrollmentCommand {schema:'operations-project-scope-enroll.v1';economic_scope_id:string;root_kind:EconomicScopeRootKind;root_id:string;expected_revision:number;expected_membership_fingerprint:string;idempotency_key:string;reason:string;}
export interface ScopeProjectRow {id:string;organization_id:string;booking_id:string|null;deleted_at:string|null;}
export interface ScopeLargeProjectRow {id:string;organization_id:string;primary_booking_id:string|null;deleted_at:string|null;}
export interface ScopePackingRow {id:string;organization_id:string;booking_id:string|null;large_project_id:string|null;status:string;}
export interface ScopeBookingRow {id:string;organization_id:string;large_project_id:string|null;}
export interface ScopeLargeJoinRow {id:string;organization_id:string;large_project_id:string;booking_id:string;}
export interface ScopePackingJoinRow {id:string;organization_id:string;packing_id:string;booking_id:string;}
export interface ScopeServerCatalog {projects:ScopeProjectRow[];large_projects:ScopeLargeProjectRow[];packing_projects:ScopePackingRow[];bookings:ScopeBookingRow[];large_project_bookings:ScopeLargeJoinRow[];packing_project_bookings:ScopePackingJoinRow[];allowed_packing_statuses:string[];}
export interface ScopeRelationship {relation:'project_booking'|'large_project_booking'|'packing_project_booking'|'packing_direct_booking'|'large_parent_booking';relation_id:string;parent_id:string;local_booking_id:string;}
export interface ProjectScopeMembership {schema_version:'operations-project-scope-membership-v1';organization_id:string;root_kind:EconomicScopeRootKind;root_id:string;root_evidence:{status:string|null;primary_local_booking_id:string|null;packing_parent_id:string|null};source_project_ids:string[];local_booking_ids:string[];relationships:ScopeRelationship[];integration_state:'membership_only';economic_mapping:'unavailable';}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const kinds: EconomicScopeRootKind[]=['project','large_project','packing_project'];
function uuid(value:unknown):value is string {return typeof value==='string'&&UUID.test(value);}
function text(value:unknown,max=256):value is string {return typeof value==='string'&&value.length>0&&Array.from(value).length<=max&&value.trim()===value&&!value.includes('\0')&&new TextDecoder().decode(new TextEncoder().encode(value))===value;}
function exact(value:unknown,keys:string[]):value is Record<string,unknown> {return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
function sameUUID(a:string,b:string):boolean{return a.toLowerCase()===b.toLowerCase();}
function compareUTF8(a:string,b:string):number {const left=new TextEncoder().encode(a),right=new TextEncoder().encode(b);for(let i=0;i<Math.min(left.length,right.length);i++)if(left[i]!==right[i])return left[i]-right[i];return left.length-right.length;}
function canonical(value:unknown):string {if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);if(typeof value==='number'&&Number.isSafeInteger(value))return String(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort(compareUTF8).map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}';throw new Error('invalid_scope_canonical_value');}
function uniqueRows<T extends {id:string;organization_id:string}>(rows:T[],idIsUUID:boolean):void {if(!Array.isArray(rows)||rows.length>10000)throw new Error('invalid_scope_catalog');const ids=new Set<string>();for(const row of rows){if(!row||!uuid(row.organization_id)||(idIsUUID?!uuid(row.id):!text(row.id)))throw new Error('invalid_scope_catalog_identity');const id=idIsUUID?row.id.toLowerCase():row.id;if(ids.has(id))throw new Error('duplicate_scope_catalog_identity');ids.add(id);}}

export function validateProjectScopeEnrollment(value:unknown):ProjectScopeEnrollmentCommand {
  if(!exact(value,['schema','economic_scope_id','root_kind','root_id','expected_revision','expected_membership_fingerprint','idempotency_key','reason'])||value.schema!=='operations-project-scope-enroll.v1'||!uuid(value.economic_scope_id)||!uuid(value.root_id)||!kinds.includes(value.root_kind as EconomicScopeRootKind)||!Number.isSafeInteger(value.expected_revision)||Number(value.expected_revision)<0||Number(value.expected_revision)>=Number.MAX_SAFE_INTEGER||typeof value.expected_membership_fingerprint!=='string'||!HASH.test(value.expected_membership_fingerprint)||!text(value.idempotency_key)||!text(value.reason,2000))throw new Error('invalid_project_scope_enrollment');
  return {...value,economic_scope_id:value.economic_scope_id.toLowerCase(),root_id:value.root_id.toLowerCase()} as unknown as ProjectScopeEnrollmentCommand;
}

/** Derives a complete local relationship view only. Explicit Booking-source
 * tenant/UUID enrollment, rate authority and EAC publication remain separate. */
export function buildProjectScopeMembership(organizationId:string,rootKind:EconomicScopeRootKind,rootId:string,catalog:ScopeServerCatalog):ProjectScopeMembership {
  if(!uuid(organizationId)||!uuid(rootId)||!kinds.includes(rootKind)||!catalog)throw new Error('invalid_scope_root');
  uniqueRows(catalog.projects,true);uniqueRows(catalog.large_projects,true);uniqueRows(catalog.packing_projects,true);uniqueRows(catalog.bookings,false);uniqueRows(catalog.large_project_bookings,true);uniqueRows(catalog.packing_project_bookings,true);
  if(!Array.isArray(catalog.allowed_packing_statuses)||!catalog.allowed_packing_statuses.every(x=>text(x,64)))throw new Error('invalid_packing_enrollment_policy');
  const org=organizationId.toLowerCase(),root=rootId.toLowerCase(),bookings=new Map(catalog.bookings.map(x=>[x.id,x]));
  const large=new Map(catalog.large_projects.map(x=>[x.id.toLowerCase(),x]));
  for(const row of catalog.projects){if((row.booking_id!==null&&!text(row.booking_id))||(row.deleted_at!==null&&!text(row.deleted_at)))throw new Error('invalid_scope_project');}
  for(const row of catalog.large_projects){if((row.primary_booking_id!==null&&!text(row.primary_booking_id))||(row.deleted_at!==null&&!text(row.deleted_at)))throw new Error('invalid_scope_large_project');}
  for(const row of catalog.packing_projects){if((row.booking_id!==null&&!text(row.booking_id))||(row.large_project_id!==null&&!uuid(row.large_project_id))||!text(row.status,64))throw new Error('invalid_scope_packing_project');}
  for(const row of catalog.bookings){if(row.large_project_id!==null&&!uuid(row.large_project_id))throw new Error('invalid_scope_booking');}
  for(const row of catalog.large_project_bookings){if(!uuid(row.large_project_id)||!text(row.booking_id))throw new Error('invalid_scope_large_join');}
  for(const row of catalog.packing_project_bookings){if(!uuid(row.packing_id)||!text(row.booking_id))throw new Error('invalid_scope_packing_join');}
  const membership=new Set<string>(),sourceProjects=new Set<string>(),relationships:ScopeRelationship[]=[];
  let rootEvidence:ProjectScopeMembership['root_evidence']={status:null,primary_local_booking_id:null,packing_parent_id:null};
  const addBooking=(id:string)=>{const row=bookings.get(id);if(!row||!sameUUID(row.organization_id,org))throw new Error('scope_booking_missing_or_foreign');membership.add(id);};
  const addRelationship=(relation:ScopeRelationship['relation'],id:string,parent:string,booking:string)=>relationships.push({relation,relation_id:id.toLowerCase(),parent_id:parent.toLowerCase(),local_booking_id:booking});
  if(rootKind==='project'){
    const row=catalog.projects.find(x=>sameUUID(x.id,root));if(!row||!sameUUID(row.organization_id,org)||row.deleted_at!==null)throw new Error('scope_project_missing_or_foreign');
    sourceProjects.add(root);rootEvidence.primary_local_booking_id=row.booking_id;if(row.booking_id!==null){addBooking(row.booking_id);addRelationship('project_booking',row.id,row.id,row.booking_id);}
  }else if(rootKind==='large_project'){
    const row=large.get(root);if(!row||!sameUUID(row.organization_id,org)||row.deleted_at!==null)throw new Error('scope_large_project_missing_or_foreign');
    rootEvidence.primary_local_booking_id=row.primary_booking_id;
    for(const join of catalog.large_project_bookings.filter(x=>sameUUID(x.large_project_id,root))){if(!sameUUID(join.organization_id,org))throw new Error('scope_join_foreign');addBooking(join.booking_id);addRelationship('large_project_booking',join.id,root,join.booking_id);}
    if(row.primary_booking_id!==null&&!membership.has(row.primary_booking_id))throw new Error('scope_primary_booking_not_member');
    if(catalog.bookings.some(x=>x.large_project_id!==null&&sameUUID(x.large_project_id,root)&&!membership.has(x.id)))throw new Error('scope_legacy_mirror_without_master');
  }else{
    const row=catalog.packing_projects.find(x=>sameUUID(x.id,root));if(!row||!sameUUID(row.organization_id,org)||!catalog.allowed_packing_statuses.includes(row.status))throw new Error('scope_packing_missing_or_unenrolled');
    rootEvidence={status:row.status,primary_local_booking_id:row.booking_id,packing_parent_id:row.large_project_id?.toLowerCase()??null};
    const joins=catalog.packing_project_bookings.filter(x=>sameUUID(x.packing_id,root));
    for(const join of joins){if(!sameUUID(join.organization_id,org))throw new Error('scope_join_foreign');addBooking(join.booking_id);addRelationship('packing_project_booking',join.id,root,join.booking_id);}
    if(row.booking_id!==null){if(joins.length>0&&!membership.has(row.booking_id))throw new Error('scope_packing_direct_join_conflict');if(joins.length===0){addBooking(row.booking_id);addRelationship('packing_direct_booking',root,root,row.booking_id);}}
    if(row.large_project_id!==null){const parent=large.get(row.large_project_id.toLowerCase());if(!parent||!sameUUID(parent.organization_id,org)||parent.deleted_at!==null)throw new Error('scope_packing_parent_unavailable');
      const parentMembers=catalog.large_project_bookings.filter(x=>sameUUID(x.large_project_id,parent.id));
      for(const id of membership){if(!parentMembers.some(x=>x.booking_id===id&&sameUUID(x.organization_id,org)))throw new Error('scope_packing_booking_not_parent_member');}}
  }
  for(const id of membership){const parents=new Set<string>(),pairs=new Set<string>();for(const join of catalog.large_project_bookings.filter(x=>x.booking_id===id)){const parent=large.get(join.large_project_id.toLowerCase());if(!parent)throw new Error('scope_master_parent_missing');if(parent.deleted_at===null){if(!sameUUID(parent.organization_id,org)||!sameUUID(join.organization_id,org))throw new Error('scope_master_parent_foreign');if(pairs.has(parent.id.toLowerCase()))throw new Error('duplicate_scope_relationship');pairs.add(parent.id.toLowerCase());parents.add(parent.id.toLowerCase());if(rootKind!=='large_project')addRelationship('large_parent_booking',join.id,parent.id,id);}}if(parents.size>1)throw new Error('scope_ambiguous_live_large_parents');}
  // All current allocation projects referencing these exact local bookings are
  // retained once. Distinct projects sharing a booking are valid source leaves.
  for(const row of catalog.projects){if(row.deleted_at===null&&row.booking_id!==null&&membership.has(row.booking_id)){if(!sameUUID(row.organization_id,org))throw new Error('scope_project_leaf_foreign');sourceProjects.add(row.id.toLowerCase());if(!relationships.some(x=>x.relation==='project_booking'&&x.relation_id===row.id.toLowerCase()))addRelationship('project_booking',row.id,row.id,row.booking_id);}}
  const relationPairs=new Set<string>();for(const edge of relationships){const pair=canonical([edge.relation,edge.parent_id,edge.local_booking_id]);if(relationPairs.has(pair))throw new Error('duplicate_scope_relationship');relationPairs.add(pair);}
  if(membership.size>1000||sourceProjects.size>1000)throw new Error('too_many_scope_members');
  return {schema_version:'operations-project-scope-membership-v1',organization_id:org,root_kind:rootKind,root_id:root,root_evidence:rootEvidence,source_project_ids:[...sourceProjects].sort(compareUTF8),local_booking_ids:[...membership].sort(compareUTF8),relationships:relationships.sort((a,b)=>compareUTF8(canonical(a),canonical(b))),integration_state:'membership_only',economic_mapping:'unavailable'};
}

export function serializeProjectScopeMembership(snapshot:ProjectScopeMembership):string{return canonical(snapshot);}
export async function projectScopeMembershipFingerprint(snapshot:ProjectScopeMembership):Promise<string>{const bytes=new TextEncoder().encode(serializeProjectScopeMembership(snapshot));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
