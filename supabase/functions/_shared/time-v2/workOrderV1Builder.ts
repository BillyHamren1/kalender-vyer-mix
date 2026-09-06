import {
  assertWorkOrderV1,
  isHttpsUrl,
  toStockholmOffsetIso,
  WORK_ORDER_LIMITS,
  WORK_ORDER_SCHEMA,
  type WorkOrderContact,
  type WorkOrderFile,
  type WorkOrderFileKind,
  type WorkOrderInstruction,
  type WorkOrderLine,
  type WorkOrderPhase,
  type WorkOrderPhaseKind,
  type WorkOrderTask,
  type WorkOrderTeamMember,
  type WorkOrderV1,
} from './workOrderV1.ts';

type Extra = { readonly [key: string]: unknown };

export interface WorkOrderBookingSource extends Extra {
  readonly id: string;
  readonly rigdaydate?: string | null;
  readonly eventdate?: string | null;
  readonly rigdowndate?: string | null;
  readonly rig_start_time?: string | null;
  readonly rig_end_time?: string | null;
  readonly event_start_time?: string | null;
  readonly event_end_time?: string | null;
  readonly rigdown_start_time?: string | null;
  readonly rigdown_end_time?: string | null;
  readonly contact_name?: string | null;
  readonly contact_phone?: string | null;
  readonly contact_email?: string | null;
  readonly carry_more_than_10m?: boolean | null;
  readonly ground_nails_allowed?: boolean | null;
  readonly exact_time_needed?: boolean | null;
  readonly exact_time_info?: string | null;
  readonly customer_pickup?: boolean | null;
  readonly rental_only?: boolean | null;
  readonly map_drawing_url?: string | null;
}

export interface WorkOrderProjectSource extends Extra {
  readonly id: string;
  readonly project_leader?: string | null;
}

export interface WorkOrderProductRow extends Extra {
  readonly id: string;
  readonly booking_id: string;
  readonly name: string | null;
  readonly quantity: number | null;
  readonly notes?: string | null;
  readonly parent_product_id?: string | null;
  readonly parent_package_id?: string | null;
  readonly is_package_component?: boolean | null;
  readonly inventory_package_id?: string | null;
  readonly package_components?: unknown;
  readonly sort_index?: number | null;
  readonly source_missing_since?: string | null;
}

export interface WorkOrderCalendarPhaseRow extends Extra {
  readonly id: string;
  readonly booking_id: string | null;
  readonly event_type: string | null;
  readonly start_time: string | null;
  readonly end_time: string | null;
}

export interface WorkOrderFileRow extends Extra {
  readonly id: string;
  readonly booking_id?: string | null;
  readonly project_id?: string | null;
  readonly url: string | null;
  readonly file_name?: string | null;
  readonly file_type?: string | null;
}

export interface WorkOrderEstablishmentTaskRow extends Extra {
  readonly id: string;
  readonly booking_id: string | null;
  readonly title: string | null;
  readonly completed?: boolean | null;
  readonly status?: string | null;
  readonly notes?: string | null;
  readonly assigned_to?: string | null;
  readonly assigned_to_ids?: readonly string[] | null;
  readonly visible_in_time_app?: boolean | null;
  readonly sort_order?: number | null;
}

export interface WorkOrderProjectTaskRow extends Extra {
  readonly id: string;
  readonly project_id: string | null;
  readonly title: string | null;
  readonly description?: string | null;
  readonly completed?: boolean | null;
  readonly is_info_only?: boolean | null;
  readonly assigned_to?: string | null;
  readonly assigned_to_ids?: readonly string[] | null;
  readonly sort_order?: number | null;
}

export interface WorkOrderTeamRow extends Extra {
  readonly booking_id: string;
  readonly staff_id: string;
  readonly assignment_date: string;
  readonly team_id?: string | null;
}

export interface WorkOrderStaffRow extends Extra {
  readonly id: string;
  readonly name: string | null;
  readonly role?: string | null;
  readonly phone?: string | null;
}

