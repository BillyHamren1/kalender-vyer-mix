/** Canonical project supplier/transport adapters. Caller must authorize actor + claim its command receipt first. */
export type WorkspaceSupplierCommand =
  | { type: 'supplier.create_and_link'; name: string; email?: string; phone?: string; serviceType?: string; quotedPrice?: number; deliveryDate?: string; notes?: string }
  | { type: 'supplier.registry.create'; name: string; email?: string; phone?: string; contactName?: string }
  | { type: 'supplier.link.add'; supplierId: string; contactId?: string | null; serviceType?: string | null; notes?: string | null; quotedPrice?: number; deliveryDate?: string }
  | { type: 'supplier.request.send'; linkId: string; message: string; subject?: string; expectedRecipientEmail: string }
  | { type: 'transport.create'; transportType: 'internal' | 'delivery' | 'pickup'; transportDate: string; transportTime?: string; supplierId?: string; contactId?: string; pickupAddress?: string; destinationAddress?: string; vehicleSize?: string; cargoDescription?: string; cargoWeightKg?: number; cargoVolumeM3?: number; notes?: string; includeReturn?: boolean; returnDate?: string; returnTime?: string }
  | { type: 'transport.request.send'; assignmentIds: string[]; subject?: string; message?: string; referencePerson?: string; expectedRecipientEmail: string };
