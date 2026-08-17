/**
 * Scanner transaction V2 feature flag.
 *
 * Safety contract:
 * - Default is OFF when the env value is missing/invalid.
 * - Only the exact string "true" enables V2.
 * - Production must never be enabled by source-code edits.
 * - Test/local builds can explicitly set VITE_SCANNER_TRANSACTION_V2=true.
 */
const rawScannerV2Flag = (import.meta as any).env?.VITE_SCANNER_TRANSACTION_V2;

export const SCANNER_TRANSACTION_V2: boolean = rawScannerV2Flag === 'true';

export const isScannerTransactionV2Enabled = (): boolean => SCANNER_TRANSACTION_V2;
