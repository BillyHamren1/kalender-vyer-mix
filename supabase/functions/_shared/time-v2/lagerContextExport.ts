/**
 * Planning-side EXPORT of the `planning-lager-context.v1` contract into the
 * exact document + `work-context.v1` contextTargets shape the Time consumer
 * (`parsePlanningLagerContextV1` + `mapPlanningLagerContextToContextTargets`,
 * Time SHA 84842af3d1d57db3f8d22179ddb28df8a109b944) parses.
 *
 * Semantics are pinned by the contract and mirrored 1:1:
 *  - every worker grant is `permitted: true, scheduled: false`,
 *  - provenance is `schedule_context` with `isWorkEvidence: false`,
 *  - importing a context target can NEVER create assignments or reported time.
 *
 * Tenancy FAILS CLOSED: a Planning source organization exports only through
 * an explicit binding to exactly one Time organization. No binding → no
 * export. There is no shared/global warehouse fallback.
 *
 * Pure module: no I/O, no Deno APIs (WebCrypto only), usable from both the
 * Edge runtime and vitest.
 */

import type { LagerProjection } from './lagerProjection.ts';

export const LAGER_EXPORT_SCHEMA = 'planning-lager-context.v1' as const;
export const WORK_CONTEXT_SCHEMA = 'work-context.v1' as const;

/** Bounds mirrored from the Time-side parser — exceeding them fails closed here. */
export const MAX_PERMITTED_TARGETS = 50;
export const MAX_WORKERS_PER_TARGET = 200;

// ---------------------------------------------------------------------------
// Canonical JSON + SHA-256 (exact mirror of Time `_shared/canonical.ts`).
// ---------------------------------------------------------------------------

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
};

export const canonicalJson = (value: unknown): string => JSON.stringify(canonicalize(value));

export const sha256Canonical = async (value: unknown): Promise<string> => {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

// ---------------------------------------------------------------------------
// Source-organization → Time-organization binding (FAIL CLOSED).
// ---------------------------------------------------------------------------

export interface LagerExportBinding {
  readonly sourceOrganizationId: string;
  readonly sourceOrganizationLabel: string;
  readonly timeOrganizationId: string;
  readonly organizationExternalId: string;
}

/**
 * EXPLICIT bindings. FA Warehouse belongs ONLY to Frans August and may only
 * ever reach the mapped isolated Time staging organization. Any other
 * Planning organization has NO binding and the export refuses to run.
 */
export const LAGER_EXPORT_BINDINGS: readonly LagerExportBinding[] = [
  {
    sourceOrganizationId: 'f5e5cade-f08b-4833-a105-56461f15b191',
    sourceOrganizationLabel: 'Frans August',
    timeOrganizationId: 'c2a94d3e-6b71-4f28-8e5a-9d0c3b7f1a22',
    organizationExternalId: 'fixture-b7e42a19-lager-context',
  },
];

/** Registered machine identity on the Time side for this export (public identifiers only). */
export const LAGER_EXPORT_REGISTRATION_IDENTITY = {
  issuer: 'https://planning-shadow.fixture-b7e42a19-lager-context.example.invalid',
  audience: 'eventflow-time-work-context',
  subject: 'planning-lager-context-export',
} as const;

export class LagerExportError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'LagerExportError';
  }
}

export const resolveLagerExportBinding = (
  sourceOrganizationId: string,
  bindings: readonly LagerExportBinding[] = LAGER_EXPORT_BINDINGS,
): LagerExportBinding => {
  const matches = bindings.filter((binding) => binding.sourceOrganizationId === sourceOrganizationId);
  if (matches.length === 0) {
    throw new LagerExportError(
      'no_binding',
      `Ingen Time-organisation är bunden till Planning-organisationen ${sourceOrganizationId} — exporten vägrar (ingen global lagerfallback finns).`,
    );
  }
  const first = matches[0]!;
  if (matches.some((b) => b.timeOrganizationId !== first.timeOrganizationId || b.organizationExternalId !== first.organizationExternalId)) {
    throw new LagerExportError('conflicting_binding', `Planning-organisationen ${sourceOrganizationId} har motstridiga Time-bindningar.`);
  }
  return first;
};

// ---------------------------------------------------------------------------
// Export document (exactly the shape Time's parsePlanningLagerContextV1 accepts).
// ---------------------------------------------------------------------------

export interface LagerExportWorkerGrant {
  readonly staffId: string;
  readonly date: string;
  readonly permitted: true;
  readonly scheduled: false;
  readonly requiresEvidence: boolean;
  readonly provenance: { readonly basis: 'schedule_context'; readonly isWorkEvidence: false };
}

