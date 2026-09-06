// Canonical Planning-side mirror of Time's work-order.v1 wire contract.
// Keep this file structurally aligned with eventflow-time
// supabase/functions/_shared/work-order-v1.ts.

export const WORK_ORDER_SCHEMA = 'work-order.v1' as const;
export const WORK_ORDER_CONTRACT = WORK_ORDER_SCHEMA;

export const WORK_ORDER_PHASE_KINDS = ['rig', 'event', 'derig'] as const;
export const WORK_ORDER_PHASE_CODES = WORK_ORDER_PHASE_KINDS;
export type WorkOrderPhaseKind = (typeof WORK_ORDER_PHASE_KINDS)[number];
export type WorkOrderPhaseCode = WorkOrderPhaseKind;

export const WORK_ORDER_LINE_KINDS = ['booking', 'product', 'package'] as const;
export type WorkOrderLineKind = (typeof WORK_ORDER_LINE_KINDS)[number];

export const WORK_ORDER_FILE_KINDS = ['image', 'document'] as const;
export type WorkOrderFileKind = (typeof WORK_ORDER_FILE_KINDS)[number];

export const WORK_ORDER_CONTACT_ROLES = ['site', 'customer', 'production', 'lead'] as const;
export type WorkOrderContactRole = (typeof WORK_ORDER_CONTACT_ROLES)[number];

export interface WorkOrderPhase {
  readonly phase: WorkOrderPhaseKind;
  readonly label?: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface WorkOrderLine {
  readonly lineId: string;
  readonly kind: WorkOrderLineKind;
  readonly label: string;
  readonly quantity: string;
  readonly unit: string;
  readonly note?: string;
  readonly parentLineId?: string;
}

export interface WorkOrderInstruction {
  readonly instructionId: string;
  readonly label: string;
  readonly body: string;
}

export interface WorkOrderTask {
  readonly taskId: string;
  readonly label: string;
  readonly note?: string;
  readonly phase?: WorkOrderPhaseKind;
}

export interface WorkOrderFile {
  readonly fileId: string;
  readonly kind: WorkOrderFileKind;
  readonly label: string;
  readonly url: string;
  readonly thumbnailUrl?: string;
  readonly mimeType?: string;
}

export interface WorkOrderTeamMember {
  readonly memberId: string;
  readonly displayName: string;
  readonly roleLabel?: string;
}

export interface WorkOrderContact {
  readonly contactId: string;
  readonly role: WorkOrderContactRole;
  readonly displayName: string;
  readonly phone?: string;
}

export interface WorkOrderV1 {
  readonly contract: typeof WORK_ORDER_SCHEMA;
  readonly summary?: string;
  readonly phases?: readonly WorkOrderPhase[];
  readonly lines?: readonly WorkOrderLine[];
  readonly instructions?: readonly WorkOrderInstruction[];
  readonly tasks?: readonly WorkOrderTask[];
  readonly files?: readonly WorkOrderFile[];
  readonly team?: readonly WorkOrderTeamMember[];
  readonly contacts?: readonly WorkOrderContact[];
}

export const WORK_ORDER_V1_KEYS = {
  root: ['contract', 'summary', 'phases', 'lines', 'instructions', 'tasks', 'files', 'team', 'contacts'],
  phase: ['phase', 'label', 'startsAt', 'endsAt'],
  line: ['lineId', 'kind', 'label', 'quantity', 'unit', 'note', 'parentLineId'],
  instruction: ['instructionId', 'label', 'body'],
  task: ['taskId', 'label', 'note', 'phase'],
  file: ['fileId', 'kind', 'label', 'url', 'thumbnailUrl', 'mimeType'],
  teamMember: ['memberId', 'displayName', 'roleLabel'],
  contact: ['contactId', 'role', 'displayName', 'phone'],
} as const;

export const WORK_ORDER_LIMITS = {
  summary: 2_000,
  identifier: 180,
  label: 240,
  note: 1_000,
  body: 4_000,
  unit: 40,
  displayName: 160,
  phone: 80,
  url: 2_000,
  mimeType: 120,
  phases: 3,
  lines: 300,
  instructions: 30,
  tasks: 100,
  files: 50,
  team: 60,
  contacts: 20,
  // Backwards-compatible aliases used by the Planning builder/tests.
  maxPhases: 3,
  maxLines: 300,
  maxInstructions: 30,
  maxTasks: 100,
  maxFiles: 50,
  maxTeam: 60,
  maxContacts: 20,
  maxLabelLength: 240,
  maxTextLength: 2_000,
} as const;

export const WORK_ORDER_FORBIDDEN_KEY_TERMS = [
  'price', 'cost', 'margin', 'vat', 'discount', 'economics', 'salary', 'rate',
  'internalnotes', 'internal_notes', 'purchase', 'revenue', 'invoice',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requireText = (value: unknown, path: string, max: number): string => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path}: must be a non-empty string`);
  if (value.length > max) throw new Error(`${path}: at most ${max} characters`);
  return value;
};

const optionalText = (value: unknown, path: string, max: number) => {
  if (value !== undefined) requireText(value, path, max);
};

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

const assertArray = (value: unknown, path: string, max: number): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${path}: must be an array`);
  if (value.length === 0) throw new Error(`${path}: empty sections must be omitted`);
  if (value.length > max) throw new Error(`${path}: at most ${max} entries`);
  return value;
};

