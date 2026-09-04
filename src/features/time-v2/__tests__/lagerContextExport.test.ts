/**
 * Contract tests for the Planning-side `planning-lager-context.v1` EXPORT
 * (`lagerContextExport.ts`) that feeds Time's `work-context-import` boundary.
 *
 * Locks:
 *  - exact Time-consumer document shape (parser at Time SHA 84842af3…),
 *  - pinned semantics: scheduled=false, isWorkEvidence=false, assignments=[],
 *  - determinism/idempotency: same content ⇒ same projectionId + hash,
 *  - tenancy fail-closed: no binding / no exact location ⇒ no export,
 *  - machine JWT claims: exact keys + registered identity + bounded TTL.
 */
import { describe, it, expect } from 'vitest';
import {
  buildLagerContextProjection,
  type LagerProjectionInput,
} from '../../../../supabase/functions/_shared/time-v2/lagerProjection';
import {
  buildLagerExportDocument,
  buildLagerMachineJwtClaims,
  buildLagerWorkContextProjection,
  canonicalJson,
  LAGER_EXPORT_BINDINGS,
  LAGER_EXPORT_REGISTRATION_IDENTITY,
  LagerExportError,
  MACHINE_JWT_TTL_SECONDS,
  mapLagerExportToContextTargets,
  resolveLagerExportBinding,
  sha256Canonical,
} from '../../../../supabase/functions/_shared/time-v2/lagerContextExport';

const FA_ORG = 'f5e5cade-f08b-4833-a105-56461f15b191';
const SHA = 'a'.repeat(40);
const GENERATED_AT = '2026-09-04T12:00:00.000Z';

const baseInput = (over: Partial<LagerProjectionInput> = {}): LagerProjectionInput => ({
  organizationId: FA_ORG,
  from: '2026-09-01',
  to: '2026-09-02',
  staffIds: null,
  locations: [{
    id: 'loc-1',
    organization_id: FA_ORG,
    name: 'FA Warehouse',
    address: null,
    latitude: 59.4914494,
    longitude: 17.8553564,
    radius_meters: 200,
    geofence_mode: 'polygon',
    location_type: 'other',
    is_active: true,
  }],
  internalProjects: [{
    id: 'proj-1',
    organization_id: FA_ORG,
    name: 'Lager',
    is_internal: true,
    location_id: 'loc-1',
  }],
  staffMembers: [
    { id: 'staff_b', organization_id: FA_ORG, name: 'B', is_active: true },
    { id: 'staff_a', organization_id: FA_ORG, name: 'A', is_active: true },
  ],
  staffAssignments: [],
  warehouseAssignments: [],
  warehouseCalendarEvents: [],
  ...over,
});

const buildDocument = (over: Partial<LagerProjectionInput> = {}) =>
  buildLagerExportDocument({
    projection: buildLagerContextProjection(baseInput(over)),
    projectLabel: 'Lager',
    planningSha: SHA,
    generatedAt: GENERATED_AT,
  });

describe('resolveLagerExportBinding (tenancy fail-closed)', () => {
  it('resolves the explicit Frans August binding', () => {
    const binding = resolveLagerExportBinding(FA_ORG);
    expect(binding.timeOrganizationId).toBe('c2a94d3e-6b71-4f28-8e5a-9d0c3b7f1a22');
    expect(binding.organizationExternalId).toBe('fixture-b7e42a19-lager-context');
  });

  it('fails closed for any unmapped organization (no global fallback)', () => {
    expect(() => resolveLagerExportBinding('00000000-0000-0000-0000-000000000000'))
      .toThrowError(LagerExportError);
    try {
      resolveLagerExportBinding('other-org');
    } catch (e) {
      expect((e as LagerExportError).code).toBe('no_binding');
    }
  });

  it('fails closed on conflicting duplicate bindings', () => {
    const dup = [...LAGER_EXPORT_BINDINGS, { ...LAGER_EXPORT_BINDINGS[0], timeOrganizationId: 'x' }];
    expect(() => resolveLagerExportBinding(FA_ORG, dup)).toThrowError(/motstridiga/);
  });
});