export interface WorkOrderBuildInput {
  readonly workerStaffId: string;
  readonly workDate: string;
  readonly booking: WorkOrderBookingSource;
  readonly project?: WorkOrderProjectSource | null;
  readonly products?: readonly WorkOrderProductRow[];
  readonly calendarPhases?: readonly WorkOrderCalendarPhaseRow[];
  readonly attachments?: readonly WorkOrderFileRow[];
  readonly projectFiles?: readonly WorkOrderFileRow[];
  readonly establishmentTasks?: readonly WorkOrderEstablishmentTaskRow[];
  readonly projectTasks?: readonly WorkOrderProjectTaskRow[];
  readonly teamRows?: readonly WorkOrderTeamRow[];
  readonly staffById?: ReadonlyMap<string, WorkOrderStaffRow>;
}

export type WorkOrderGaps = Record<string, number>;
export interface WorkOrderBuildResult { readonly workOrder: WorkOrderV1 | null; readonly gaps: WorkOrderGaps; }

const text = (value: unknown, max = WORK_ORDER_LIMITS.maxTextLength): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
};
const label = (value: unknown) => text(value, WORK_ORDER_LIMITS.label);
const bump = (gaps: WorkOrderGaps, code: string, by = 1) => { if (by > 0) gaps[code] = (gaps[code] ?? 0) + by; };
const includesWorker = (row: { assigned_to?: string | null; assigned_to_ids?: readonly string[] | null }, staffId: string) =>
  (Array.isArray(row.assigned_to_ids) && row.assigned_to_ids.includes(staffId)) || row.assigned_to === staffId;
const compareNullableNumber = (a: number | null | undefined, b: number | null | undefined) =>
  (typeof a === 'number' && Number.isFinite(a) ? a : Number.POSITIVE_INFINITY)
  - (typeof b === 'number' && Number.isFinite(b) ? b : Number.POSITIVE_INFINITY);
const HIERARCHY_PREFIX = /^(?:L,|--|[↳└→✓\u21B3\u2514\u2192\u2713\-–\s])+\s*/;
const cleanLineName = (name: string) => name.replace(HIERARCHY_PREFIX, '').trim();
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CALENDAR_PHASE_KIND: Record<string, WorkOrderPhaseKind> = { rig: 'rig', event: 'event', rigDown: 'derig' };
const PHASE_ORDER: Record<WorkOrderPhaseKind, number> = { rig: 0, event: 1, derig: 2 };

const buildPhases = (input: WorkOrderBuildInput, gaps: WorkOrderGaps): WorkOrderPhase[] => {
  const byPhase = new Map<WorkOrderPhaseKind, WorkOrderPhase>();
  const push = (phase: WorkOrderPhaseKind, start: unknown, end: unknown, source: string) => {
    if (byPhase.has(phase)) return;
    const startsAt = toStockholmOffsetIso(start);
    const endsAt = toStockholmOffsetIso(end);
    if (!startsAt || !endsAt || Date.parse(startsAt) >= Date.parse(endsAt)) {
      bump(gaps, `phase_invalid:${source}`);
      return;
    }
    byPhase.set(phase, { phase, startsAt, endsAt });
  };
  const booking = input.booking;
  push('rig', booking.rig_start_time, booking.rig_end_time, 'rig');
  push('event', booking.event_start_time, booking.event_end_time, 'event');
  push('derig', booking.rigdown_start_time, booking.rigdown_end_time, 'derig');
  for (const row of input.calendarPhases ?? []) {
    if (row.booking_id !== booking.id) continue;
    const phase = CALENDAR_PHASE_KIND[String(row.event_type ?? '')];
    if (phase) push(phase, row.start_time, row.end_time, String(row.event_type));
  }
  return [...byPhase.values()].sort((a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase]);
};

