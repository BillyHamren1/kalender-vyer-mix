import type { PackingWithBooking } from '@/types/packing';
import type { PackingEntry, PackingEntryKind } from '@/hooks/scanner/usePackingsByDate';

/**
 * Stort projekt = en packjob i listan.
 *
 * Sammanfogar PackingEntry[] till GroupedPackingEntry[] där alla packlistor
 * som tillhör samma stora projekt och har samma kind grupperas till en
 * `lp_group`-card. Enskilda packlistor (utan large_project) blir `single`.
 */
export type GroupedPackingEntry =
  | { type: 'single'; kind: PackingEntryKind; packing: PackingWithBooking; key: string }
  | {
      type: 'lp_group';
      kind: PackingEntryKind;
      largeProjectId: string;
      largeProjectName: string;
      packings: PackingWithBooking[];
      key: string;
    };

const lpIdFor = (p: PackingWithBooking): string | null =>
  p.large_project?.id || p.booking?.large_project_id || null;

const lpNameFor = (p: PackingWithBooking): string =>
  p.large_project?.name || 'Stort projekt';

export const groupPackingEntries = (
  entries: PackingEntry[],
): GroupedPackingEntry[] => {
  const out: GroupedPackingEntry[] = [];
  const lpBuckets = new Map<string, GroupedPackingEntry & { type: 'lp_group' }>();

  for (const entry of entries) {
    const lpId = lpIdFor(entry.packing);
    if (!lpId) {
      out.push({
        type: 'single',
        kind: entry.kind,
        packing: entry.packing,
        key: `single:${entry.packing.id}:${entry.kind}`,
      });
      continue;
    }
    const bucketKey = `${lpId}:${entry.kind}`;
    let bucket = lpBuckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        type: 'lp_group',
        kind: entry.kind,
        largeProjectId: lpId,
        largeProjectName: lpNameFor(entry.packing),
        packings: [],
        key: `lp:${bucketKey}`,
      };
      lpBuckets.set(bucketKey, bucket);
      out.push(bucket);
    }
    // Skip dubbletter (samma packning skickad flera gånger)
    if (!bucket.packings.some(p => p.id === entry.packing.id)) {
      bucket.packings.push(entry.packing);
    }
  }
  return out;
};
