import { groupProducts, cleanProductName, productCostDisplay, costSummaryDisplay, costProductGroups, legacyCostDifferences } from './operations-product-presentation.ts';
import { SUPPLIER_STATUS, THREAD_STATUS, workspaceTransportDisplay } from './operations-project-workspace-presentation.ts';
export { workspaceTransportDisplay } from './operations-project-workspace-presentation.ts';
import { mapCanonicalBookingToPlanning } from '../../../src/lib/booking/canonicalBooking.ts';
import { buildPackageMembers } from '../../../src/lib/booking/packageMembers.ts';
import { extraCostsTotal } from '../../../src/lib/economy/bookingCosts.ts';
import { mergeSupplierData } from '../../../src/types/supplier.ts';
import { resolveProjectPhaseDates } from './projectPhaseDates.ts';
import type { OperationsProjectWorkspace, WorkspaceRecord } from './operations-project-workspace-contract.ts';

type Dependencies = { fetcher?: typeof fetch; env?: (key: string) => string | undefined };
const getEnv = (key: string): string | undefined => (globalThis as any).Deno?.env.get(key);
/** Count checked pagination: never render a truncated collection as complete. */
export async function readWorkspaceRows(query: () => any): Promise<WorkspaceRecord[]> {
  const rows: WorkspaceRecord[] = [];
  let total: number | null = null;
  for (let offset = 0; offset <= 20000; offset += 200) {
    const page = await query().range(offset, offset + 199);
    if (page.error || !Number.isSafeInteger(page.count) || page.count < 0 || !Array.isArray(page.data)) throw new Error('collection_unavailable');
    if (total !== null && page.count !== total) throw new Error('collection_changed');
    total = page.count;
    if (page.data.length !== Math.min(200, Math.max(0, total! - offset))) throw new Error('collection_incomplete');
    rows.push(...page.data);
    if (rows.length === total) return rows;
  }
  throw new Error('collection_too_large');
}

