/**
 * Builds one `work-order.v1` document from REAL Planning source rows for one
 * assignment (worker × booking × workDate). Pure: no I/O.
 *
 * Rules (pinned by tests):
 *  - only existing Planning data is mapped — nothing is invented; a section
 *    without source data is omitted and the reason is reported as a gap,
 *  - phases come from Planning's SAVED time fields (bookings.<phase>_start/
 *    end_time + calendar_events extra days) converted to Europe/Stockholm offset,
 *  - lines keep quantity, row note and package parent; `unit` is omitted
 *    because Planning has no unit source (reported as gap),
 *  - tasks are ONLY the receiving worker's own tasks,
 *  - files are only real HTTPS URLs,
 *  - costs, prices, margins, VAT/discount and internal notes are never read.
 */

import {
  assertWorkOrderV1,
  isHttpsUrl,
  toStockholmOffsetIso,
  WORK_ORDER_LIMITS,
  type WorkOrderContact,
  type WorkOrderFile,
  type WorkOrderFileKind,
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
  /** booking_attachments.booking_id */
  readonly booking_id?: string | null;
  /** project_files.project_id */
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

/** Aggregated, PII-free gap counters for one built work order. */
export type WorkOrderGaps = Record<string, number>;

export interface WorkOrderBuildResult {
  readonly workOrder: WorkOrderV1 | null;
  readonly gaps: WorkOrderGaps;
}

// ---------------------------------------------------------------------------

const text = (value: unknown, max = WORK_ORDER_LIMITS.maxTextLength): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
};

const label = (value: unknown) => text(value, WORK_ORDER_LIMITS.maxLabelLength);

const bump = (gaps: WorkOrderGaps, code: string, by = 1) => {
  if (by > 0) gaps[code] = (gaps[code] ?? 0) + by;
};

const includesWorker = (row: { assigned_to?: string | null; assigned_to_ids?: readonly string[] | null }, staffId: string) =>
  (Array.isArray(row.assigned_to_ids) && row.assigned_to_ids.includes(staffId)) || row.assigned_to === staffId;

const compareNullableNumber = (a: number | null | undefined, b: number | null | undefined) => {
  const av = typeof a === 'number' && Number.isFinite(a) ? a : Number.POSITIVE_INFINITY;
  const bv = typeof b === 'number' && Number.isFinite(b) ? b : Number.POSITIVE_INFINITY;
  return av - bv;
};

// Same hierarchy-prefix cleaner as Planning's ProjectProductsList.cleanName.
const HIERARCHY_PREFIX = /^(?:L,|--|[↳└→✓\u21B3\u2514\u2192\u2713\-–\s])+\s*/;
const cleanLineName = (name: string) => name.replace(HIERARCHY_PREFIX, '').trim();

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

const CALENDAR_PHASE_KIND: Record<string, WorkOrderPhaseKind> = { rig: 'rig', event: 'event', rigDown: 'teardown' };
const PHASE_ORDER: Record<WorkOrderPhaseKind, number> = { rig: 0, event: 1, teardown: 2 };

const buildPhases = (input: WorkOrderBuildInput, gaps: WorkOrderGaps): WorkOrderPhase[] => {
  const { booking } = input;
  const out = new Map<string, WorkOrderPhase>();
  const push = (kind: WorkOrderPhaseKind, start: unknown, end: unknown, failCode: string) => {
    const startsAt = toStockholmOffsetIso(start);
    const endsAt = toStockholmOffsetIso(end);
    if (!startsAt || !endsAt || Date.parse(startsAt) >= Date.parse(endsAt)) {
      bump(gaps, failCode);
      return;
    }
    out.set(`${kind}|${startsAt}|${endsAt}`, { kind, startsAt, endsAt });
  };

  const canonical: Array<[WorkOrderPhaseKind, unknown, unknown, unknown]> = [
    ['rig', booking.rig_start_time, booking.rig_end_time, booking.rigdaydate],
    ['event', booking.event_start_time, booking.event_end_time, booking.eventdate],
    ['teardown', booking.rigdown_start_time, booking.rigdown_end_time, booking.rigdowndate],
  ];
  for (const [kind, start, end, date] of canonical) {
    const hasStart = typeof start === 'string' && start.trim() !== '';
    const hasEnd = typeof end === 'string' && end.trim() !== '';
    if (hasStart && hasEnd) push(kind, start, end, `phase_invalid:${kind}`);
    else if (hasStart || hasEnd || (typeof date === 'string' && date)) bump(gaps, `phase_times_missing:${kind}`);
  }

  for (const row of input.calendarPhases ?? []) {
    if (row.booking_id !== booking.id) continue;
    const kind = CALENDAR_PHASE_KIND[String(row.event_type ?? '')];
    if (!kind) continue;
    push(kind, row.start_time, row.end_time, `phase_invalid:${kind}`);
  }

  const phases = [...out.values()].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt) || PHASE_ORDER[a.kind] - PHASE_ORDER[b.kind]);
  if (phases.length > WORK_ORDER_LIMITS.maxPhases) {
    bump(gaps, 'phases_truncated', phases.length - WORK_ORDER_LIMITS.maxPhases);
    return phases.slice(0, WORK_ORDER_LIMITS.maxPhases);
  }
  return phases;
};