describe('buildLagerExportDocument (Time parser shape)', () => {
  it('builds exactly one location target with deterministic sorted worker grants', () => {
    const document = buildDocument();
    expect(document.schema).toBe('planning-lager-context.v1');
    expect(document.planningSha).toBe(SHA);
    expect(document.sourceOrganizationId).toBe(FA_ORG);
    expect(document.generatedAt).toBe(GENERATED_AT);
    expect(document.permittedTargets).toHaveLength(1);

    const target = document.permittedTargets[0];
    expect(target.targetKey).toBe('planning:location:loc-1');
    expect(target.kind).toBe('location');
    expect(target.projectId).toBe('proj-1');
    expect(target.projectLabel).toBe('Lager');
    expect(target.label).toBe('FA Warehouse');
    expect(target.address).toBeNull();
    expect(target.geofenceMode).toBe('polygon');
    // 2 staff × 2 days, sorted by (date, staffId).
    expect(target.workers.map((w) => `${w.date}:${w.staffId}`)).toEqual([
      '2026-09-01:staff_a', '2026-09-01:staff_b',
      '2026-09-02:staff_a', '2026-09-02:staff_b',
    ]);
    for (const grant of target.workers) {
      expect(grant.permitted).toBe(true);
      expect(grant.scheduled).toBe(false); // never scheduled work — pinned
      expect(grant.requiresEvidence).toBe(true);
      expect(grant.provenance).toEqual({ basis: 'schedule_context', isWorkEvidence: false });
    }
  });

  it('fails closed without an exact canonical location', () => {
    expect(() => buildDocument({ locations: [] })).toThrowError(LagerExportError);
    try {
      buildDocument({ locations: [] });
    } catch (e) {
      expect((e as LagerExportError).code).toBe('no_lager_context');
    }
  });

  it('fails closed when the range yields no worker grants', () => {
    expect(() => buildDocument({ staffMembers: [] })).toThrowError(/minst en/);
  });

  it('rejects a non-40-hex planningSha', () => {
    expect(() =>
      buildLagerExportDocument({
        projection: buildLagerContextProjection(baseInput()),
        projectLabel: 'Lager',
        planningSha: 'short',
        generatedAt: GENERATED_AT,
      })).toThrowError(/40 hex/);
  });
});

describe('mapLagerExportToContextTargets (work-context.v1 mapping)', () => {
  it('mirrors the Time consumer mapping exactly', () => {
    const document = buildDocument();
    const targets = mapLagerExportToContextTargets(document);
    expect(targets).toHaveLength(4);
    const first = targets[0];
    expect(first.sourceContextId).toBe('planning:location:loc-1#staff_a#2026-09-01');
    expect(first.sourceVersion).toBe(`planning-lager-context.v1@${SHA}`);
    expect(first.workerExternalId).toBe('staff_a');
    expect(first.workDate).toBe('2026-09-01');
    expect(first.basis).toBe('schedule_context');
    expect(first.scheduled).toBe(false);
    expect(first.isWorkEvidence).toBe(false);
    expect(first.target.sourceSystem).toBe('planning');
    expect(first.target.kind).toBe('location');
    expect(first.target.externalId).toBe('loc-1');
    expect(first.target.label).toBe('Lager / FA Warehouse');
    expect(first.target.reporting).toEqual({ state: 'allowed' });
    // null address is OMITTED, never invented.
    expect('address' in first.target.location).toBe(false);
    expect(first.target.location).toEqual({ latitude: 59.4914494, longitude: 17.8553564, radiusM: 200 });
  });
});

describe('buildLagerWorkContextProjection (idempotent envelope)', () => {
  it('is deterministic: identical content ⇒ identical projectionId + hash', async () => {
    const binding = resolveLagerExportBinding(FA_ORG);
    const a = await buildLagerWorkContextProjection(buildDocument(), binding);
    const b = await buildLagerWorkContextProjection(buildDocument(), binding);
    expect(a.projection.projectionId).toBe(b.projection.projectionId);
    expect(a.projectionHash).toBe(b.projectionHash);
    expect(a.projection.projectionId).toBe(`lager-ctx-${a.digest}`);
    expect(a.projection.sourceCursor).toBe(`planning-lager-context:${SHA}:${a.digest}`);
    expect(a.projection.schema).toBe('work-context.v1');
    expect(a.projection.assignments).toEqual([]); // ZERO assignments — pinned
    expect(a.projection.organizationExternalId).toBe('fixture-b7e42a19-lager-context');
  });

  it('changes identity when content changes', async () => {
    const binding = resolveLagerExportBinding(FA_ORG);
    const a = await buildLagerWorkContextProjection(buildDocument(), binding);
    const b = await buildLagerWorkContextProjection(buildDocument({ to: '2026-09-01' }), binding);
    expect(a.projection.projectionId).not.toBe(b.projection.projectionId);
  });

  it('canonicalJson sorts keys recursively (Time canonical.ts mirror)', async () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [{ f: 3, e: 4 }] } }))
      .toBe('{"a":{"c":[{"e":4,"f":3}],"d":2},"b":1}');
    expect(await sha256Canonical({ a: 1, b: 2 })).toBe(await sha256Canonical({ b: 2, a: 1 }));
  });
});

describe('buildLagerMachineJwtClaims (Time machine-jwt contract)', () => {
  it('uses exactly the registered identity and bounded lifetime', () => {
    const hash = 'f'.repeat(64);
    const now = new Date('2026-09-04T10:00:00Z');
    const claims = buildLagerMachineJwtClaims({ projectionHash: hash, now, jti: 'jti-1' });
    expect(Object.keys(claims).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'jti', 'nbf', 'projection_hash', 'sub']);
    expect(claims.iss).toBe(LAGER_EXPORT_REGISTRATION_IDENTITY.issuer);
    expect(claims.aud).toBe('eventflow-time-work-context');
    expect(claims.sub).toBe('planning-lager-context-export');
    expect(claims.exp - claims.iat).toBe(MACHINE_JWT_TTL_SECONDS);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(300);
    expect(claims.nbf).toBe(claims.iat);
    expect(claims.projection_hash).toBe(hash);
  });

  it('rejects a malformed projection hash', () => {
    expect(() => buildLagerMachineJwtClaims({ projectionHash: 'nope' })).toThrowError(/64 hex/);
  });
});