/** Called only after signed/JWT actor authorization; every resource remains tenant bound. */
export async function loadOperationsProjectWorkspace(admin: any, input: { organizationId: string; projectId: string; localUserId: string }, deps: Dependencies = {}): Promise<OperationsProjectWorkspace> {
  const { organizationId: org, projectId, localUserId } = input;
  if (!org || !projectId || !localUserId) throw new Error('actor_required');
  const result = await admin.from('projects').select('*').eq('id', projectId).eq('organization_id', org).is('deleted_at', null).maybeSingle();
  if (result.error) throw new Error('project_unavailable');
  const project = result.data;
  if (!project || project.organization_id !== org) throw new Error('project_not_found');
  const roles = await Promise.resolve(admin.from('user_roles').select('role,organization_id').eq('user_id',localUserId).eq('organization_id',org).in('role',['admin','projekt'])).catch(() => ({data:null,error:true}));
  const canWrite = !roles.error && Array.isArray(roles.data) && roles.data.some((r: any) => r.organization_id === org && ['admin','projekt'].includes(r.role));
  const fetcher = deps.fetcher ?? fetch;
  const env = deps.env ?? getEnv;
  const sectionErrors: Record<string, string> = {};
  const section = async <T>(key: string, run: () => Promise<T>): Promise<T | null> => {
    try { return await run(); } catch { sectionErrors[key] = 'unavailable'; return null; }
  };
  const rows = (table: string, column: string, id: string, order: string, ascending = true, select = '*') => readWorkspaceRows(() => admin.from(table).select(select, { count: 'exact' }).eq('organization_id', org).eq(column, id).order(order, { ascending }).order('id'));
  const json = async (url: string, init: RequestInit) => {
    const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('source_unavailable');
    const data = await response.json();
    if (!data || typeof data !== 'object' || data.error || data.success === false) throw new Error('source_invalid');
    return data;
  };
  const bookingId = project.booking_id ?? null;
  const linked = bookingId ? await section('booking', async () => {
    const res = await admin.from('bookings').select('*').eq('id', bookingId).eq('organization_id', org).maybeSingle();
    if (res.error || !res.data || res.data.organization_id !== org) throw new Error('booking_not_found');
    return res.data;
  }) : null;
  // Never query external APIs for a foreign/missing linked booking.
  const safeBookingId = linked ? bookingId : null;
  const livePromise = safeBookingId ? section('products', () => readWorkspaceBooking(safeBookingId, org, {fetcher,env})) : Promise.resolve(null);
  const economy = async (type: string) => {
    const base = env('EF_SUPABASE_URL'), key = env('PLANNING_API_KEY');
    if (!base || !key) throw new Error('not_configured');
    const qs = new URLSearchParams({ type, booking_id: safeBookingId!, organization_id: org });
    const value = await json(`${base}/functions/v1/planning-api?${qs}`, { headers: { 'x-api-key': key } });
    if (type === 'product_costs' && (!Array.isArray(value.products) || !value.summary)) throw new Error('invalid_costs');
    if (type === 'extra_costs' && !(value.extra_costs === null || Array.isArray(value.extra_costs))) throw new Error('invalid_costs');
    return value;
  };
  const suppliersPromise = section('suppliers', async () => {
    const links = await rows('project_supplier_links','project_id',projectId,'created_at',false);
    return Promise.all(links.map(async link => {
    const key = env('SUPPLIER_REGISTRY_API_KEY');
    if (!key) throw new Error('not_configured');
    const response = await json('https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/supplier-registry', { method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`,'x-organization-id':org},body:JSON.stringify({action:'get_supplier',supplier_id:link.supplier_id}) });
    const supplier = response.success === true ? response.data : response;
    if (supplier.id !== link.supplier_id || (supplier.organization_id && supplier.organization_id !== org)) throw new Error('supplier_identity_mismatch');
    const merged = mergeSupplierData(link as any,supplier);
    return { ...merged, statusLabel: SUPPLIER_STATUS[link.status] ?? link.status };
  }));
  });
  const [projectFiles,tasks,threads,suppliers,transports,emailLogs,legacyOverrides,productCosts,extraCosts,wmsRows,live] = await Promise.all([
    section('projectFiles', () => rows('project_files','project_id',projectId,'uploaded_at',false)),
    section('tasks', () => rows('project_tasks','project_id',projectId,'sort_order')),
    section('threads', () => rows('supplier_request_threads','project_id',projectId,'created_at',false,'id,recipient_email,recipient_name,subject,status,response_message,sent_at,responded_at,created_at')),
    suppliersPromise,
    safeBookingId ? section('transports', () => rows('transport_assignments','booking_id',safeBookingId,'transport_date',true,'id,booking_id,vehicle_id,supplier_id,supplier_contact_id,requested_vehicle_type,cargo_description,cargo_weight_kg,cargo_volume_m3,transport_date,transport_time,transport_end_time,pickup_address,origin_address,destination_address,planning_status,transport_type,status,partner_response,partner_responded_at,created_at,stop_order,driver_notes,vehicle:vehicles!vehicle_id(id,name,contact_person,contact_email,contact_phone,is_external,vehicle_type,organization_id),supplier:suppliers!supplier_id(id,external_id,name,email,phone,primary_contact,contacts,organization_id)')) : Promise.resolve([]),
    safeBookingId ? section('emailLogs', () => rows('transport_email_log','booking_id',safeBookingId,'sent_at',false,'id,assignment_id,booking_id,recipient_email,recipient_name,subject,custom_message,sent_at,email_type')) : Promise.resolve([]),
    section('legacyOverrides', () => rows('product_cost_overrides','project_id',projectId,'id')),
    safeBookingId ? section('productCosts', () => economy('product_costs')) : Promise.resolve(null),
    safeBookingId ? section('extraCosts', () => economy('extra_costs')) : Promise.resolve(null),
    safeBookingId ? section('packageMembers', () => readWorkspaceRows(() => admin.from('booking_products').select('id,name,quantity,sync_key,sort_index,inventory_package_id,parent_product_id,is_package_component',{count:'exact'}).eq('organization_id',org).eq('booking_id',safeBookingId).like('sync_key','wms:%').not('inventory_package_id','is',null).is('source_missing_since',null).order('id'))) : Promise.resolve([]),
    livePromise,
  ]);
  if (bookingId && !live) { sectionErrors.bookingAttachments = 'unavailable'; sectionErrors.notes = 'unavailable'; }
  if (transports?.some(t => (t.vehicle && t.vehicle.organization_id !== org) || (t.supplier && t.supplier.organization_id !== org))) {
    sectionErrors.transports = 'unavailable';
  }
  if (productCosts) { productCosts.products = productCosts.products.map((p: any) => ({...p,...productCostDisplay(p)})); productCosts.displaySummary = costSummaryDisplay(productCosts as any); productCosts.productGroups = costProductGroups(productCosts.products); }
  if (extraCosts) extraCosts.displayTotal = extraCostsTotal(extraCosts.extra_costs);
  const source = linked ?? project;
  const phases = resolveProjectPhaseDates(project,linked);
  const booking = bookingId && !linked ? null : {
    client:source.client || 'Internt projekt',bookingNumber:linked?.booking_number ?? null,
    deliveryAddress:source.deliveryaddress ?? null,deliveryCity:source.delivery_city ?? null,deliveryPostalCode:source.delivery_postal_code ?? null,
    contactName:source.contact_name ?? null,contactPhone:source.contact_phone ?? null,contactEmail:source.contact_email ?? null,
    rigDayDate:phases.rigdaydate,eventDate:phases.eventdate,rigDownDate:phases.rigdowndate,
    carryMoreThan10m:linked?.carry_more_than_10m ?? null,groundNailsAllowed:linked?.ground_nails_allowed ?? null,exactTimeNeeded:linked?.exact_time_needed ?? null,exactTimeInfo:linked?.exact_time_info ?? null,rentalOnly:linked?.rental_only ?? false,
    projectLeader:project.project_leader ?? null,products:live?.products ?? (bookingId ? null : []),
    productGroups:live ? groupProducts(live.products ?? []).map(g=>({parent:{...g.parent,displayName:cleanProductName(g.parent.name)},accessories:g.accessories.map(p=>({...p,displayName:cleanProductName(p.name)}))})) : [],
    packageMembers:live && wmsRows ? Object.fromEntries(Object.entries(buildPackageMembers(live.products ?? [],wmsRows as any)).map(([id,rows])=>[id,rows.map(p=>({...p,displayName:cleanProductName(p.name)}))])) : {},
  };
  return { schema:'operations-project-workspace.v1',projectId,capabilities:{canWrite},project:{id:project.id,name:project.name,bookingId,projectLeader:project.project_leader ?? null},header:{bookingNumber:linked?.booking_number ?? null,client:linked?.client || project.client || 'Internt projekt',eventDate:linked?.eventdate || project.eventdate || null,address:linked?.deliveryaddress || project.deliveryaddress || null,contactName:linked?.contact_name || project.contact_name || null},booking,notes:{value:bookingId ? live?.internalNotes ?? '' : project.internalnotes ?? '',target:bookingId?'booking':'project'},files:{projectFiles,bookingAttachments:live ? (live.attachments ?? []).map(a=>({id:a.id,booking_id:bookingId,url:a.url,file_name:a.fileName,file_type:a.fileType,uploaded_at:''})) : bookingId ? null : []},planning:{tasks,threads:threads?.map(t => ({...t,statusLabel: THREAD_STATUS[t.status] ?? t.status})) ?? null,suppliers,transports:sectionErrors.transports?null:transports?.map(t => workspaceTransportDisplay(Object.fromEntries([...TRANSPORT_FIELDS,'vehicle','supplier'].map(k=>[k,t[k]])))) ?? null,emailLogs},costs:{productCosts,extraCosts,legacyOverrides:legacyOverrides ? legacyCostDifferences(legacyOverrides,productCosts?.products ?? [],bookingId ?? '').map(({row,product,costs,expected})=>({...row,productName:product?.product_name ?? `Ej matchad produktrad: ${row.product_id}`,canReconcile:!!product,currentProduct:product ?? null,costs,expected})) : null},sectionErrors };
}

/** Existing Booking export contract; shared by workspace reads and note conflict checks. */
export async function readWorkspaceBooking(bookingId: string, org: string, deps: Dependencies = {}) {
 const env = deps.env ?? getEnv, fetcher = deps.fetcher ?? fetch;
 const key = env('IMPORT_API_KEY') ?? env('PLANNING_API_KEY');
 if (!key) throw new Error('booking_source_unavailable');
 const qs = new URLSearchParams({organization_id:org,booking_id:bookingId});
 const response = await fetcher(`https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings?${qs}`, {headers:{Authorization:`Bearer ${key}`,'x-api-key':key},signal:AbortSignal.timeout(8000)});
 if (!response.ok) throw new Error('booking_source_unavailable');
 const payload = await response.json();
 const canonical = payload.found === true ? payload.booking : [...(payload.data ?? []),...(payload.bookings ?? [])].find((r: any)=>r.id === bookingId);
 if (!canonical || canonical.id !== bookingId || (canonical.organization_id && canonical.organization_id !== org)) throw new Error('booking_source_identity_mismatch');
 return mapCanonicalBookingToPlanning(canonical);
}

const TRANSPORT_FIELDS = 'id,booking_id,vehicle_id,supplier_id,supplier_contact_id,requested_vehicle_type,cargo_description,cargo_weight_kg,cargo_volume_m3,transport_date,transport_time,transport_end_time,pickup_address,origin_address,destination_address,planning_status,transport_type,status,partner_response,partner_responded_at,created_at,stop_order,driver_notes'.split(',');