// ---------------------------------------------------------------------------
// Lines (booking rows / products / packages)
// ---------------------------------------------------------------------------

const buildLines = (input: WorkOrderBuildInput, gaps: WorkOrderGaps): WorkOrderLine[] => {
  const rows = (input.products ?? [])
    .filter((row) => row.booking_id === input.booking.id && !row.source_missing_since)
    .slice()
    .sort((a, b) =>
      compareNullableNumber(a.sort_index, b.sort_index) ||
      String(a.name ?? '').localeCompare(String(b.name ?? ''), 'sv') ||
      a.id.localeCompare(b.id));
  if (rows.length === 0) return [];

  const byId = new Map(rows.map((row) => [row.id, row]));
  const rowIdByInventoryPackage = new Map<string, string>();
  for (const row of rows) {
    if (row.inventory_package_id && row.is_package_component !== true && !rowIdByInventoryPackage.has(row.inventory_package_id)) {
      rowIdByInventoryPackage.set(row.inventory_package_id, row.id);
    }
  }

  const resolveParent = (row: WorkOrderProductRow): string | undefined => {
    if (row.parent_product_id && byId.has(row.parent_product_id) && row.parent_product_id !== row.id) return row.parent_product_id;
    if (row.parent_package_id) {
      if (byId.has(row.parent_package_id) && row.parent_package_id !== row.id) return row.parent_package_id;
      const viaInventory = rowIdByInventoryPackage.get(row.parent_package_id);
      if (viaInventory && viaInventory !== row.id) return viaInventory;
    }
    return undefined;
  };

  const parentIds = new Set<string>();
  const parentOf = new Map<string, string | undefined>();
  for (const row of rows) {
    const parent = resolveParent(row);
    parentOf.set(row.id, parent);
    if (parent) parentIds.add(parent);
    else if (row.parent_product_id || row.parent_package_id) bump(gaps, 'line_parent_unresolved');
  }

  const isPackage = (row: WorkOrderProductRow) =>
    (Array.isArray(row.package_components) && row.package_components.length > 0) ||
    (Boolean(row.inventory_package_id) && row.is_package_component !== true) ||
    (parentIds.has(row.id) && rows.some((child) => parentOf.get(child.id) === row.id && child.is_package_component === true));

  const lines: WorkOrderLine[] = [];
  for (const row of rows) {
    const rawName = label(row.name);
    if (!rawName) {
      bump(gaps, 'line_label_missing');
      continue;
    }
    const quantity = typeof row.quantity === 'number' && Number.isFinite(row.quantity) && row.quantity >= 0
      ? row.quantity
      : null;
    if (quantity === null) {
      bump(gaps, 'line_quantity_invalid');
      continue;
    }
    const parentLineId = parentOf.get(row.id);
    const cleaned = parentLineId ? cleanLineName(rawName) : rawName;
    const line: WorkOrderLine = {
      id: row.id,
      kind: isPackage(row) ? 'package' : 'product',
      label: label(cleaned) ?? rawName,
      quantity,
      ...(text(row.notes) ? { note: text(row.notes) } : {}),
      ...(parentLineId ? { parentLineId } : {}),
    };
    lines.push(line);
  }

  // Planning has no unit column on booking rows; the field is omitted, never invented.
  bump(gaps, 'line_unit_unavailable', lines.length);

  if (lines.length > WORK_ORDER_LIMITS.maxLines) {
    bump(gaps, 'lines_truncated', lines.length - WORK_ORDER_LIMITS.maxLines);
    const kept = lines.slice(0, WORK_ORDER_LIMITS.maxLines);
    const keptIds = new Set(kept.map((line) => line.id));
    return kept.map((line) => (line.parentLineId && !keptIds.has(line.parentLineId)
      ? { ...line, parentLineId: undefined }
      : line)).map((line) => (line.parentLineId === undefined ? stripUndefined(line) : line));
  }
  return lines;
};

const stripUndefined = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

// ---------------------------------------------------------------------------
// Instructions (practical booking flags + exact-time info; never internal notes)
// ---------------------------------------------------------------------------

