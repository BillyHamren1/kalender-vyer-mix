/**
 * Result contract for the remaining legacy scanner transport.
 *
 * Legacy is deliberately not retried: its historical WMS endpoints cannot yet
 * prove replay/idempotency. A transport failure is therefore UNKNOWN and must
 * never be rendered as success or followed by local arithmetic.
 */
export type LegacyWmsOutcome = 'committed' | 'rejected' | 'unknown';

export interface LegacyWmsResult {
  success: boolean;
  operationId?: string | null;
  outcome?: LegacyWmsOutcome;
  authority?: 'wms' | null;
  outcomeUnknown?: boolean;
  error?: string;
  debugCode?: string;
}

export const isLegacyWmsCommit = <T extends LegacyWmsResult>(
  result: T | null | undefined,
): result is T & { outcome: 'committed'; authority: 'wms'; operationId: string } =>
  Boolean(
    result?.success === true &&
    result.outcome === 'committed' &&
    result.authority === 'wms' &&
    typeof result.operationId === 'string' &&
    result.operationId.length > 0,
  );

export const legacyOutcomeMessage = (result: LegacyWmsResult | null | undefined): string => {
  if (result?.outcome === 'unknown' || result?.outcomeUnknown) {
    return 'WMS-svaret är osäkert – kontrollera status innan nytt försök';
  }
  return result?.error || 'WMS nekade ändringen';
};
