/**
 * resolvePhysicalLocationForCluster (Time Engine — Lager 2.3b)
 *
 * Pure helper. Bestämmer FYSISK plats för ett stabilt platskluster, separat
 * från EventFlow business target. Reverse geocoding används endast om en
 * befintlig helper finns (gör inga nya nätverksanrop härifrån). Annars
 * faller vi tillbaka på centroid + ett "Plats vid lat,lng"-label och
 * lägger till warning `address_lookup_not_available`.
 *
 * Produktregel:
 *   En plats är inte "okänd" bara för att den inte matchar en
 *   booking/projekt/lager. Om vi har stabil GPS-centroid har vi en känd
 *   FYSISK plats — bara `businessContext` är oresolvad.
 */

import type { StableLocationCluster } from './buildStableLocationClusters.ts';
import type { KnownTargetEvidenceItem } from './buildKnownTargetsEvidence.ts';
import type { MatchClusterResult } from './matchClusterToKnownTarget.ts';

export type PhysicalLocationSource =
  | 'eventflow_target'
  | 'reverse_geocode'
  | 'centroid'
  | 'private_zone';

export interface PhysicalLocation {
  label?: string;
  address?: string;
  lat: number;
  lng: number;
  source: PhysicalLocationSource;
  confidence: 'high' | 'medium' | 'low';
}

export interface ResolvePhysicalLocationInput {
  cluster: StableLocationCluster;
  match: MatchClusterResult;
  knownTargets: KnownTargetEvidenceItem[];
}

export interface ResolvePhysicalLocationResult {
  physicalLocation: PhysicalLocation;
  warnings: string[];
  /** True om vi använde en befintlig reverse-geocoder. (Inte än — TODO.) */
  reverseGeocodeUsed: boolean;
  /** True om endast centroid kunde användas som adressunderlag. */
  centroidOnly: boolean;
}

function formatLatLng(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function resolvePhysicalLocationForCluster(
  input: ResolvePhysicalLocationInput,
): ResolvePhysicalLocationResult {
  const { cluster, match, knownTargets } = input;
  const warnings: string[] = [];

  // 1. Om kluster matchat en EventFlow-target med geo → använd dess geo/label.
  const matchedId = match.matchedTarget.targetId;
  const matchedKnownType = match.matchedTarget.knownTargetType;
  if (
    matchedId &&
    matchedKnownType &&
    match.matchedTarget.type !== 'needs_location_review' &&
    match.matchedTarget.type !== 'unknown_area'
  ) {
    const t = knownTargets.find(
      (k) => k.targetId === matchedId && k.targetType === matchedKnownType,
    );
    if (t && t.lat != null && t.lng != null) {
      const isPrivate =
        matchedKnownType === 'private_zone' ||
        matchedKnownType === 'home_observation' ||
        matchedKnownType === 'inferred_home';
      // Lager 2.11B — fyll address från target. KnownTargetEvidenceItem har
      // bara `address`, men vi läser även ev. extra-fält som finns på
      // varianter av targetet (formattedAddress/fullAddress/locationAddress).
      const anyT = t as unknown as Record<string, unknown>;
      const addrCandidates = [
        t.address,
        anyT.formattedAddress,
        anyT.fullAddress,
        anyT.locationAddress,
      ];
      const address = addrCandidates.find(
        (s): s is string => typeof s === 'string' && s.trim().length > 0,
      ) ?? undefined;
      if (!address) {
        warnings.push('target_address_missing');
      }
      return {
        physicalLocation: {
          label: t.label,
          ...(address ? { address } : {}),
          lat: t.lat,
          lng: t.lng,
          source: isPrivate ? 'private_zone' : 'eventflow_target',
          confidence: match.confidence,
        },
        warnings,
        reverseGeocodeUsed: false,
        centroidOnly: false,
      };
    }
  }

  // 2. Ingen target eller target saknar geo → centroid-only fallback.
  // TODO(reverse-geocode): koppla in befintlig reverse-geocode-helper när det
  // är säkert att göra det inom Lager 2-pipelinen. supabase/functions/
  // reverse-geocode-staff finns men kräver nätverk + bör batch:as utanför
  // den synkrona builder-pipelinen. Tills dess: centroid-label.
  warnings.push('address_lookup_not_available');
  return {
    physicalLocation: {
      label: `Plats vid ${formatLatLng(cluster.centroidLat, cluster.centroidLng)}`,
      lat: cluster.centroidLat,
      lng: cluster.centroidLng,
      source: 'centroid',
      confidence: cluster.confidence,
    },
    warnings,
    reverseGeocodeUsed: false,
    centroidOnly: true,
  };
}
