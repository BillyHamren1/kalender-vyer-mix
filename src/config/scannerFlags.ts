/**
 * Scanner hardening feature flags.
 *
 * STEG 1B (baseline): inga beteendeändringar. Flaggan finns endast för att
 * senare steg ska kunna aktivera transaktionell scanning (WMS + lokal mutation
 * som en enhet, med replaybar operationskö).
 *
 * SCANNER_TRANSACTION_V2 = OFF betyder att nuvarande (dubbel sanning) flöde
 * gäller oförändrat. Ingen kod får läsa flaggan för att slå på ny funktionalitet
 * i detta steg.
 */
export const SCANNER_TRANSACTION_V2 = false as const;

export const isScannerTransactionV2Enabled = (): boolean => SCANNER_TRANSACTION_V2;