const buildInstructions = (input: WorkOrderBuildInput): string[] => {
  const { booking } = input;
  const out: string[] = [];
  const exactInfo = text(booking.exact_time_info);
  if (booking.exact_time_needed === true) out.push(exactInfo ? `Exakt tid behövs: ${exactInfo}` : 'Exakt tid behövs');
  else if (exactInfo) out.push(exactInfo);
  if (booking.carry_more_than_10m === true) out.push('Bär mer än 10 m');
  if (booking.ground_nails_allowed === true) out.push('Markpinnar tillåtet');
  if (booking.ground_nails_allowed === false) out.push('Markpinnar ej tillåtet');
  if (booking.customer_pickup === true) out.push('Kund hämtar själv');
  if (booking.rental_only === true) out.push('Endast uthyrning');
  return out.slice(0, WORK_ORDER_LIMITS.maxInstructions);
};

// ---------------------------------------------------------------------------
// Tasks — only the receiving worker's own tasks
// ---------------------------------------------------------------------------

const buildTasks = (input: WorkOrderBuildInput, gaps: WorkOrderGaps): WorkOrderTask[] => {
  const worker = input.workerStaffId;
  const out: Array<WorkOrderTask & { readonly sort: number }> = [];

  for (const row of input.establishmentTasks ?? []) {
    if (row.booking_id !== input.booking.id || row.visible_in_time_app !== true || !includesWorker(row, worker)) continue;
    const title = label(row.title);
    if (!title) {
      bump(gaps, 'task_title_missing');
      continue;
    }
    out.push({
      id: row.id,
      title,
      completed: row.completed === true || row.status === 'done',
      ...(text(row.notes) ? { note: text(row.notes) } : {}),
      sort: typeof row.sort_order === 'number' ? row.sort_order : Number.POSITIVE_INFINITY,
    });
  }

  const projectId = input.project?.id ?? null;
  for (const row of input.projectTasks ?? []) {
    if (!projectId || row.project_id !== projectId || row.is_info_only === true || !includesWorker(row, worker)) continue;
    const title = label(row.title);
    if (!title) {
      bump(gaps, 'task_title_missing');
      continue;
    }
    out.push({
      id: row.id,
      title,
      completed: row.completed === true,
      ...(text(row.description) ? { note: text(row.description) } : {}),
      sort: typeof row.sort_order === 'number' ? row.sort_order : Number.POSITIVE_INFINITY,
    });
  }

  const seen = new Set<string>();
  const tasks = out
    .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title, 'sv') || a.id.localeCompare(b.id))
    .filter((task) => (seen.has(task.id) ? false : (seen.add(task.id), true)))
    .map(({ sort: _sort, ...task }) => task);
  if (tasks.length > WORK_ORDER_LIMITS.maxTasks) {
    bump(gaps, 'tasks_truncated', tasks.length - WORK_ORDER_LIMITS.maxTasks);
    return tasks.slice(0, WORK_ORDER_LIMITS.maxTasks);
  }
  return tasks;
};

