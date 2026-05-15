/**
 * Lager 2.11B — physicalLocation.address fylls från target.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolvePhysicalLocationForCluster } from './resolvePhysicalLocationForCluster.ts';
import type { KnownTargetEvidenceItem } from './buildKnownTargetsEvidence.ts';
import type { MatchClusterResult } from './matchClusterToKnownTarget.ts';
import type { StableLocationCluster } from './buildStableLocationClusters.ts';

function makeCluster(lat = 59.3, lng = 18.0): StableLocationCluster {
  return {
    clusterId: 'c1',
    centroidLat: lat,
    centroidLng: lng,
    startedAtIso: '2026-05-13T08:00:00Z',
    endedAtIso: '2026-05-13T09:00:00Z',
    pingCount: 12,
    confidence: 'high',
    radiusMeters: 25,
  } as unknown as StableLocationCluster;
}

function makeMatch(
  targetId: string,
  knownTargetType: KnownTargetEvidenceItem['targetType'],
  matchedType:
    | 'warehouse' | 'organization_location' | 'supplier'
    | 'large_project' | 'project' | 'booking',
  confidence: 'high' | 'medium' | 'low' = 'high',
): MatchClusterResult {
  return {
    matchedTarget: {
      type: matchedType,
      targetId,
      label: 'X',
      knownTargetType,
    },
    confidence,
    candidates: [],
    rejectedCandidates: [],
    warnings: [],
    decisionReason: 'test',
    planningUsedAsTieBreaker: false,
    planningIgnoredBecauseGeoDisagreed: false,
  };
}

function makeTarget(
  partial: Partial<KnownTargetEvidenceItem> & Pick<KnownTargetEvidenceItem,
    'targetType' | 'targetId' | 'label'>,
): KnownTargetEvidenceItem {
  return {
    address: null,
    lat: 59.3,
    lng: 18.0,
    radiusMeters: 100,
    polygon: null,
    hasCoordinates: true,
    hasRadius: true,
    sourceTable: 'test',
    status: 'active',
    dateWindow: null,
    parentLargeProjectId: null,
    belongsToLargeProject: false,
    canBePrimaryWorkTarget: true,
    canBeGeoTarget: true,
    suppressedReason: null,
    ...partial,
  } as KnownTargetEvidenceItem;
}

Deno.test('Lager 2.11B A: warehouse med address → physicalLocation.address fylls', () => {
  const targets = [makeTarget({
    targetType: 'warehouse', targetId: 'wh-1', label: 'Lager Sthlm',
    address: 'Lagervägen 1, 12345 Stockholm',
  })];
  const r = resolvePhysicalLocationForCluster({
    cluster: makeCluster(),
    match: makeMatch('wh-1', 'warehouse', 'warehouse'),
    knownTargets: targets,
  });
  assertEquals(r.physicalLocation.source, 'eventflow_target');
  assertEquals(r.physicalLocation.address, 'Lagervägen 1, 12345 Stockholm');
  assertEquals(r.physicalLocation.label, 'Lager Sthlm');
  assert(!r.warnings.includes('target_address_missing'));
});

Deno.test('Lager 2.11B B: supplier med address → fylls', () => {
  const targets = [makeTarget({
    targetType: 'supplier', targetId: 'sup-1', label: 'Bauhaus',
    address: 'Ekgården 7, Skärholmen',
  })];
  const r = resolvePhysicalLocationForCluster({
    cluster: makeCluster(),
    match: makeMatch('sup-1', 'supplier', 'supplier'),
    knownTargets: targets,
  });
  assertEquals(r.physicalLocation.address, 'Ekgården 7, Skärholmen');
  assertEquals(r.physicalLocation.source, 'eventflow_target');
});

Deno.test('Lager 2.11B C: large project med address → fylls', () => {
  const targets = [makeTarget({
    targetType: 'large_project', targetId: 'lp-1', label: 'Festivalen',
    address: 'Kaggeholm 1, Ekerö',
  })];
  const r = resolvePhysicalLocationForCluster({
    cluster: makeCluster(),
    match: makeMatch('lp-1', 'large_project', 'large_project'),
    knownTargets: targets,
  });
  assertEquals(r.physicalLocation.address, 'Kaggeholm 1, Ekerö');
});

Deno.test('Lager 2.11B D: target utan address → label/lat/lng kvar + warning target_address_missing', () => {
  const targets = [makeTarget({
    targetType: 'warehouse', targetId: 'wh-2', label: 'Lager utan adress',
    address: null,
  })];
  const r = resolvePhysicalLocationForCluster({
    cluster: makeCluster(),
    match: makeMatch('wh-2', 'warehouse', 'warehouse'),
    knownTargets: targets,
  });
  assertEquals(r.physicalLocation.address, undefined);
  assertEquals(r.physicalLocation.label, 'Lager utan adress');
  assertEquals(typeof r.physicalLocation.lat, 'number');
  assertEquals(typeof r.physicalLocation.lng, 'number');
  assert(r.warnings.includes('target_address_missing'));
});

Deno.test('Lager 2.11B E: ingen target (centroid only) → ingen address, ingen target_address_missing', () => {
  const r = resolvePhysicalLocationForCluster({
    cluster: makeCluster(59.5, 18.5),
    match: {
      matchedTarget: { type: 'no_eventflow_target_match', targetId: null, label: '?', knownTargetType: null },
      confidence: 'low',
      candidates: [], rejectedCandidates: [], warnings: [],
      decisionReason: 'no match',
      planningUsedAsTieBreaker: false, planningIgnoredBecauseGeoDisagreed: false,
    },
    knownTargets: [],
  });
  assertEquals(r.physicalLocation.source, 'centroid');
  assertEquals(r.physicalLocation.address, undefined);
  assert(!r.warnings.includes('target_address_missing'));
  assert(r.warnings.includes('address_lookup_not_available'));
  assertEquals(r.centroidOnly, true);
});

Deno.test('Lager 2.11B F: extra-fält formattedAddress används om address saknas', () => {
  const targets = [makeTarget({
    targetType: 'organization_location', targetId: 'ol-1', label: 'Filial',
    address: null,
    // extra fält som inte ligger i typen — read som fallback
    ...(({ formattedAddress: 'Storgatan 9, Sthlm' }) as any),
  } as any)];
  const r = resolvePhysicalLocationForCluster({
    cluster: makeCluster(),
    match: makeMatch('ol-1', 'organization_location', 'organization_location'),
    knownTargets: targets,
  });
  assertEquals(r.physicalLocation.address, 'Storgatan 9, Sthlm');
  assert(!r.warnings.includes('target_address_missing'));
});