const exactQuantity = (value: number): string | null => {
  if (!Number.isFinite(value) || value < 0) return null;
  const rounded = Math.round(value * 1000) / 1000;
  if (Math.abs(value - rounded) > 1e-9) return null;
  const result = String(rounded);
  return /^\d{1,9}(\.\d{1,3})?$/.test(result) ? result : null;
};

const buildLines = (input: WorkOrderBuildInput, gaps: WorkOrderGaps): WorkOrderLine[] => {
  const rows = (input.products ?? [])
    .filter((row) => row.booking_id === input.booking.id && !row.source_missing_since)
    .slice()
    .sort((a, b) => compareNullableNumber(a.sort_index, b.sort_index) || String(a.name ?? '').localeCompare(String(b.name ?? ''), 'sv') || a.id.localeCompare(b.id));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const rowIdByInventoryPackage = new Map<string, string>();
  for (const row of rows) if (row.inventory_package_id && row.is_package_component !== true && !rowIdByInventoryPackage.has(row.inventory_package_id)) rowIdByInventoryPackage.set(row.inventory_package_id, row.id);

  const parentOf = new Map<string, string | undefined>();
  const parentIds = new Set<string>();
  for (const row of rows) {
    let parent: string | undefined;
    if (row.parent_product_id && byId.has(row.parent_product_id) && row.parent_product_id !== row.id) parent = row.parent_product_id;
    else if (row.parent_package_id) {
      if (byId.has(row.parent_package_id) && row.parent_package_id !== row.id) parent = row.parent_package_id;
      else parent = rowIdByInventoryPackage.get(row.parent_package_id);
    }
    parentOf.set(row.id, parent);
    if (parent) parentIds.add(parent);
  }
  const packageIds = new Set(rows.filter((row) =>
    (Array.isArray(row.package_components) && row.package_components.length > 0)
    || (Boolean(row.inventory_package_id) && row.is_package_component !== true)
    || parentIds.has(row.id)).map((row) => row.id));

  const lines: WorkOrderLine[] = [];
  for (const row of rows) {
    const rawName = label(row.name);
    const quantity = typeof row.quantity === 'number' ? exactQuantity(row.quantity) : null;
    if (!rawName || quantity === null) { bump(gaps, !rawName ? 'line_label_missing' : 'line_quantity_invalid'); continue; }
    const parent = parentOf.get(row.id);
    const parentLineId = parent && packageIds.has(parent) ? parent : undefined;
    if (parent && !parentLineId) bump(gaps, 'line_parent_unresolved');
    lines.push({
      lineId: row.id,
      kind: packageIds.has(row.id) ? 'package' : 'product',
      label: label(parentLineId ? cleanLineName(rawName) : rawName) ?? rawName,
      quantity,
      // Booking/Planning quantities are counts; there is no alternate unit column.
      unit: 'st',
      ...(text(row.notes, WORK_ORDER_LIMITS.note) ? { note: text(row.notes, WORK_ORDER_LIMITS.note) } : {}),
      ...(parentLineId ? { parentLineId } : {}),
    });
  }
  return lines.slice(0, WORK_ORDER_LIMITS.lines);
};

const buildInstructions = (input: WorkOrderBuildInput): WorkOrderInstruction[] => {
  const out: WorkOrderInstruction[] = [];
  const push = (instructionId: string, labelText: string, body?: string) => out.push({ instructionId, label: labelText, body: body ?? labelText });
  const b = input.booking;
  const exactInfo = text(b.exact_time_info, WORK_ORDER_LIMITS.body);
  if (b.exact_time_needed === true) push('exact_time_needed', 'Exakt tid behövs', exactInfo);
  else if (exactInfo) push('exact_time_info', 'Tidsinformation', exactInfo);
  if (b.carry_more_than_10m === true) push('carry_more_than_10m', 'Bär mer än 10 m');
  if (b.ground_nails_allowed === true) push('ground_nails_allowed', 'Markpinnar tillåtet');
  if (b.ground_nails_allowed === false) push('ground_nails_not_allowed', 'Markpinnar ej tillåtet');
  if (b.customer_pickup === true) push('customer_pickup', 'Kund hämtar själv');
  if (b.rental_only === true) push('rental_only', 'Endast uthyrning');
  return out.slice(0, WORK_ORDER_LIMITS.instructions);
};

