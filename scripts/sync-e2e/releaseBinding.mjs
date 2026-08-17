#!/usr/bin/env node
/**
 * STEG 5B – Deterministisk content-binding för release-evidensen.
 *
 * En compatibility-rapport får bara godkännas om den är bunden till exakt det
 * innehåll som verifierades. Vi binder därför:
 *
 *   - de 12 release-migrationerna (scope-manifestet)
 *   - compatibility-fixture + legacy-varianter + prestate-fixture
 *   - postconditions
 *   - harness-runnern
 *   - scope-manifest + fingerprint-manifest
 *   - den BSA/sync-runtime som de blockerande contract-gatesen avser
 *
 * Ändras någon av dessa filer blir bindningen en annan → gammal PASS ogiltig.
 * Detta script muterar aldrig något och skriver aldrig fingerprints.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const HARNESS = 'scripts/sync-e2e/release-migration-compat';

/**
 * STEG 5C – runtime-ytan är auditerad: exakt de production/runtime-filer som de
 * obligatoriska Booking→Planning-contract-testerna läser eller importerar.
 * Listan låses av src/test/releaseBindingRuntimeCoverage.contract.test.ts.
 */
export const RELEASE_RUNTIME_FILES = [
  // Frontend BSA / kalender-runtime (legacyBsaRpcRetired, bsaLegacyRuntimeAudit)
  'src/lib/calendar/recomputeBookingStaff.ts',
  'src/lib/calendar/phaseDaysWriter.ts',
  'src/services/bookingPhaseDaysService.ts',
  'src/services/importService.ts',
  'src/services/syncStateService.ts',
  'src/hooks/useEventDragDrop.ts',
  'src/hooks/useEventOperations.tsx',
  'src/hooks/useMoveEventToTeam.ts',
  'src/components/Calendar/AddRiggDayDialog.tsx',
  'src/components/Calendar/MoveDayPopover.tsx',
  'src/components/Calendar/MoveEventDateDialog.tsx',
  // Kalenderläsning/visning som release-testerna skyddar (fönster, teams, self-healing)
  'src/services/eventService.ts',
  'src/services/calendarClearService.ts',
  'src/services/largeProjectService.ts',
  'src/lib/calendar/defaultVisibleTeams.ts',
  'src/components/Calendar/ResourceData.ts',
  'src/hooks/useTeamResources.tsx',
  // Edge-runtime för Booking→Planning-syncen
  'supabase/functions/import-bookings/index.ts',
  'supabase/functions/reconcile-booking-status/index.ts',
  'supabase/functions/_shared/destructiveSyncFlag.ts',
  'supabase/functions/_shared/cancellation-handler.ts',
  'supabase/functions/_shared/syncObservability.ts',
  'supabase/functions/_shared/syncBatch.ts',
  'supabase/functions/_shared/syncJobLifecycle.ts',
  'supabase/functions/_shared/syncKillSwitch.ts',
  'supabase/functions/_shared/syncOpsMetrics.ts',
  'supabase/functions/_shared/singleBookingResult.ts',
  'supabase/functions/_shared/singleBookingSource.ts',
  'supabase/functions/_shared/projectionSourceAuthority.ts',
  'supabase/functions/_shared/syncPerf.ts',
  'supabase/functions/apply-project-dates/index.ts',
  'supabase/functions/planning-api-proxy/index.ts',
];

export const RELEASE_BINDING_FILES = [
  `${HARNESS}/run-compat.sh`,
  `${HARNESS}/fixture.sql`,
  `${HARNESS}/fixture_bsa_legacy_identity.sql`,
  `${HARNESS}/variant_wce_legacy_constraint.sql`,
  `${HARNESS}/variant_wce_legacy_index.sql`,
  `${HARNESS}/postconditions.sql`,
  'src/test/syncReleaseMigrationScope.manifest.ts',
  'src/test/syncReleaseMigrationFingerprints.json',
  ...RELEASE_RUNTIME_FILES,
];


const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export function readScopeMigrations(root = process.cwd()) {
  const src = fs.readFileSync(
    path.join(root, 'src/test/syncReleaseMigrationScope.manifest.ts'),
    'utf8',
  );
  const body = src.split('SYNC_RELEASE_MIGRATIONS')[1] ?? '';
  return [...body.matchAll(/'([0-9]{14}_[0-9a-f-]+\.sql)'/g)].map((m) => m[1]);
}

export function fileHash(rel, root = process.cwd()) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return null;
  return sha256(fs.readFileSync(full));
}

/** Deterministisk hash över hela release-ytan (migrationer + harness + runtime). */
export function computeReleaseBinding(root = process.cwd()) {
  const parts = [];
  const missing = [];
  for (const rel of readScopeMigrations(root).map((f) => `supabase/migrations/${f}`)) {
    const h = fileHash(rel, root);
    if (!h) missing.push(rel);
    parts.push(`${rel}:${h ?? 'MISSING'}`);
  }
  for (const rel of RELEASE_BINDING_FILES) {
    const h = fileHash(rel, root);
    if (!h) missing.push(rel);
    parts.push(`${rel}:${h ?? 'MISSING'}`);
  }
  return {
    algorithm: 'sha256',
    files: parts.length,
    missing,
    scope_manifest_hash: fileHash('src/test/syncReleaseMigrationScope.manifest.ts', root),
    migration_fingerprint_manifest_hash: fileHash(
      'src/test/syncReleaseMigrationFingerprints.json',
      root,
    ),
    release_content_binding: sha256(parts.join('\n')),
  };
}

/** Verifierar att de 12 migrationerna på disk matchar det godkända manifestet. */
export function verifyMigrationFingerprints(root = process.cwd()) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'src/test/syncReleaseMigrationFingerprints.json'), 'utf8'),
  );
  const drift = [];
  for (const entry of manifest.migrations) {
    const actual = fileHash(`supabase/migrations/${entry.migration}`, root);
    if (actual !== entry.sha256) drift.push(entry.migration);
  }
  return { status: drift.length === 0 ? 'PASS' : 'FAIL', drift, count: manifest.migrations.length };
}

if (process.argv[1] && process.argv[1].endsWith('releaseBinding.mjs')) {
  process.stdout.write(
    JSON.stringify(
      { ...computeReleaseBinding(), fingerprints: verifyMigrationFingerprints() },
      null,
      2,
    ) + '\n',
  );
}
