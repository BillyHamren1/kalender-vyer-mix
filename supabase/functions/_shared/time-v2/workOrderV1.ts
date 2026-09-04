/**
 * Planning-side emitter contract for Time V2 `work-order.v1`
 * (`assignments[].workOrder` on the signed `worker.assignments.sync` /
 * `work-context.v1` boundary).
 *
 * Pinned by the Time contract (field-relevant work order, strict parser):
 *  - phases[]        kind rig|event|teardown, startsAt/endsAt WITH explicit offset
 *  - lines[]         id, kind booking|product|package, label, quantity,
 *                    unit, optional note, optional parentLineId
 *  - instructions[]  practical field instructions
 *  - tasks[]         ONLY tasks assigned to the receiving worker
 *  - files[]         real HTTPS url, name, kind
 *  - team[]          colleagues on the same booking/day
 *  - contacts[]      field-relevant contacts
 *
 * Structurally excluded — never part of this module's types or output:
 * prices, costs, margins, VAT/discount, economics, salaries/rates and any
 * internal admin notes (`internalnotes`, `cost_notes`, `economics_data`).
 *
 * Pure module: no I/O, no Deno APIs. Usable from the Edge runtime and vitest.
 */

export const WORK_ORDER_SCHEMA = 'work-order.v1' as const;

export const WORK_ORDER_PHASE_KINDS = ['rig', 'event', 'teardown'] as const;
export type WorkOrderPhaseKind = (typeof WORK_ORDER_PHASE_KINDS)[number];

export const WORK_ORDER_LINE_KINDS = ['booking', 'product', 'package'] as const;
export type WorkOrderLineKind = (typeof WORK_ORDER_LINE_KINDS)[number];

export const WORK_ORDER_FILE_KINDS = ['image', 'document'] as const;
export type WorkOrderFileKind = (typeof WORK_ORDER_FILE_KINDS)[number];