const buildTasks = (input: WorkOrderBuildInput, gaps: WorkOrderGaps): WorkOrderTask[] => {
  const out: Array<WorkOrderTask & { sort: number }> = [];
  for (const row of input.establishmentTasks ?? []) {
    if (row.booking_id !== input.booking.id || row.visible_in_time_app !== true || !includesWorker(row, input.workerStaffId)) continue;
    const taskLabel = label(row.title); if (!taskLabel) { bump(gaps, 'task_title_missing'); continue; }
    out.push({ taskId: row.id, label: taskLabel, ...(text(row.notes, WORK_ORDER_LIMITS.note) ? { note: text(row.notes, WORK_ORDER_LIMITS.note) } : {}), sort: typeof row.sort_order === 'number' ? row.sort_order : Number.POSITIVE_INFINITY });
  }
  const projectId = input.project?.id ?? null;
  for (const row of input.projectTasks ?? []) {
    if (!projectId || row.project_id !== projectId || row.is_info_only === true || !includesWorker(row, input.workerStaffId)) continue;
    const taskLabel = label(row.title); if (!taskLabel) { bump(gaps, 'task_title_missing'); continue; }
    out.push({ taskId: row.id, label: taskLabel, ...(text(row.description, WORK_ORDER_LIMITS.note) ? { note: text(row.description, WORK_ORDER_LIMITS.note) } : {}), sort: typeof row.sort_order === 'number' ? row.sort_order : Number.POSITIVE_INFINITY });
  }
  const seen = new Set<string>();
  return out.sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'sv')).filter((row) => !seen.has(row.taskId) && Boolean(seen.add(row.taskId))).slice(0, WORK_ORDER_LIMITS.tasks).map(({ sort: _sort, ...task }) => task);
};

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|svg)(\?|#|$)/i;
const fileKind = (fileType: unknown, url: string): WorkOrderFileKind => typeof fileType === 'string' && fileType.toLowerCase().startsWith('image/') || IMAGE_EXT.test(url) ? 'image' : 'document';
const fileNameFromUrl = (url: string) => { try { return label(decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '')); } catch { return undefined; } };
const buildFiles = (input: WorkOrderBuildInput, gaps: WorkOrderGaps): WorkOrderFile[] => {
  const out = new Map<string, WorkOrderFile>();
  const add = (id: unknown, url: unknown, name: unknown, type: unknown) => {
    const href = text(url, WORK_ORDER_LIMITS.url); if (!href || !isHttpsUrl(href)) { if (href) bump(gaps, 'file_not_https'); return; }
    const fileLabel = label(name) ?? fileNameFromUrl(href); if (!fileLabel) return;
    const mimeType = typeof type === 'string' && type.includes('/') ? text(type, WORK_ORDER_LIMITS.mimeType) : undefined;
    out.set(href, { fileId: label(id) ?? href.slice(0, WORK_ORDER_LIMITS.identifier), kind: fileKind(type, href), label: fileLabel, url: href, ...(mimeType ? { mimeType } : {}) });
  };
  for (const row of input.attachments ?? []) if (row.booking_id === input.booking.id) add(row.id, row.url, row.file_name, row.file_type);
  for (const row of input.projectFiles ?? []) if (input.project?.id && row.project_id === input.project.id) add(row.id, row.url, row.file_name, row.file_type);
  add(`booking:${input.booking.id}:map_drawing`, input.booking.map_drawing_url, undefined, undefined);
  return [...out.values()].slice(0, WORK_ORDER_LIMITS.files);
};

