/**
 * SCANNER HARDENING – STEG 15B: obligatoriskt scenario-register.
 *
 * NOT_EXECUTED räknas ALDRIG som PASS. Sviten kan bara bli GREEN om varje
 * obligatoriskt scenario har status PASS.
 */

export type ScenarioStatus = 'PASS' | 'FAIL' | 'NOT_EXECUTED';

export interface ScenarioDefinition {
  id: string;
  specSection: number;
  title: string;
  mandatory: boolean;
  /** Kräver riktig WMS-testmiljö (15A) för att kunna exekveras. */
  requiresWms: boolean;
}

export const SCENARIOS: ScenarioDefinition[] = [
  { id: 'operation_id_uniqueness', specSection: 3, title: 'Exakt ett operation_id per fysisk scan', mandatory: true, requiresWms: true },
  { id: 'queue_offline_pending', specSection: 4, title: 'Queue Fall A – offline ger PENDING och persisteras', mandatory: true, requiresWms: true },
  { id: 'queue_reload_resume', specSection: 4, title: 'Queue Fall B – reload behåller operation och samma id', mandatory: true, requiresWms: true },
  { id: 'queue_server_down_no_clone', specSection: 4, title: 'Queue Fall C – server nere skapar aldrig ny operation', mandatory: true, requiresWms: true },
  { id: 'failure_before_server_receives', specSection: 5, title: 'Nätfel före WMS – ingen lokal mutation, samma id vid retry', mandatory: true, requiresWms: true },
  { id: 'failure_after_commit_response_lost', specSection: 6, title: 'Commit men förlorat svar → UNKNOWN → ALREADY_COMMITTED, en mutation', mandatory: true, requiresWms: true },
  { id: 'quantity_e2e', specSection: 7, title: 'Kvantitet 0→1, 10 scans, −3 = 7 (authoritative)', mandatory: true, requiresWms: true },
  { id: 'two_devices_quantity', specSection: 8, title: 'Två devices +1 vardera = +2', mandatory: true, requiresWms: true },
  { id: 'two_devices_same_instance', specSection: 8, title: 'Två devices samma serial → en COMMITTED, en CONFLICT', mandatory: true, requiresWms: true },
  { id: 'serial_pack_unpack', specSection: 9, title: 'PACK/UNPACK_INSTANCE på rätt bokning', mandatory: true, requiresWms: true },
  { id: 'serial_unpack_wrong_booking', specSection: 9, title: 'UNPACK från fel bokning avvisas utan mutation', mandatory: true, requiresWms: true },
  { id: 'physical_return', specSection: 10, title: 'RETURN_INSTANCE rätt/fel bokning (separat från unpack)', mandatory: true, requiresWms: true },
  { id: 'overpack_rejected', specSection: 11, title: 'Overpack ger OVER_CAPACITY utan lokal ökning', mandatory: true, requiresWms: true },
  { id: 'unknown_product', specSection: 12, title: 'Okänd produkt – noll mutation, ingen dold allocation efter avbryt', mandatory: true, requiresWms: true },
  { id: 'ambiguous_serial', specSection: 13, title: 'Tvetydigt serienummer avvisas utan mutation', mandatory: true, requiresWms: true },
  { id: 'ui_state_machine', specSection: 14, title: 'UI-transitions + grönt endast vid COMMITTED/ALREADY_COMMITTED', mandatory: true, requiresWms: true },
  { id: 'datawedge_readiness', specSection: 15, title: 'Listener ready ≠ hardware scanner ready', mandatory: true, requiresWms: false },
  { id: 'keyboard_fallback', specSection: 16, title: 'Keyboard fallback går genom kö + V2 gateway med bevarad source', mandatory: true, requiresWms: true },
  { id: 'rfid_dedupe_context', specSection: 17, title: 'RFID source bevaras; PACK→UNPACK samma EPC dedupas inte bort', mandatory: true, requiresWms: true },
  { id: 'reload_during_sending', specSection: 18, title: 'Reload under SENDING → UNKNOWN, ingen dubbelmutation', mandatory: true, requiresWms: true },
  { id: 'projection_drift', specSection: 19, title: 'Stale projection 4, WMS 7 → Planning blir 7 (ingen +1-matematik)', mandatory: true, requiresWms: true },
  { id: 'legacy_bypass_detection', specSection: 20, title: 'V2-operation träffar aldrig legacy write-path', mandatory: true, requiresWms: true },
  { id: 'multi_tenant_rejection', specSection: 21, title: 'Org A kan inte scanna org B:s fixture', mandatory: true, requiresWms: true },
  { id: 'final_reconciliation', specSection: 22, title: 'Cross-system reconciliation utan mismatch efter sviten', mandatory: true, requiresWms: true },
];

export interface ScenarioResult {
  id: string;
  status: ScenarioStatus;
  reason: string;
  operationId?: string | null;
  command?: string | null;
  device?: string | null;
  queueState?: string | null;
  apiResult?: string | null;
  wmsState?: string | null;
  planningProjection?: string | null;
  uiState?: string | null;
  mismatch?: string | null;
}

export const notExecutedResults = (reason: string): ScenarioResult[] =>
  SCENARIOS.map((s) => ({ id: s.id, status: 'NOT_EXECUTED' as const, reason }));

export const isGreen = (results: ScenarioResult[]): boolean => {
  const mandatory = SCENARIOS.filter((s) => s.mandatory);
  return mandatory.every(
    (s) => results.find((r) => r.id === s.id)?.status === 'PASS',
  );
};