export interface LagerExportTarget {
  readonly targetKey: string;
  readonly kind: 'location';
  readonly locationId: string;
  readonly projectId: string;
  readonly projectLabel: string;
  readonly label: string;
  readonly address: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMeters: number;
  readonly geofenceMode: string;
  readonly workers: readonly LagerExportWorkerGrant[];
}

export interface LagerExportDocument {
  readonly schema: typeof LAGER_EXPORT_SCHEMA;
  readonly planningSha: string;
  readonly sourceOrganizationId: string;
  readonly generatedAt: string;
  readonly permittedTargets: readonly LagerExportTarget[];
}

export interface BuildLagerExportDocumentInput {
  readonly projection: LagerProjection;
  /** Internal Lager project display name (e.g. "Lager"). */
  readonly projectLabel: string;
  /** Exact 40-hex Planning source commit. */
  readonly planningSha: string;
  /** Pinned ISO timestamp — same value + same content ⇒ identical replay. */
  readonly generatedAt: string;
}

/**
 * Builds the export document from a live Planning Lager projection.
 * Deterministic: worker grants are deduped on staffId:date and sorted by
 * (date, staffId), so identical source data always yields an identical
 * document. FAILS CLOSED when Planning owns no exact canonical location.
 */
export const buildLagerExportDocument = (input: BuildLagerExportDocumentInput): LagerExportDocument => {
  const { projection } = input;

  if (!/^[0-9a-f]{40}$/.test(input.planningSha)) {
    throw new LagerExportError('invalid_planning_sha', 'planningSha måste vara exakt 40 hex-tecken (Planning-commit).');
  }
  if (Number.isNaN(Date.parse(input.generatedAt))) {
    throw new LagerExportError('invalid_generated_at', 'generatedAt måste vara en ISO-8601-tidsstämpel.');
  }
  const location = projection.location;
  if (!location || !location.isExact) {
    throw new LagerExportError(
      'no_lager_context',
      'Planning äger ingen exakt kanonisk Lager-plats för organisationen — inget exporteras (inget uppfinns).',
    );
  }
  if (
    location.internalProjectId === null ||
    location.latitude === null || location.longitude === null ||
    location.radiusMeters === null || location.radiusMeters <= 0 || location.radiusMeters > 10_000
  ) {
    throw new LagerExportError('no_lager_context', 'Lager-platsen saknar projekt-länk eller giltig geofence — inget exporteras.');
  }
  const projectLabel = input.projectLabel.trim();
  if (projectLabel === '') {
    throw new LagerExportError('no_lager_context', 'Det interna Lager-projektet saknar namn — inget exporteras.');
  }

  // Dedupe + deterministic order. `scheduled` is literally false by contract:
  // the Lager context is never scheduled work on the Time side.
  const grantByKey = new Map<string, LagerExportWorkerGrant>();
  for (const target of projection.permittedTargets) {
    if (target.locationId !== location.locationId) continue;
    const key = `${target.staffId}:${target.date}`;
    if (grantByKey.has(key)) continue;
    grantByKey.set(key, {
      staffId: target.staffId,
      date: target.date,
      permitted: true,
      scheduled: false,
      requiresEvidence: target.requiresEvidence,
      provenance: { basis: 'schedule_context', isWorkEvidence: false },
    });
  }
  const workers = [...grantByKey.values()].sort((a, b) =>
    a.date === b.date ? a.staffId.localeCompare(b.staffId) : a.date.localeCompare(b.date));

  if (workers.length === 0) {
    throw new LagerExportError('no_worker_grants', 'Inga worker/datum-grants i intervallet — Time-kontraktet kräver minst en.');
  }
  if (workers.length > MAX_WORKERS_PER_TARGET) {
    throw new LagerExportError(
      'too_many_grants',
      `${workers.length} grants överskrider Time-gränsen ${MAX_WORKERS_PER_TARGET} — smalna av datumintervall eller staffIds.`,
    );
  }

  return {
    schema: LAGER_EXPORT_SCHEMA,
    planningSha: input.planningSha,
    sourceOrganizationId: projection.organizationId,
    generatedAt: input.generatedAt,
    permittedTargets: [{
      targetKey: `planning:location:${location.locationId}`,
      kind: 'location',
      locationId: location.locationId,
      projectId: location.internalProjectId,
      projectLabel,
      label: location.label,
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
      radiusMeters: location.radiusMeters,
      geofenceMode: location.geofenceMode ?? 'radius',
      workers,
    }],
  };
};

// ---------------------------------------------------------------------------
// work-context.v1 mapping (exact mirror of Time's consumer mapping).
// ---------------------------------------------------------------------------

