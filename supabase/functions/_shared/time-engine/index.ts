/**
 * Time Engine — public entry (Deno / Edge Functions).
 * Contracts + policy + GPS day timeline + target resolver. No UI,
 * no time_report writes, no migration of legacy history, no DB writes.
 */
export * from './contracts.ts';
export * from './timePolicy.ts';
export * from './buildGpsDayTimeline.ts';
export * from './resolveWorkTargets.ts';
export * from './decideAutoStart.ts';
export * from './processGpsTimelineForAutoStart.ts';
export * from './assertNoLegacySources.ts';

