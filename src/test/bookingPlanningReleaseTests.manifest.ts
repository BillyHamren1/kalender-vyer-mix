/**
 * STEG 5C – Obligatorisk contract-test-svit för Booking→Planning FINAL RELEASE.
 *
 * Detta är den ENDA listan. Final-runnern (scripts/run-booking-planning-final-release.sh)
 * läser den; ingen handskriven testlista får finnas i något script.
 *
 * Regler:
 *  - Manifestet får aldrig vara tomt.
 *  - Varje fil måste finnas på disk.
 *  - Vitest måste faktiskt exekvera samtliga filer; "No test files found" = FAIL.
 */

export interface ReleaseTestEntry {
  /** Sökväg relativt repo-roten. */
  file: string;
  /** Vilket release-område testet skyddar. */
  area: string;
}

export const BOOKING_PLANNING_RELEASE_TESTS: ReleaseTestEntry[] = [
  // Gate-semantik och evidens
  { file: 'src/test/syncE2eGateFailClosed.contract.test.ts', area: 'sql_e2e_gate_semantics' },
  { file: 'src/test/syncE2eEvidencePointer.contract.test.ts', area: 'sql_e2e_gate_semantics' },
  { file: 'src/test/releaseMigrationCompatSafety.contract.test.ts', area: 'compatibility_safety' },
  { file: 'src/test/releaseMigrationCompatibility.contract.test.ts', area: 'compatibility_safety' },
  {
    file: 'src/test/compatibilityEvidenceNegative.contract.test.ts',
    area: 'compatibility_negative_evidence',
  },
  { file: 'src/test/finalReleaseGate.contract.test.ts', area: 'final_release_gate_semantics' },
  {
    file: 'src/test/releaseBindingRuntimeCoverage.contract.test.ts',
    area: 'release_content_binding',
  },
  // Migrationsscope och fingerprints
  {
    file: 'src/test/syncReleaseMigrationFingerprints.contract.test.ts',
    area: 'migration_fingerprints',
  },
  { file: 'src/test/syncReleaseMigrationScope.contract.test.ts', area: 'release_migration_scope' },
  // BSA – tenant-säkerhet
  { file: 'src/test/bsaTenantUniqueness.contract.test.ts', area: 'bsa_tenant_uniqueness' },
  { file: 'src/test/bsaTenantSafeRpc.contract.test.ts', area: 'bsa_tenant_safe_rpc' },
  { file: 'src/test/bsaLegacyRuntimeAudit.contract.test.ts', area: 'bsa_legacy_runtime_audit' },
  { file: 'src/test/legacyBsaRpcRetired.contract.test.ts', area: 'legacy_bsa_retirement' },
  // Destruktiv sync
  {
    file: 'src/test/automaticDestructiveSyncFlag.contract.test.ts',
    area: 'destructive_cancellation_off',
  },
  {
    file: 'src/test/statusChangeNoDestructiveSync.contract.test.ts',
    area: 'status_change_no_destructive_sync',
  },
  // Sync-motorn
  { file: 'src/test/syncBatchLifecycle.contract.test.ts', area: 'sync_batch_lifecycle' },
  { file: 'src/test/syncCursorServerAuthority.contract.test.ts', area: 'sync_cursor_authority' },
  { file: 'src/test/syncJobRetryHardening.contract.test.ts', area: 'sync_job_retry_lease' },
  { file: 'src/test/syncObservability.contract.test.ts', area: 'sync_observability' },
  { file: 'src/test/syncRowCountCircuitBreaker.contract.test.ts', area: 'row_count_circuit_breaker' },
  { file: 'src/test/syncSafetyOperations.contract.test.ts', area: 'sync_safety_operations' },
  { file: 'src/test/syncStateOrgIsolation.contract.test.ts', area: 'sync_state_org_isolation' },
  { file: 'src/test/syncRegressionScenarios.contract.test.ts', area: 'sync_regression_scenarios' },
  { file: 'src/test/syncPerformance.contract.test.ts', area: 'sync_performance' },
];

export const BOOKING_PLANNING_RELEASE_TEST_FILES = BOOKING_PLANNING_RELEASE_TESTS.map(
  (t) => t.file,
);

/** Områden som MÅSTE finnas representerade i manifestet. */
export const REQUIRED_RELEASE_TEST_AREAS = [
  'sql_e2e_gate_semantics',
  'compatibility_safety',
  'compatibility_negative_evidence',
  'final_release_gate_semantics',
  'release_content_binding',
  'migration_fingerprints',
  'release_migration_scope',
  'bsa_tenant_uniqueness',
  'bsa_tenant_safe_rpc',
  'bsa_legacy_runtime_audit',
  'legacy_bsa_retirement',
  'destructive_cancellation_off',
  'status_change_no_destructive_sync',
  'sync_batch_lifecycle',
  'sync_cursor_authority',
  'sync_job_retry_lease',
  'sync_observability',
  'row_count_circuit_breaker',
  'sync_safety_operations',
  'sync_state_org_isolation',
  'sync_regression_scenarios',
  'sync_performance',
];
