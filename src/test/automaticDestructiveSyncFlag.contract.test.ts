import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

const FLAG = read('supabase/functions/_shared/destructiveSyncFlag.ts');
const HANDLER = read('supabase/functions/_shared/cancellation-handler.ts');
const RECONCILE = read('supabase/functions/reconcile-booking-status/index.ts');
const IMPORT = read('supabase/functions/import-bookings/index.ts');

// Ren funktion importeras statiskt via eval av modulen? Nej — enkel spegling:
function isEnabled(raw: string | null | undefined) {
  return raw === 'true';
}

describe('AUTOMATIC_DESTRUCTIVE_SYNC_ENABLED feature flag', () => {
  it('endast exakt "true" aktiverar automation', () => {
    expect(isEnabled('true')).toBe(true);
    for (const v of [undefined, null, '', 'false', 'TRUE', '1', 'yes', ' true ']) {
      expect(isEnabled(v as any)).toBe(false);
    }
    expect(FLAG).toContain("raw === 'true'");
  });

  it('hård gräns är 1 och definieras server-side', () => {
    expect(FLAG).toContain('MAX_AUTOMATIC_CANCELLATIONS_PER_RUN = 1');
  });
});

describe('cancellation-handler är låst (defense in depth)', () => {
  it('kontrollerar flaggan innan RPC-anropet', () => {
    const guardIdx = HANDLER.indexOf('isAutomaticDestructiveSyncEnabled()');
    const rpcIdx = HANDLER.indexOf("supabase.rpc('apply_booking_cancellation_atomic'");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(rpcIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(rpcIdx);
  });

  it('returnerar automatic_destructive_sync_disabled som error-outcome', () => {
    expect(HANDLER).toContain("outcome: 'automatic_destructive_sync_disabled'");
    expect(HANDLER).toMatch(/status: 'error',[\s\S]{0,200}automatic_destructive_sync_disabled/);
  });
});

describe('reconcile-booking-status', () => {
  it('kan inte höja maxgränsen via request body', () => {
    expect(RECONCILE).not.toContain('body?.max_cancellations');
    expect(RECONCILE).toContain('const maxCancellations = MAX_AUTOMATIC_CANCELLATIONS_PER_RUN');
  });

  it('dry-run är standard', () => {
    expect(RECONCILE).toContain('let dryRunRequested = true');
    expect(RECONCILE).toContain('let confirmed = false');
  });

  it('live-apply kräver flagga + dry_run=false + confirm + exakt en booking_id', () => {
    const line = RECONCILE.split('\n').find((l) => l.includes('const liveApply ='))!;
    expect(line).toContain('flagEnabled');
    expect(line).toContain('dryRunRequested === false');
    expect(line).toContain('confirmed === true');
    expect(line).toContain('onlyBookingId');
  });

  it('bred körning utan booking_id kan aldrig live-avboka', () => {
    // liveApply kräver onlyBookingId; utan den blir !liveApply → continue före mutation
    expect(RECONCILE).toContain('if (!liveApply) {');
    const blockIdx = RECONCILE.indexOf('if (!liveApply) {');
    const applyIdx = RECONCILE.indexOf('await applyBookingCancellation(');
    expect(blockIdx).toBeLessThan(applyIdx);
  });

  it('loggar blockerad kandidat strukturerat', () => {
    expect(RECONCILE).toContain('logBlockedCancellation({');
    expect(RECONCILE).toContain('caller: "reconcile-booking-status"');
  });
});

describe('import-bookings cancellation-väg', () => {
  it('blockerar innan handlern anropas', () => {
    const guardIdx = IMPORT.indexOf('if (!isAutomaticDestructiveSyncEnabled()) {');
    const applyIdx = IMPORT.indexOf('await applyBookingCancellation(');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(applyIdx);
  });

  it('jobbet blir inte completed (outcome failed) och cursorn flyttas inte', () => {
    const seg = IMPORT.slice(
      IMPORT.indexOf('if (!isAutomaticDestructiveSyncEnabled()) {'),
      IMPORT.indexOf('await applyBookingCancellation('),
    );
    expect(seg).toContain("outcome: 'failed'");
    expect(seg).toContain('AUTOMATIC_DESTRUCTIVE_SYNC_DISABLED');
  });

  it('felet är permanent (ingen evig retry som flyttar cursor)', () => {
    const contract = read('supabase/functions/_shared/singleBookingResult.ts');
    expect(contract).toContain("'automatic_destructive_sync_disabled'");
  });
});

describe('säkerhetslogg', () => {
  it('loggar booking_id, organization_id, revision och caller utan secrets', () => {
    expect(FLAG).toContain('booking_id');
    expect(FLAG).toContain('organization_id');
    expect(FLAG).toContain('source_revision');
    expect(FLAG).toContain('caller');
    expect(FLAG).not.toMatch(/accessToken|apikey|service_role/i);
  });
});
