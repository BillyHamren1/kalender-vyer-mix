// Regression: known work target A → GPS gap → known work target B
// must classify as confirmed transport, not unknown_gap_needs_review.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { classifyTransportSignalGap } from './classifyTransportSignalGap.ts';
import type { WorkTarget } from './contracts.ts';

const FA: WorkTarget = {
  key: 'organization_location:fa',
  kind: 'organization_location',
  refId: 'fa',
  label: 'FA Warehouse',
  center: { lat: 59.4916, lng: 17.8552 },
  radiusM: 150,
  validFrom: null,
  validUntil: null,
};
const BERGMAN: WorkTarget = {
  key: 'booking:bergman',
  kind: 'booking',
  refId: 'bergman',
  label: 'Bergman Event AB - 12 maj 2026',
  center: { lat: 59.7568, lng: 18.7102 },
  radiusM: 150,
  validFrom: null,
  validUntil: null,
};

const noCompanion = {
  matched: false,
  matchedStaffCount: 0,
  matchedStaff: [],
  confidence: 'low' as const,
  confidenceScore: 0,
  reasons: [],
};

Deno.test('known work target A → gap → known work target B becomes confirmed transport', () => {
  const result = classifyTransportSignalGap({
    gapStartIso: '2026-05-11T07:28:00Z',
    gapEndIso: '2026-05-11T09:01:00Z', // 93 min — exceeds old 30-min cap
    previousKnownPosition: { lat: FA.center.lat, lng: FA.center.lng },
    nextKnownPosition: { lat: BERGMAN.center.lat, lng: BERGMAN.center.lng },
    previousIsTransport: false,
    nextIsTransport: false,
    destinationCandidate: BERGMAN,
    originCandidate: FA,
    conflictingSignals: {
      anyHardGeoEntry: false,
      anyConfirmedStayAtOtherPlace: false,
      anyHomePrivate: false,
    },
    companionRouteEvidence: noCompanion,
  });

  assertEquals(result.countsAsTransport, true);
  assertEquals(result.classification, 'confirmed_transport_gap');
  assertEquals(result.confidence, 'high');
});

Deno.test('unknown destination + no transport pings still rejected', () => {
  const result = classifyTransportSignalGap({
    gapStartIso: '2026-05-11T07:28:00Z',
    gapEndIso: '2026-05-11T09:01:00Z',
    previousKnownPosition: { lat: FA.center.lat, lng: FA.center.lng },
    nextKnownPosition: { lat: BERGMAN.center.lat, lng: BERGMAN.center.lng },
    previousIsTransport: false,
    nextIsTransport: false,
    destinationCandidate: null,
    originCandidate: FA,
    conflictingSignals: {
      anyHardGeoEntry: false,
      anyConfirmedStayAtOtherPlace: false,
      anyHomePrivate: false,
    },
    companionRouteEvidence: noCompanion,
  });

  assertEquals(result.countsAsTransport, false);
});