// ---------------------------------------------------------------------------
// Files — real HTTPS URLs only
// ---------------------------------------------------------------------------

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|svg)(\?|#|$)/i;

const fileKind = (fileType: unknown, url: string): WorkOrderFileKind => {
  const type = typeof fileType === 'string' ? fileType.toLowerCase() : '';
  if (type.startsWith('image/') || IMAGE_EXT.test(url)) return 'image';
  return 'document';
};

const fileNameFromUrl = (url: string): string | undefined => {
  try {
    const segment = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    return label(decodeURIComponent(segment));
  } catch {
    return undefined;
  }
};

const buildFiles = (input: WorkOrderBuildInput, gaps: WorkOrderGaps): WorkOrderFile[] => {
  const out = new Map<string, WorkOrderFile>();
  const add = (url: unknown, name: unknown, type: unknown) => {
    const href = text(url, 2_048);
    if (!href) return;
    if (!isHttpsUrl(href)) {
      bump(gaps, 'file_not_https');
      return;
    }
    const fileName = label(name) ?? fileNameFromUrl(href);
    if (!fileName) {
      bump(gaps, 'file_name_missing');
      return;
    }
    if (!out.has(href)) out.set(href, { url: href, name: fileName, kind: fileKind(type, href) });
  };

  for (const row of input.attachments ?? []) {
    if (row.booking_id !== input.booking.id) continue;
    add(row.url, row.file_name, row.file_type);
  }
  const projectId = input.project?.id ?? null;
  for (const row of input.projectFiles ?? []) {
    if (!projectId || row.project_id !== projectId) continue;
    add(row.url, row.file_name, row.file_type);
  }
  add(input.booking.map_drawing_url, undefined, undefined);

  const files = [...out.values()];
  if (files.length > WORK_ORDER_LIMITS.maxFiles) {
    bump(gaps, 'files_truncated', files.length - WORK_ORDER_LIMITS.maxFiles);
    return files.slice(0, WORK_ORDER_LIMITS.maxFiles);
  }
  return files;
};

// ---------------------------------------------------------------------------
// Team — colleagues on the same booking and day (never the worker themself)
// ---------------------------------------------------------------------------

const buildTeam = (input: WorkOrderBuildInput, gaps: WorkOrderGaps): WorkOrderTeamMember[] => {
  const staffById = input.staffById ?? new Map<string, WorkOrderStaffRow>();
  const seen = new Set<string>();
  const out: WorkOrderTeamMember[] = [];
  for (const row of input.teamRows ?? []) {
    if (row.booking_id !== input.booking.id || row.assignment_date !== input.workDate) continue;
    if (row.staff_id === input.workerStaffId || seen.has(row.staff_id)) continue;
    seen.add(row.staff_id);
    const staff = staffById.get(row.staff_id);
    const name = label(staff?.name);
    if (!name) {
      bump(gaps, 'team_member_unnamed');
      continue;
    }
    const role = label(staff?.role);
    if (!role) bump(gaps, 'staff_role_missing');
    out.push({ name, ...(role ? { role } : {}) });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  if (out.length > WORK_ORDER_LIMITS.maxTeam) {
    bump(gaps, 'team_truncated', out.length - WORK_ORDER_LIMITS.maxTeam);
    return out.slice(0, WORK_ORDER_LIMITS.maxTeam);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Contacts — delivery contact + project leader (when resolvable to a person)
// ---------------------------------------------------------------------------

const buildContacts = (input: WorkOrderBuildInput, gaps: WorkOrderGaps): WorkOrderContact[] => {
  const out: WorkOrderContact[] = [];
  const { booking } = input;
  const contactName = label(booking.contact_name);
  const phone = text(booking.contact_phone, 60);
  const email = label(booking.contact_email);
  if (contactName) {
    out.push({
      name: contactName,
      role: 'Leveranskontakt',
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
    });
  } else if (phone || email) {
    bump(gaps, 'contact_name_missing');
  }

  const leaderRaw = label(input.project?.project_leader);
  if (leaderRaw) {
    const staff = input.staffById?.get(leaderRaw);
    const staffName = label(staff?.name);
    if (staffName) {
      const staffPhone = text(staff?.phone, 60);
      out.push({ name: staffName, role: 'Projektledare', ...(staffPhone ? { phone: staffPhone } : {}) });
    } else if (!UUID_LIKE.test(leaderRaw)) {
      out.push({ name: leaderRaw, role: 'Projektledare' });
    } else {
      bump(gaps, 'project_leader_unresolved');
    }
  }
  return out.slice(0, WORK_ORDER_LIMITS.maxContacts);
};

// ---------------------------------------------------------------------------

/**
 * Build the work order for one assignment. Returns `workOrder: null` when no
 * section has source data (the sync then omits `workOrder` entirely).
 * The result is validated against the Planning-side contract guard; a guard
 * failure is reported as a gap and the work order is withheld (never sent broken).
 */
export const buildWorkOrderV1 = (input: WorkOrderBuildInput): WorkOrderBuildResult => {
  const gaps: WorkOrderGaps = {};
  const phases = buildPhases(input, gaps);
  const lines = buildLines(input, gaps);
  const instructions = buildInstructions(input);
  const tasks = buildTasks(input, gaps);
  const files = buildFiles(input, gaps);
  const team = buildTeam(input, gaps);
  const contacts = buildContacts(input, gaps);

  const workOrder: WorkOrderV1 = {
    ...(phases.length ? { phases } : {}),
    ...(lines.length ? { lines } : {}),
    ...(instructions.length ? { instructions } : {}),
    ...(tasks.length ? { tasks } : {}),
    ...(files.length ? { files } : {}),
    ...(team.length ? { team } : {}),
    ...(contacts.length ? { contacts } : {}),
  };
  if (Object.keys(workOrder).length === 0) {
    bump(gaps, 'work_order_empty');
    return { workOrder: null, gaps };
  }
  try {
    assertWorkOrderV1(workOrder);
  } catch (error) {
    bump(gaps, `work_order_guard_failed:${(error as Error).message.slice(0, 80)}`);
    return { workOrder: null, gaps };
  }
  return { workOrder, gaps };
};

/** Merge per-assignment gap counters into one PII-free report. */
export const mergeWorkOrderGaps = (all: readonly WorkOrderGaps[]): Array<{ code: string; count: number }> => {
  const merged: WorkOrderGaps = {};
  for (const gaps of all) for (const [code, count] of Object.entries(gaps)) bump(merged, code, count);
  return Object.entries(merged)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => a.code.localeCompare(b.code));
};
