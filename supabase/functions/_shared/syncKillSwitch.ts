/**
 * STEG 4G — GLOBAL KILL SWITCH för normal MUTERANDE Booking → Planning-sync.
 *
 * PRINCIPER
 *  - Default = nuvarande säkra beteende (sync är IGÅNG). Flaggan saknas ⇒ ingen paus.
 *  - Endast server-side env styr flaggan. En REQUEST kan ALDRIG slå av/på den.
 *  - Read-only diagnostik (dry-run) fungerar även när mutationer är pausade.
 *  - Detta är INGEN ny "destructive enable flag" — den kan bara STOPPA, aldrig
 *    tillåta något som annars är blockerat. Cancellation-flaggan i
 *    destructiveSyncFlag.ts lever oförändrad.
 */

export const NORMAL_MUTATING_SYNC_PAUSED_FLAG = 'NORMAL_MUTATING_SYNC_PAUSED';
export const NORMAL_MUTATING_SYNC_PAUSED_ORGS_FLAG = 'NORMAL_MUTATING_SYNC_PAUSED_ORGS';

/** Outcome/reason som exponeras utåt när mutationer är pausade. */
export const MUTATING_SYNC_PAUSED = 'mutating_sync_paused';
/** Loggnamn för alla blockeringar (kill switch + guards). */
export const SYNC_BLOCK_LOG = 'sync_block_audit';
/** Request försökte styra kill switchen — alltid blockerat. */
export const KILL_SWITCH_NOT_REQUEST_CONTROLLABLE = 'kill_switch_not_request_controllable';

/** Requestnycklar som aldrig får påverka kill switchen. */
export const KILL_SWITCH_REQUEST_KEYS = [
  'pause',
  'paused',
  'resume',
  'unpause',
  'kill_switch',
  'killSwitch',
  'disable_kill_switch',
  'force_sync',
  'ignore_pause',
  'override_pause',
  NORMAL_MUTATING_SYNC_PAUSED_FLAG,
  NORMAL_MUTATING_SYNC_PAUSED_ORGS_FLAG,
] as const;

function readEnv(name: string): string | null {
  try {
    // deno-lint-ignore no-explicit-any
    const env = (globalThis as any)?.Deno?.env;
    return env?.get?.(name) ?? null;
  } catch (_) {
    return null;
  }
}

/** Ren funktion — endast exakt "true" pausar globalt. */
export function isGlobalPauseValue(raw: string | null | undefined): boolean {
  return raw === 'true';
}

/** Ren funktion — parsar org-listan (komma/whitespace-separerad). */
export function parsePausedOrgs(raw: string | null | undefined): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

export interface KillSwitchState {
  globalPaused: boolean;
  pausedOrgs: string[];
}

export function readKillSwitchState(): KillSwitchState {
  return {
    globalPaused: isGlobalPauseValue(readEnv(NORMAL_MUTATING_SYNC_PAUSED_FLAG)),
    pausedOrgs: parsePausedOrgs(readEnv(NORMAL_MUTATING_SYNC_PAUSED_ORGS_FLAG)),
  };
}

export type PauseScope = 'none' | 'global' | 'organization' | 'request_tamper';

export interface PauseDecision {
  /** true = normal muterande sync måste stoppa FÖRE varje mutation. */
  paused: boolean;
  scope: PauseScope;
  reason: string | null;
  /** true när read-only diagnostik ändå får köras. */
  readOnlyAllowed: boolean;
}

const ALLOWED: PauseDecision = { paused: false, scope: 'none', reason: null, readOnlyAllowed: true };

/**
 * Avgör om MUTERANDE sync får köra.
 *
 * `dryRun: true` ⇒ aldrig pausad (read-only diagnostik ska fungera under paus).
 * Om requesten innehåller nycklar som försöker styra flaggan ⇒ fail-closed.
 */
export function resolveMutatingSyncPause(input: {
  organizationId?: string | null;
  dryRun?: boolean;
  body?: Record<string, unknown> | null;
  state?: KillSwitchState;
}): PauseDecision {
  const body = input.body ?? null;
  if (body && typeof body === 'object') {
    for (const key of KILL_SWITCH_REQUEST_KEYS) {
      if (body[key] !== undefined) {
        return {
          paused: true,
          scope: 'request_tamper',
          reason: KILL_SWITCH_NOT_REQUEST_CONTROLLABLE,
          readOnlyAllowed: false,
        };
      }
    }
  }

  const state = input.state ?? readKillSwitchState();

  // Read-only diagnostik påverkas aldrig av pausen.
  if (input.dryRun === true) return ALLOWED;

  if (state.globalPaused) {
    return { paused: true, scope: 'global', reason: MUTATING_SYNC_PAUSED, readOnlyAllowed: true };
  }
  const org = (input.organizationId ?? '').toString().trim().toLowerCase();
  if (org && state.pausedOrgs.includes(org)) {
    return { paused: true, scope: 'organization', reason: MUTATING_SYNC_PAUSED, readOnlyAllowed: true };
  }
  return ALLOWED;
}

export interface SyncBlockAuditInput {
  organization_id: string | null;
  booking_id: string | null;
  reason: string;
  scope?: PauseScope | string | null;
  job_id?: string | null;
  batch_id?: string | null;
  source_revision?: string | number | null;
  applied_revision?: string | number | null;
  caller: string;
}

const SECRET_KEY_PATTERN = /(token|secret|key|password|authorization|bearer|jwt|apikey)/i;

/** Strukturerad blockeringslogg. Innehåller ALDRIG tokens eller secrets. */
export function buildSyncBlockAudit(input: SyncBlockAuditInput): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    log: SYNC_BLOCK_LOG,
    blocked: true,
    organization_id: input.organization_id ?? null,
    booking_id: input.booking_id ?? null,
    reason: input.reason,
    scope: input.scope ?? null,
    job_id: input.job_id ?? null,
    batch_id: input.batch_id ?? null,
    source_revision: input.source_revision ?? null,
    applied_revision: input.applied_revision ?? null,
    caller: input.caller,
    mutations: 0,
    cursor_moved: false,
    job_completed: false,
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (SECRET_KEY_PATTERN.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export function logSyncBlock(input: SyncBlockAuditInput): Record<string, unknown> {
  const audit = buildSyncBlockAudit(input);
  console.warn(`[${SYNC_BLOCK_LOG}]`, JSON.stringify(audit));
  return audit;
}