const OFFSET_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})$/;
const QUANTITY = /^\d{1,9}(\.\d{1,3})?$/;

export function assertWorkOrderV1(value: unknown, path = 'workOrder'): asserts value is WorkOrderV1 {
  if (!isRecord(value)) throw new Error(`${path}: must be an object`);
  assertKeys(value, WORK_ORDER_V1_KEYS.root, path);
  if (value.contract !== WORK_ORDER_SCHEMA) throw new Error(`${path}.contract: unsupported contract version`);

  let hasContent = typeof value.summary === 'string' && value.summary.trim() !== '';
  optionalText(value.summary, `${path}.summary`, WORK_ORDER_LIMITS.summary);

  if (value.phases !== undefined) {
    const seen = new Set<string>();
    for (const [i, raw] of assertArray(value.phases, `${path}.phases`, WORK_ORDER_LIMITS.phases).entries()) {
      const p = `${path}.phases[${i}]`;
      if (!isRecord(raw)) throw new Error(`${p}: must be an object`);
      assertKeys(raw, WORK_ORDER_V1_KEYS.phase, p);
      const phase = raw.phase;
      if (typeof phase !== 'string' || !WORK_ORDER_PHASE_KINDS.includes(phase as WorkOrderPhaseKind)) throw new Error(`${p}.phase: invalid`);
      if (seen.has(phase)) throw new Error(`${p}.phase: duplicate`);
      seen.add(phase);
      optionalText(raw.label, `${p}.label`, WORK_ORDER_LIMITS.label);
      for (const key of ['startsAt', 'endsAt'] as const) {
        const timestamp = requireText(raw[key], `${p}.${key}`, 64);
        if (!OFFSET_ISO.test(timestamp) || Number.isNaN(Date.parse(timestamp))) throw new Error(`${p}.${key}: must be ISO-8601 with explicit offset`);
      }
      if (Date.parse(String(raw.startsAt)) >= Date.parse(String(raw.endsAt))) throw new Error(`${p}: startsAt must be before endsAt`);
    }
    hasContent = true;
  }

  if (value.lines !== undefined) {
    const ids = new Set<string>();
    const packages = new Set<string>();
    const lines = assertArray(value.lines, `${path}.lines`, WORK_ORDER_LIMITS.lines);
    for (const [i, raw] of lines.entries()) {
      const p = `${path}.lines[${i}]`;
      if (!isRecord(raw)) throw new Error(`${p}: must be an object`);
      assertKeys(raw, WORK_ORDER_V1_KEYS.line, p);
      const id = requireText(raw.lineId, `${p}.lineId`, WORK_ORDER_LIMITS.identifier);
      if (ids.has(id)) throw new Error(`${p}.lineId: duplicate`);
      ids.add(id);
      if (typeof raw.kind !== 'string' || !WORK_ORDER_LINE_KINDS.includes(raw.kind as WorkOrderLineKind)) throw new Error(`${p}.kind: invalid`);
      if (raw.kind === 'package') packages.add(id);
      requireText(raw.label, `${p}.label`, WORK_ORDER_LIMITS.label);
      const quantity = requireText(raw.quantity, `${p}.quantity`, 16);
      if (!QUANTITY.test(quantity)) throw new Error(`${p}.quantity: invalid exact decimal`);
      requireText(raw.unit, `${p}.unit`, WORK_ORDER_LIMITS.unit);
      optionalText(raw.note, `${p}.note`, WORK_ORDER_LIMITS.note);
      optionalText(raw.parentLineId, `${p}.parentLineId`, WORK_ORDER_LIMITS.identifier);
    }
    for (const [i, raw] of lines.entries()) {
      const row = raw as Record<string, unknown>;
      if (row.parentLineId !== undefined && (!packages.has(String(row.parentLineId)) || row.parentLineId === row.lineId)) {
        throw new Error(`${path}.lines[${i}].parentLineId: must reference a package line`);
      }
    }
    hasContent = true;
  }

  if (value.instructions !== undefined) {
    const ids = new Set<string>();
    for (const [i, raw] of assertArray(value.instructions, `${path}.instructions`, WORK_ORDER_LIMITS.instructions).entries()) {
      const p = `${path}.instructions[${i}]`;
      if (!isRecord(raw)) throw new Error(`${p}: must be an object`);
      assertKeys(raw, WORK_ORDER_V1_KEYS.instruction, p);
      const id = requireText(raw.instructionId, `${p}.instructionId`, WORK_ORDER_LIMITS.identifier);
      if (ids.has(id)) throw new Error(`${p}.instructionId: duplicate`);
      ids.add(id);
      requireText(raw.label, `${p}.label`, WORK_ORDER_LIMITS.label);
      requireText(raw.body, `${p}.body`, WORK_ORDER_LIMITS.body);
    }
    hasContent = true;
  }

  if (value.tasks !== undefined) {
    const ids = new Set<string>();
    for (const [i, raw] of assertArray(value.tasks, `${path}.tasks`, WORK_ORDER_LIMITS.tasks).entries()) {
      const p = `${path}.tasks[${i}]`;
      if (!isRecord(raw)) throw new Error(`${p}: must be an object`);
      assertKeys(raw, WORK_ORDER_V1_KEYS.task, p);
      const id = requireText(raw.taskId, `${p}.taskId`, WORK_ORDER_LIMITS.identifier);
      if (ids.has(id)) throw new Error(`${p}.taskId: duplicate`);
      ids.add(id);
      requireText(raw.label, `${p}.label`, WORK_ORDER_LIMITS.label);
      optionalText(raw.note, `${p}.note`, WORK_ORDER_LIMITS.note);
      if (raw.phase !== undefined && (typeof raw.phase !== 'string' || !WORK_ORDER_PHASE_KINDS.includes(raw.phase as WorkOrderPhaseKind))) throw new Error(`${p}.phase: invalid`);
    }
    hasContent = true;
  }

  if (value.files !== undefined) {
    const ids = new Set<string>();
    for (const [i, raw] of assertArray(value.files, `${path}.files`, WORK_ORDER_LIMITS.files).entries()) {
      const p = `${path}.files[${i}]`;
      if (!isRecord(raw)) throw new Error(`${p}: must be an object`);
      assertKeys(raw, WORK_ORDER_V1_KEYS.file, p);
      const id = requireText(raw.fileId, `${p}.fileId`, WORK_ORDER_LIMITS.identifier);
      if (ids.has(id)) throw new Error(`${p}.fileId: duplicate`);
      ids.add(id);
      if (typeof raw.kind !== 'string' || !WORK_ORDER_FILE_KINDS.includes(raw.kind as WorkOrderFileKind)) throw new Error(`${p}.kind: invalid`);
      requireText(raw.label, `${p}.label`, WORK_ORDER_LIMITS.label);
      if (typeof raw.url !== 'string' || !isHttpsUrl(raw.url)) throw new Error(`${p}.url: must be an https URL`);
      if (raw.thumbnailUrl !== undefined && (typeof raw.thumbnailUrl !== 'string' || !isHttpsUrl(raw.thumbnailUrl))) throw new Error(`${p}.thumbnailUrl: must be an https URL`);
      optionalText(raw.mimeType, `${p}.mimeType`, WORK_ORDER_LIMITS.mimeType);
    }
    hasContent = true;
  }

  if (value.team !== undefined) {
    const ids = new Set<string>();
    for (const [i, raw] of assertArray(value.team, `${path}.team`, WORK_ORDER_LIMITS.team).entries()) {
      const p = `${path}.team[${i}]`;
      if (!isRecord(raw)) throw new Error(`${p}: must be an object`);
      assertKeys(raw, WORK_ORDER_V1_KEYS.teamMember, p);
      const id = requireText(raw.memberId, `${p}.memberId`, WORK_ORDER_LIMITS.identifier);
      if (ids.has(id)) throw new Error(`${p}.memberId: duplicate`);
      ids.add(id);
      requireText(raw.displayName, `${p}.displayName`, WORK_ORDER_LIMITS.displayName);
      optionalText(raw.roleLabel, `${p}.roleLabel`, WORK_ORDER_LIMITS.label);
    }
    hasContent = true;
  }

  if (value.contacts !== undefined) {
    const ids = new Set<string>();
    for (const [i, raw] of assertArray(value.contacts, `${path}.contacts`, WORK_ORDER_LIMITS.contacts).entries()) {
      const p = `${path}.contacts[${i}]`;
      if (!isRecord(raw)) throw new Error(`${p}: must be an object`);
      assertKeys(raw, WORK_ORDER_V1_KEYS.contact, p);
      const id = requireText(raw.contactId, `${p}.contactId`, WORK_ORDER_LIMITS.identifier);
      if (ids.has(id)) throw new Error(`${p}.contactId: duplicate`);
      ids.add(id);
      if (typeof raw.role !== 'string' || !WORK_ORDER_CONTACT_ROLES.includes(raw.role as WorkOrderContactRole)) throw new Error(`${p}.role: invalid`);
      requireText(raw.displayName, `${p}.displayName`, WORK_ORDER_LIMITS.displayName);
      optionalText(raw.phone, `${p}.phone`, WORK_ORDER_LIMITS.phone);
    }
    hasContent = true;
  }

  if (!hasContent) throw new Error(`${path}: an empty work order must be omitted`);
}

export const isHttpsUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
};

export const WORK_ORDER_TIME_ZONE = 'Europe/Stockholm' as const;
const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: WORK_ORDER_TIME_ZONE,
  hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'longOffset',
});

export const toStockholmOffsetIso = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const parts = partsFormatter.formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const offsetRaw = get('timeZoneName');
  const offsetMatch = offsetRaw.match(/^GMT([+-]\d{2}:\d{2})?$/);
  if (!offsetMatch) return null;
  const offset = offsetMatch[1] ?? '+00:00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}${offset}`;
};