const buildTeam = (input: WorkOrderBuildInput, gaps: WorkOrderGaps): WorkOrderTeamMember[] => {
  const out: WorkOrderTeamMember[] = []; const seen = new Set<string>();
  for (const row of input.teamRows ?? []) {
    if (row.booking_id !== input.booking.id || row.assignment_date !== input.workDate || row.staff_id === input.workerStaffId || seen.has(row.staff_id)) continue;
    seen.add(row.staff_id);
    const staff = input.staffById?.get(row.staff_id); const displayName = text(staff?.name, WORK_ORDER_LIMITS.displayName);
    if (!displayName) { bump(gaps, 'team_member_unnamed'); continue; }
    const roleLabel = label(staff?.role);
    out.push({ memberId: row.staff_id, displayName, ...(roleLabel ? { roleLabel } : {}) });
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName, 'sv')).slice(0, WORK_ORDER_LIMITS.team);
};

const buildContacts = (input: WorkOrderBuildInput, gaps: WorkOrderGaps): WorkOrderContact[] => {
  const out: WorkOrderContact[] = [];
  const contactName = text(input.booking.contact_name, WORK_ORDER_LIMITS.displayName);
  const phone = text(input.booking.contact_phone, WORK_ORDER_LIMITS.phone);
  if (contactName) out.push({ contactId: `booking:${input.booking.id}:delivery`, role: 'site', displayName: contactName, ...(phone ? { phone } : {}) });
  else if (phone || text(input.booking.contact_email)) bump(gaps, 'contact_name_missing');
  const leaderRaw = label(input.project?.project_leader);
  if (leaderRaw) {
    const staff = input.staffById?.get(leaderRaw);
    const staffName = text(staff?.name, WORK_ORDER_LIMITS.displayName);
    if (staffName) out.push({ contactId: `staff:${staff?.id ?? leaderRaw}`, role: 'lead', displayName: staffName, ...(text(staff?.phone, WORK_ORDER_LIMITS.phone) ? { phone: text(staff?.phone, WORK_ORDER_LIMITS.phone) } : {}) });
    else if (!UUID_LIKE.test(leaderRaw)) out.push({ contactId: `project:${input.project?.id ?? 'unknown'}:leader`, role: 'lead', displayName: leaderRaw });
    else bump(gaps, 'project_leader_unresolved');
  }
  return out.slice(0, WORK_ORDER_LIMITS.contacts);
};

export const buildWorkOrderV1 = (input: WorkOrderBuildInput): WorkOrderBuildResult => {
  const gaps: WorkOrderGaps = {};
  const phases = buildPhases(input, gaps);
  const lines = buildLines(input, gaps);
  const instructions = buildInstructions(input);
  const tasks = buildTasks(input, gaps);
  const files = buildFiles(input, gaps);
  const team = buildTeam(input, gaps);
  const contacts = buildContacts(input, gaps);
  if (![phases, lines, instructions, tasks, files, team, contacts].some((section) => section.length > 0)) {
    bump(gaps, 'work_order_empty');
    return { workOrder: null, gaps };
  }
  const workOrder: WorkOrderV1 = {
    contract: WORK_ORDER_SCHEMA,
    ...(phases.length ? { phases } : {}),
    ...(lines.length ? { lines } : {}),
    ...(instructions.length ? { instructions } : {}),
    ...(tasks.length ? { tasks } : {}),
    ...(files.length ? { files } : {}),
    ...(team.length ? { team } : {}),
    ...(contacts.length ? { contacts } : {}),
  };
  try { assertWorkOrderV1(workOrder); }
  catch (error) { bump(gaps, `work_order_guard_failed:${(error as Error).message.slice(0, 80)}`); return { workOrder: null, gaps }; }
  return { workOrder, gaps };
};

export const mergeWorkOrderGaps = (all: readonly WorkOrderGaps[]): Array<{ code: string; count: number }> => {
  const merged: WorkOrderGaps = {};
  for (const gaps of all) for (const [code, count] of Object.entries(gaps)) bump(merged, code, count);
  return Object.entries(merged).map(([code, count]) => ({ code, count })).sort((a, b) => a.code.localeCompare(b.code));
};