export interface WorkspaceSupplierContext { admin: any; organizationId: string; projectId: string; localActor: string }
export interface RegistrySupplier { id: string; name: string; organization_id?: string; email?: string | null; contacts?: { id: string; name?: string; email?: string | null }[]; [key: string]: any }
export interface WorkspaceSupplierDependencies {
  registryWrite?: (organizationId: string, body: Record<string,unknown>) => Promise<RegistrySupplier>;
  registry: (organizationId: string, supplierId: string) => Promise<RegistrySupplier>;
  invokeOwner: (name: string, body: Record<string, unknown>) => Promise<any>;
}
export class WorkspaceSupplierError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
const fail = (code: string, status = 400): never => { throw new WorkspaceSupplierError(code, status); };
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text = (v: unknown, max = 10000) => typeof v === 'string' && v.length <= max;
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
const optionalTime = (v: unknown) => v === undefined || v === '' || (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v));
const optionalText = (v: unknown, max = 10000) => v === undefined || v === null || text(v, max);
const keys: Record<string, string[]> = {
  'supplier.create_and_link':['type','name','email','phone','serviceType','quotedPrice','deliveryDate','notes'],
  'supplier.registry.create':['type','name','email','phone','contactName'],
  'supplier.link.add': ['type','supplierId','contactId','serviceType','notes','quotedPrice','deliveryDate'],
  'supplier.request.send': ['type','linkId','message','subject','expectedRecipientEmail'],
  'transport.create': ['type','transportType','transportDate','transportTime','supplierId','contactId','pickupAddress','destinationAddress','vehicleSize','cargoDescription','cargoWeightKg','cargoVolumeM3','notes','includeReturn','returnDate','returnTime'],
  'transport.request.send': ['type','assignmentIds','subject','message','referencePerson','expectedRecipientEmail'],
};
export function validateWorkspaceSupplierCommand(value: unknown): value is WorkspaceSupplierCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const c = value as Record<string, any>;
  if (typeof c.type !== 'string' || !Object.prototype.hasOwnProperty.call(keys, c.type) || Object.keys(c).some(k => !keys[c.type].includes(k))) return false;
  if (!['subject','message','notes','serviceType','pickupAddress','destinationAddress','vehicleSize','cargoDescription','referencePerson'].every(k => optionalText(c[k], k === 'subject' ? 300 : 10000))) return false;
  if (c.type.endsWith('.request.send') && (!text(c.expectedRecipientEmail, 320) || !/^[^\s@]+@[^\s@]+$/.test(c.expectedRecipientEmail))) return false;
  if(c.quotedPrice !== undefined && (typeof c.quotedPrice !== 'number' || !Number.isFinite(c.quotedPrice) || c.quotedPrice < 0 || c.quotedPrice > 1e10)) return false;
  if(c.deliveryDate !== undefined && !date(c.deliveryDate)) return false;
  if(c.type === 'supplier.registry.create' || c.type === 'supplier.create_and_link') return text(c.name,300) && !!c.name.trim() && optionalText(c.phone,100) && optionalText(c.contactName,300) && (c.email === undefined || c.email === '' || (text(c.email,320) && /^[^\s@]+@[^\s@]+$/.test(c.email)));
  if (c.type === 'supplier.link.add') return uuid(c.supplierId) && (!c.contactId || uuid(c.contactId));
  if (c.type === 'supplier.request.send') return uuid(c.linkId) && text(c.message) && !!c.message.trim();
  if (c.type === 'transport.request.send') return Array.isArray(c.assignmentIds) && c.assignmentIds.length > 0 && c.assignmentIds.length <= 2 && c.assignmentIds.every(uuid) && new Set(c.assignmentIds).size === c.assignmentIds.length;
  return ['internal','delivery','pickup'].includes(c.transportType) && date(c.transportDate) && optionalTime(c.transportTime) &&
    (c.includeReturn === undefined || typeof c.includeReturn === 'boolean') &&
    (c.includeReturn ? c.transportType === 'delivery' && date(c.returnDate) && optionalTime(c.returnTime) : c.returnDate === undefined && c.returnTime === undefined) &&
    (c.transportType === 'internal' ? !c.supplierId && !c.contactId : uuid(c.supplierId) && (!c.contactId || uuid(c.contactId))) &&
    ['cargoWeightKg','cargoVolumeM3'].every(k => c[k] === undefined || (typeof c[k] === 'number' && Number.isFinite(c[k]) && c[k] >= 0));
}
function dependencies(ctx: WorkspaceSupplierContext): WorkspaceSupplierDependencies {
  return {
    registry: readWorkspaceRegistrySupplier,
    registryWrite: async (org,body) => validateRegistrySupplier(await readWorkspaceRegistry(org,body),org),
    async invokeOwner(name, body) {
      const { data, error } = await ctx.admin.functions.invoke(name, { body });
      if (error || data?.error || data?.success === false) fail('owner_action_uncertain', 502);
      return data;
    },
  };
}
async function one(query: any, code: string) {
  const {data,error} = await query.maybeSingle();
  if (error) fail('workspace_read_failed',502);
  if (!data) fail(code,404);
  return data;
}
export async function executeWorkspaceSupplierCommand(ctx: WorkspaceSupplierContext, command: WorkspaceSupplierCommand, deps = dependencies(ctx)): Promise<Record<string, unknown>> {
  if (!validateWorkspaceSupplierCommand(command)) fail('invalid_command');
  if (!uuid(ctx.organizationId) || !uuid(ctx.projectId) || !uuid(ctx.localActor)) fail('unauthorized',403);
  const scoped = (table: string) => ctx.admin.from(table).select('*').eq('organization_id',ctx.organizationId);
  const project = await one(scoped('projects').eq('id',ctx.projectId),'project_not_found');
  const supplier = async (id: string, contactId?: string | null) => {
    const s = await deps.registry(ctx.organizationId,id);
    if (s.id !== id || (s.organization_id && s.organization_id !== ctx.organizationId) || (contactId && !s.contacts?.some(c => c.id === contactId))) fail('supplier_contact_not_found',404);
    return s;
  };
  if(command.type === 'supplier.registry.create' || command.type === 'supplier.create_and_link') {
    if(!deps.registryWrite) fail('supplier_registry_unavailable',503);
    let created=validateRegistrySupplier(await deps.registryWrite(ctx.organizationId,{action:'create_supplier',payload:{name:command.name.trim(),email:command.email?.trim() || undefined,phone:command.phone?.trim() || undefined}}),ctx.organizationId);
    let contactId:string|null=null;
    if(command.type==='supplier.registry.create' && command.contactName?.trim()) {
      const withContact=validateRegistrySupplier(await deps.registryWrite(ctx.organizationId,{action:'create_supplier_contact',supplier_id:created.id,payload:{name:command.contactName.trim(),email:command.email?.trim() || undefined,phone:command.phone?.trim() || undefined,is_primary:true}}),ctx.organizationId);
      if(withContact.id!==created.id) fail('supplier_registry_invalid',502);
      created=withContact;
      contactId=created.primary_contact?.id || null;
      if(!contactId || !created.contacts?.some(c=>c.id===contactId)) fail('supplier_contact_not_found',502);
    }
    const {error:cacheError}=await ctx.admin.from('suppliers').upsert(workspaceSupplierCacheRow(created,ctx.organizationId),{onConflict:'organization_id,external_id'});
    if(cacheError) fail('supplier_cache_write_failed',502);
    if(command.type==='supplier.registry.create') return {persisted:true,supplier:created,contactId};
    const {data,error}=await ctx.admin.from('project_supplier_links').insert({organization_id:ctx.organizationId,project_id:ctx.projectId,supplier_id:created.id,service_type:command.serviceType || null,quoted_price:command.quotedPrice ?? null,delivery_date:command.deliveryDate || null,notes:command.notes || null,status:'draft'}).select('id').single();
    if(error || !data) fail('supplier_link_write_failed',502);
    return {persisted:true,linkId:data.id,supplier:created};
  }
  if (command.type === 'supplier.link.add') {
    await supplier(command.supplierId,command.contactId);
    const {data,error} = await ctx.admin.from('project_supplier_links').insert({organization_id:ctx.organizationId,project_id:ctx.projectId,supplier_id:command.supplierId,contact_id:command.contactId || null,service_type:command.serviceType || null,notes:command.notes || null,quoted_price:command.quotedPrice ?? null,delivery_date:command.deliveryDate || null,status:'draft'}).select('id').single();
    if (error || !data) fail('supplier_link_write_failed',502);
    return {persisted:true,linkId:data.id};
  }
  if (command.type === 'supplier.request.send') {
    const link = await one(scoped('project_supplier_links').eq('project_id',ctx.projectId).eq('id',command.linkId),'supplier_link_not_found');
    const canonical = await supplier(link.supplier_id,link.contact_id);
    const recipient = workspaceSupplierRecipient(canonical, link.contact_id);
    if (recipient.email.toLowerCase() !== command.expectedRecipientEmail.toLowerCase()) fail('recipient_changed',409);
    const result = await deps.invokeOwner('send-supplier-request',{project_supplier_link_id:link.id,message:command.message,subject:command.subject || null,expected_recipient_email:command.expectedRecipientEmail});
    if(result?.success !== true || !result.thread_id) fail('owner_action_uncertain',502);
    return {persisted:true,threadId:result.thread_id,delivery:'sent'};
  }
  if (!project.booking_id) fail('booking_required',409);
  await one(scoped('bookings').eq('id',project.booking_id),'booking_not_found');
  if (command.type === 'transport.create') {
    let localSupplierId: string | null = null;
    if (command.supplierId) {
      const canonical = await supplier(command.supplierId,command.contactId);
      // Same cache projection as supplier-registry-proxy; refresh only during this explicit user mutation.
      const {error:cacheError} = await ctx.admin.from('suppliers').upsert(workspaceSupplierCacheRow(canonical,ctx.organizationId),{onConflict:'organization_id,external_id'});
      if(cacheError) fail('supplier_cache_write_failed',502);
      localSupplierId = (await one(scoped('suppliers').eq('external_id',command.supplierId),'supplier_cache_not_ready')).id;
      const {data:existing,error:readError} = await scoped('project_supplier_links').eq('project_id',ctx.projectId).eq('supplier_id',command.supplierId).maybeSingle();
      if(readError) fail('workspace_read_failed',502);
      if(!existing) {
        const {error} = await ctx.admin.from('project_supplier_links').insert({organization_id:ctx.organizationId,project_id:ctx.projectId,supplier_id:command.supplierId,contact_id:command.contactId || null,service_type:'Transport',status:'draft'});
        if(error) fail('supplier_link_write_failed',502);
      }
    }
    const outbound={organization_id:ctx.organizationId,booking_id:project.booking_id,vehicle_id:null,supplier_id:localSupplierId,supplier_contact_id:command.contactId || null,transport_type:command.transportType,transport_date:command.transportDate,transport_time:command.transportTime || null,pickup_address:command.pickupAddress || null,origin_address:command.pickupAddress || null,destination_address:command.destinationAddress || null,requested_vehicle_type:command.vehicleSize || null,cargo_description:command.cargoDescription || null,cargo_weight_kg:command.cargoWeightKg ?? null,cargo_volume_m3:command.cargoVolumeM3 ?? null,driver_notes:command.notes || null,planning_status:'preliminary',stop_order:0};
    const transportRows=[outbound];
    if(command.includeReturn) transportRows.push({...outbound,transport_type:'pickup',transport_date:command.returnDate!,transport_time:command.returnTime || null,pickup_address:command.destinationAddress || null,origin_address:command.destinationAddress || null,destination_address:command.pickupAddress || null});
    // One INSERT statement makes delivery + return all-or-nothing under the outer receipt.
    const {data,error}=await ctx.admin.from('transport_assignments').insert(transportRows).select('id');
    if(error || !Array.isArray(data) || data.length!==transportRows.length) fail('transport_write_failed',502);
    let projectionSynced = true;
    try { await deps.invokeOwner('sync-operational-plan-to-booking',{booking_id:project.booking_id}); } catch { projectionSynced = false; }
    return {persisted:true,assignmentId:data[0].id,assignmentIds:data.map(a=>a.id),projectionSynced};
  }
  const {data:assignments,error} = await scoped('transport_assignments').eq('booking_id',project.booking_id).in('id',command.assignmentIds);
  if(error) fail('workspace_read_failed',502);
  if(!assignments || assignments.length !== command.assignmentIds.length) fail('transport_not_found',404);
  if(new Set(assignments.map((a:any)=>a.supplier_id || a.vehicle_id)).size !== 1) fail('different_transport_suppliers');
  // Validate every relationship consumed by the canonical sender, not only the assignment itself.
  for(const a of assignments) {
    let recipientEmail: string | null = null;
    if(a.supplier_id) {
      const local = await one(scoped('suppliers').eq('id',a.supplier_id),'supplier_not_found');
      if(local.external_id) {
        const canonical = await supplier(local.external_id,a.supplier_contact_id);
        recipientEmail = workspaceSupplierRecipient(canonical,a.supplier_contact_id,true).email;
        const {error:cacheError} = await ctx.admin.from('suppliers').upsert(workspaceSupplierCacheRow(canonical,ctx.organizationId),{onConflict:'organization_id,external_id'});
        if(cacheError) fail('supplier_cache_write_failed',502);
      } else recipientEmail = workspaceSupplierRecipient(local,a.supplier_contact_id,true).email;
    } else if(a.vehicle_id) recipientEmail = (await one(scoped('vehicles').eq('id',a.vehicle_id),'vehicle_not_found')).contact_email;
    else fail('transport_recipient_required');
    if(!recipientEmail || recipientEmail.toLowerCase() !== command.expectedRecipientEmail.toLowerCase()) fail('recipient_changed',409);
  }
  const result = await deps.invokeOwner('send-transport-request',{assignment_ids:command.assignmentIds,custom_subject:command.subject,custom_message:command.message,reference_person:command.referencePerson,expected_recipient_email:command.expectedRecipientEmail});
  if(result?.success !== true || result.assignments_count !== command.assignmentIds.length) fail('owner_action_uncertain',502);
  return {persisted:true,delivery:'sent',assignmentIds:command.assignmentIds};
}