export interface WorkOrderPhase {
  readonly kind: WorkOrderPhaseKind;
  /** ISO-8601 with explicit Europe/Stockholm offset, e.g. 2026-06-04T07:00:00+02:00 */
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface WorkOrderLine {
  readonly id: string;
  readonly kind: WorkOrderLineKind;
  readonly label: string;
  readonly quantity: number;
  /** Omitted when Planning has no unit for the row — never invented. */
  readonly unit?: string;
  readonly note?: string;
  readonly parentLineId?: string;
}

export interface WorkOrderTask {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
  readonly note?: string;
}

export interface WorkOrderFile {
  readonly url: string;
  readonly name: string;
  readonly kind: WorkOrderFileKind;
}

export interface WorkOrderTeamMember {
  readonly name: string;
  readonly role?: string;
}

export interface WorkOrderContact {
  readonly name: string;
  readonly role?: string;
  readonly phone?: string;
  readonly email?: string;
}

/** Every section is optional: a section is omitted when Planning holds no source data for it. */
export interface WorkOrderV1 {
  readonly phases?: readonly WorkOrderPhase[];
  readonly lines?: readonly WorkOrderLine[];
  readonly instructions?: readonly string[];
  readonly tasks?: readonly WorkOrderTask[];
  readonly files?: readonly WorkOrderFile[];
  readonly team?: readonly WorkOrderTeamMember[];
  readonly contacts?: readonly WorkOrderContact[];
}

/** Exact allowed keys per object path — mirrors the strictness of Time's parsers. */
export const WORK_ORDER_V1_KEYS = {
  root: ['phases', 'lines', 'instructions', 'tasks', 'files', 'team', 'contacts'],
  phase: ['kind', 'startsAt', 'endsAt'],
  line: ['id', 'kind', 'label', 'quantity', 'unit', 'note', 'parentLineId'],
  task: ['id', 'title', 'completed', 'note'],
  file: ['url', 'name', 'kind'],
  teamMember: ['name', 'role'],
  contact: ['name', 'role', 'phone', 'email'],
} as const;

/** Bounds applied on the Planning side so a work order can never blow up the sync payload. */
export const WORK_ORDER_LIMITS = {
  maxPhases: 20,
  maxLines: 500,
  maxInstructions: 50,
  maxTasks: 100,
  maxFiles: 100,
  maxTeam: 100,
  maxContacts: 20,
  maxLabelLength: 240,
  maxTextLength: 2_000,
} as const;

/**
 * Terms that must never appear as a key anywhere inside an emitted work order.
 * Used by the Planning-side guard and locked by contract tests.
 */
export const WORK_ORDER_FORBIDDEN_KEY_TERMS = [
  'price', 'cost', 'margin', 'vat', 'discount', 'economics', 'salary', 'rate',
  'internalnotes', 'internal_notes', 'purchase', 'revenue', 'invoice',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const assertKeys = (value: Record<string, unknown>, allowed: readonly string[], path: string) => {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) throw new Error(`${path}: unexpected field(s): ${unexpected.join(', ')}`);
  for (const key of Object.keys(value)) {
    const lower = key.toLowerCase();
    if (WORK_ORDER_FORBIDDEN_KEY_TERMS.some((term) => lower.includes(term))) {
      throw new Error(`${path}: forbidden field: ${key}`);
    }
  }
};

const assertArrayOf = (
  value: unknown,
  path: string,
  max: number,
  check: (item: unknown, itemPath: string) => void,
) => {
  if (!Array.isArray(value)) throw new Error(`${path}: must be an array`);
  if (value.length === 0) throw new Error(`${path}: empty sections must be omitted`);
  if (value.length > max) throw new Error(`${path}: at most ${max} entries`);
  value.forEach((item, index) => check(item, `${path}[${index}]`));
};

const requireText = (value: unknown, path: string, max: number) => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path}: must be a non-empty string`);
  if (value.length > max) throw new Error(`${path}: at most ${max} characters`);
};

const optionalText = (value: unknown, path: string, max: number) => {
  if (value === undefined) return;
  requireText(value, path, max);
};

const OFFSET_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

/**
 * Planning-side guard: throws when an emitted work order deviates from the
 * contract (unknown keys, forbidden terms, empty sections, invented values).
 * The sync never sends a work order that fails this guard.
 */
export function assertWorkOrderV1(value: unknown, path = 'workOrder'): asserts value is WorkOrderV1 {
  if (!isRecord(value)) throw new Error(`${path}: must be an object`);
  assertKeys(value, WORK_ORDER_V1_KEYS.root, path);
  if (Object.keys(value).length === 0) throw new Error(`${path}: an empty work order must be omitted`);

  if (value.phases !== undefined) {
    assertArrayOf(value.phases, `${path}.phases`, WORK_ORDER_LIMITS.maxPhases, (item, p) => {
      if (!isRecord(item)) throw new Error(`${p}: must be an object`);
      assertKeys(item, WORK_ORDER_V1_KEYS.phase, p);
      if (!WORK_ORDER_PHASE_KINDS.includes(item.kind as WorkOrderPhaseKind)) throw new Error(`${p}.kind: invalid`);
      for (const key of ['startsAt', 'endsAt'] as const) {
        if (typeof item[key] !== 'string' || !OFFSET_ISO.test(item[key] as string)) {
          throw new Error(`${p}.${key}: must be ISO-8601 with explicit offset`);
        }
      }
      if (Date.parse(item.startsAt as string) >= Date.parse(item.endsAt as string)) {
        throw new Error(`${p}: startsAt must be before endsAt`);
      }
    });
  }

  if (value.lines !== undefined) {
    const ids = new Set<string>();
    assertArrayOf(value.lines, `${path}.lines`, WORK_ORDER_LIMITS.maxLines, (item, p) => {
      if (!isRecord(item)) throw new Error(`${p}: must be an object`);
      assertKeys(item, WORK_ORDER_V1_KEYS.line, p);
      requireText(item.id, `${p}.id`, WORK_ORDER_LIMITS.maxLabelLength);
      if (ids.has(item.id as string)) throw new Error(`${p}.id: duplicate`);
      ids.add(item.id as string);
      if (!WORK_ORDER_LINE_KINDS.includes(item.kind as WorkOrderLineKind)) throw new Error(`${p}.kind: invalid`);
      requireText(item.label, `${p}.label`, WORK_ORDER_LIMITS.maxLabelLength);
      if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity < 0) {
        throw new Error(`${p}.quantity: must be a finite non-negative number`);
      }
      optionalText(item.unit, `${p}.unit`, 40);
      optionalText(item.note, `${p}.note`, WORK_ORDER_LIMITS.maxTextLength);
      optionalText(item.parentLineId, `${p}.parentLineId`, WORK_ORDER_LIMITS.maxLabelLength);
    });
    for (const line of value.lines as WorkOrderLine[]) {
      if (line.parentLineId !== undefined && !ids.has(line.parentLineId)) {
        throw new Error(`${path}.lines: parentLineId ${line.parentLineId} does not reference a line`);
      }
    }
  }

  if (value.instructions !== undefined) {
    assertArrayOf(value.instructions, `${path}.instructions`, WORK_ORDER_LIMITS.maxInstructions, (item, p) =>
      requireText(item, p, WORK_ORDER_LIMITS.maxTextLength));
  }

  if (value.tasks !== undefined) {
    assertArrayOf(value.tasks, `${path}.tasks`, WORK_ORDER_LIMITS.maxTasks, (item, p) => {
      if (!isRecord(item)) throw new Error(`${p}: must be an object`);
      assertKeys(item, WORK_ORDER_V1_KEYS.task, p);
      requireText(item.id, `${p}.id`, WORK_ORDER_LIMITS.maxLabelLength);
      requireText(item.title, `${p}.title`, WORK_ORDER_LIMITS.maxLabelLength);
      if (typeof item.completed !== 'boolean') throw new Error(`${p}.completed: must be boolean`);
      optionalText(item.note, `${p}.note`, WORK_ORDER_LIMITS.maxTextLength);
    });
  }

  if (value.files !== undefined) {
    assertArrayOf(value.files, `${path}.files`, WORK_ORDER_LIMITS.maxFiles, (item, p) => {
      if (!isRecord(item)) throw new Error(`${p}: must be an object`);
      assertKeys(item, WORK_ORDER_V1_KEYS.file, p);
      if (typeof item.url !== 'string' || !isHttpsUrl(item.url)) throw new Error(`${p}.url: must be an https URL`);
      requireText(item.name, `${p}.name`, WORK_ORDER_LIMITS.maxLabelLength);
      if (!WORK_ORDER_FILE_KINDS.includes(item.kind as WorkOrderFileKind)) throw new Error(`${p}.kind: invalid`);
    });
  }

  if (value.team !== undefined) {
    assertArrayOf(value.team, `${path}.team`, WORK_ORDER_LIMITS.maxTeam, (item, p) => {
      if (!isRecord(item)) throw new Error(`${p}: must be an object`);
      assertKeys(item, WORK_ORDER_V1_KEYS.teamMember, p);
      requireText(item.name, `${p}.name`, WORK_ORDER_LIMITS.maxLabelLength);
      optionalText(item.role, `${p}.role`, WORK_ORDER_LIMITS.maxLabelLength);
    });
  }

  if (value.contacts !== undefined) {
    assertArrayOf(value.contacts, `${path}.contacts`, WORK_ORDER_LIMITS.maxContacts, (item, p) => {
      if (!isRecord(item)) throw new Error(`${p}: must be an object`);
      assertKeys(item, WORK_ORDER_V1_KEYS.contact, p);
      requireText(item.name, `${p}.name`, WORK_ORDER_LIMITS.maxLabelLength);
      optionalText(item.role, `${p}.role`, WORK_ORDER_LIMITS.maxLabelLength);
      optionalText(item.phone, `${p}.phone`, 60);
      optionalText(item.email, `${p}.email`, WORK_ORDER_LIMITS.maxLabelLength);
    });
  }
}

export const isHttpsUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Europe/Stockholm offset conversion (DST-safe, device-timezone independent).
// ---------------------------------------------------------------------------

export const WORK_ORDER_TIME_ZONE = 'Europe/Stockholm' as const;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: WORK_ORDER_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'longOffset',
});

/**
 * Converts any parseable instant (Postgres timestamptz text, ISO with Z or
 * offset) to the SAME instant expressed with the explicit Europe/Stockholm
 * offset valid at that instant. Returns null for unparseable input.
 */
export const toStockholmOffsetIso = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const parts = partsFormatter.formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const offsetRaw = get('timeZoneName'); // "GMT+02:00" | "GMT+01:00" | "GMT"
  const offsetMatch = offsetRaw.match(/^GMT([+-]\d{2}:\d{2})?$/);
  if (!offsetMatch) return null;
  const offset = offsetMatch[1] ?? '+00:00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}${offset}`;
};