export interface LagerContextTarget {
  readonly sourceContextId: string;
  readonly sourceVersion: string;
  readonly workerExternalId: string;
  readonly workDate: string;
  readonly basis: 'schedule_context';
  readonly scheduled: false;
  readonly isWorkEvidence: false;
  readonly requiresEvidence: boolean;
  readonly target: {
    readonly sourceSystem: 'planning';
    readonly kind: 'location';
    readonly externalId: string;
    readonly version: string;
    readonly label: string;
    readonly location: { readonly address?: string; readonly latitude: number; readonly longitude: number; readonly radiusM: number };
    readonly reporting: { readonly state: 'allowed' };
  };
}

export const lagerTargetVersion = (planningSha: string): string => `${LAGER_EXPORT_SCHEMA}@${planningSha}`;

export const lagerDisplayLabel = (target: Pick<LagerExportTarget, 'projectLabel' | 'label'>): string =>
  `${target.projectLabel} / ${target.label}`;

export const mapLagerExportToContextTargets = (document: LagerExportDocument): LagerContextTarget[] =>
  document.permittedTargets.flatMap((target) =>
    target.workers.map((grant): LagerContextTarget => ({
      sourceContextId: `${target.targetKey}#${grant.staffId}#${grant.date}`,
      sourceVersion: lagerTargetVersion(document.planningSha),
      workerExternalId: grant.staffId,
      workDate: grant.date,
      basis: 'schedule_context',
      scheduled: false,
      isWorkEvidence: false,
      requiresEvidence: grant.requiresEvidence,
      target: {
        sourceSystem: 'planning',
        kind: 'location',
        externalId: target.locationId,
        version: lagerTargetVersion(document.planningSha),
        label: lagerDisplayLabel(target),
        location: {
          ...(target.address !== null ? { address: target.address } : {}),
          latitude: target.latitude,
          longitude: target.longitude,
          radiusM: target.radiusMeters,
        },
        reporting: { state: 'allowed' },
      },
    })));

// ---------------------------------------------------------------------------
// work-context.v1 projection envelope (content-derived id ⇒ idempotent replay).
// ---------------------------------------------------------------------------

export interface LagerWorkContextProjection {
  readonly schema: typeof WORK_CONTEXT_SCHEMA;
  readonly projectionId: string;
  readonly organizationExternalId: string;
  readonly sourceSystem: 'planning';
  readonly sourceCursor: string;
  readonly generatedAt: string;
  readonly assignments: readonly never[];
  readonly contextTargets: readonly LagerContextTarget[];
}

export const buildLagerWorkContextProjection = async (
  document: LagerExportDocument,
  binding: LagerExportBinding,
): Promise<{ projection: LagerWorkContextProjection; projectionHash: string; digest: string }> => {
  const contextTargets = mapLagerExportToContextTargets(document);
  const digest = (await sha256Canonical({ document, contextTargets })).slice(0, 16);
  const projection: LagerWorkContextProjection = {
    schema: WORK_CONTEXT_SCHEMA,
    projectionId: `lager-ctx-${digest}`,
    organizationExternalId: binding.organizationExternalId,
    sourceSystem: 'planning',
    sourceCursor: `planning-lager-context:${document.planningSha}:${digest}`,
    generatedAt: document.generatedAt,
    assignments: [] as never[],
    contextTargets,
  };
  const projectionHash = await sha256Canonical(projection);
  return { projection, projectionHash, digest };
};

// ---------------------------------------------------------------------------
// Machine JWT claims (Time `machine-jwt.ts` contract: exact keys, ES256).
// ---------------------------------------------------------------------------

export const MACHINE_JWT_TTL_SECONDS = 240;

export interface LagerMachineJwtClaims {
  readonly iss: string;
  readonly aud: string;
  readonly sub: string;
  readonly iat: number;
  readonly nbf: number;
  readonly exp: number;
  readonly jti: string;
  readonly projection_hash: string;
}

export const buildLagerMachineJwtClaims = (input: {
  projectionHash: string;
  now?: Date;
  jti?: string;
}): LagerMachineJwtClaims => {
  if (!/^[0-9a-f]{64}$/.test(input.projectionHash)) {
    throw new LagerExportError('invalid_projection_hash', 'projection_hash måste vara 64 hex-tecken.');
  }
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  return {
    iss: LAGER_EXPORT_REGISTRATION_IDENTITY.issuer,
    aud: LAGER_EXPORT_REGISTRATION_IDENTITY.audience,
    sub: LAGER_EXPORT_REGISTRATION_IDENTITY.subject,
    iat: now,
    nbf: now,
    exp: now + MACHINE_JWT_TTL_SECONDS,
    jti: input.jti ?? crypto.randomUUID(),
    projection_hash: input.projectionHash,
  };
};