type RegistryDependencies = { fetcher?: typeof fetch; env?: (name: string) => string | undefined };
async function readWorkspaceRegistry(organizationId: string, body: Record<string,unknown>, deps: RegistryDependencies = {}) {
  if(!uuid(organizationId)) fail('unauthorized',403);
  const key = (deps.env ?? ((name:string)=>(globalThis as any).Deno?.env.get(name)))('SUPPLIER_REGISTRY_API_KEY');
  if(!key) fail('supplier_registry_unavailable',503);
  const response = await (deps.fetcher ?? fetch)('https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/supplier-registry',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`,'x-organization-id':organizationId},
    body:JSON.stringify(body),signal:AbortSignal.timeout(15000),
  });
  const payload = await response.json();
  if(!response.ok || payload.success !== true) fail('supplier_registry_unavailable',502);
  return payload.data;
}
function validateRegistrySupplier(supplier: RegistrySupplier, org: string) {
  if(!supplier || !uuid(supplier.id) || typeof supplier.name !== 'string' || supplier.organization_id !== org || !Array.isArray(supplier.contacts) || supplier.contacts.length >= 500 || supplier.contacts.some(c=>!uuid(c.id))) fail('supplier_registry_invalid',502);
  return supplier;
}
export async function readWorkspaceRegistrySupplier(organizationId:string,supplierId:string,deps:RegistryDependencies={}):Promise<RegistrySupplier> {
  const result = validateRegistrySupplier(await readWorkspaceRegistry(organizationId,{action:'get_supplier',supplier_id:supplierId},deps),organizationId);
  if(result.id !== supplierId) fail('supplier_registry_invalid',502);
  return result;
}
/** Exactly the cache fields maintained by canonical supplier-registry-proxy mapToRow. */
export function workspaceSupplierCacheRow(s:RegistrySupplier,organization_id:string) {
  if(s.organization_id && s.organization_id !== organization_id) fail('supplier_registry_invalid',502);
  return {organization_id,external_id:s.id,name:s.name,short_name:s.short_name??null,color:s.color??null,email:s.email??null,phone:s.phone??null,website:s.website??null,address_line1:s.address_line1??null,address_line2:s.address_line2??null,postal_code:s.postal_code??null,city:s.city??null,country:s.country??null,notes:s.notes??null,primary_contact:s.primary_contact??null,contacts:s.contacts??[],last_synced_at:new Date().toISOString()};
}
/** Same contact preference as the canonical web surfaces; no legacy recipient tables. */
export function workspaceSupplierRecipient(s:RegistrySupplier,contactId?:string|null,transport=false):{email:string;name:string} {
  const explicit = contactId ? s.contacts?.find(c=>c.id===contactId) : null;
  if(contactId && !explicit) fail('supplier_contact_not_found',404);
  const contact = explicit || (transport ? s.primary_contact : null) || s.contacts?.[0];
  const email = contact?.email || s.email;
  if(typeof email !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(email)) fail('supplier_email_required',409);
  return {email,name:contact?.name || s.name};
}
export async function resolveWorkspaceSupplierRecipient(organizationId:string,supplierId:string,contactId?:string|null,expectedEmail?:string,deps:RegistryDependencies={}) {
  const supplier = await readWorkspaceRegistrySupplier(organizationId,supplierId,deps);
  const recipient = workspaceSupplierRecipient(supplier,contactId);
  if(expectedEmail !== undefined && recipient.email.toLowerCase() !== expectedEmail.toLowerCase()) fail('recipient_changed',409);
  return recipient;
}
export async function loadWorkspaceSupplierTransportOptions(admin:any,input:{organizationId:string;projectId:string;localUserId:string},deps:RegistryDependencies={}) {
  const {organizationId,projectId,localUserId}=input;
  if(!uuid(organizationId)||!uuid(projectId)||!uuid(localUserId)) fail('unauthorized',403);
  const project = await one(admin.from('projects').select('id,booking_id').eq('id',projectId).eq('organization_id',organizationId).is('deleted_at',null),'project_not_found');
  const booking = project.booking_id ? await one(admin.from('bookings').select('id,client,booking_number,rigdaydate,eventdate,rigdowndate,deliveryaddress,delivery_city,delivery_postal_code').eq('id',project.booking_id).eq('organization_id',organizationId),'booking_not_found') : null;
  const suppliers = await readWorkspaceRegistry(organizationId,{action:'list_suppliers',limit:501},deps);
  // Registry currently has no pagination/count contract and defaults to 500.
  // Refuse a boundary-sized response rather than returning a partial picker.
  if(!Array.isArray(suppliers)||suppliers.length>=500) fail('supplier_options_incomplete',502);
  suppliers.forEach(s=>validateRegistrySupplier(s,organizationId));
  if(new Set(suppliers.map(s=>s.id)).size!==suppliers.length || suppliers.reduce((n,s)=>n+s.contacts.length,0)>=500) fail('supplier_options_incomplete',502);
  const vehicles:any[]=[]; let total:number|null=null;
  for(let offset=0;offset<=20000;offset+=200) {
    const result=await admin.from('vehicles').select('id,name,vehicle_type,is_external',{count:'exact'}).eq('organization_id',organizationId).order('id').range(offset,offset+199);
    if(result.error || !Number.isSafeInteger(result.count)||result.count<0||!Array.isArray(result.data)) fail('vehicle_options_unavailable',502);
    if(total!==null && total!==result.count) fail('vehicle_options_changed',409);
    total=result.count;
    if(result.data.length!==Math.min(200,Math.max(0,total!-offset))) fail('vehicle_options_incomplete',502);
    vehicles.push(...result.data);
    if(vehicles.length===total) return {schema:'operations-project-workspace-options.v1' as const,projectId,suppliers,vehicles,booking};
  }
  return fail('vehicle_options_too_large',502);
}

/** Only exact server secret or a locally verified user token can enter owner send handlers. */
export async function authenticateWorkspaceOwnerSender(req:Request,admin:any,serviceRoleKey?:string):Promise<{localUserId:string|null}> {
  const header=req.headers.get('authorization') || '';
  if(!header.startsWith('Bearer ') || !header.slice(7)) fail('unauthorized',401);
  const token=header.slice(7);
  const secret=serviceRoleKey ?? (globalThis as any).Deno?.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(secret && token===secret) return {localUserId:null};
  let result:any;
  try { result=await admin.auth.getUser(token); } catch { return fail('unauthorized',401); }
  if(result.error || !uuid(result.data?.user?.id)) fail('unauthorized',401);
  return {localUserId:result.data.user.id};
}
export async function authorizeWorkspaceOwnerOrganization(admin:any,principal:{localUserId:string|null},organizationId:string) {
  if(!uuid(organizationId)) fail('organization_required',403);
  if(principal.localUserId===null) return;
  const {data,error}=await admin.from('user_roles').select('role').eq('user_id',principal.localUserId).eq('organization_id',organizationId).in('role',['admin','projekt']).limit(1);
  if(error || !data?.length) fail('forbidden',403);
}
