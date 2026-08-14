/**
 * STEG 4K — Inga "data-only" reads får bli falska not_found/empty i syncbeslut.
 *
 * Klass A (canonical decision read) MÅSTE destrukturera .error och fail-closa.
 * Klass B (best-effort observability) får sakna fail-close, men bara om
 * resultatet aldrig styr canonical mutation eller outcome.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PATH = 'supabase/functions/import-bookings/index.ts';
const SRC = readFileSync(join(process.cwd(), PATH), 'utf-8');
const LINES = SRC.split('\n');

/** Alla `const { data: X } = await supabase` utan error-destrukturering. */
function unguardedDataOnlyReads(): string[] {
  return LINES.filter((l) => /const \{\s*data:\s*\w+\s*\}\s*=\s*await supabase/.test(l)).map((l) => l.trim());
}

describe('STEG 4K — global data-only read audit', () => {
  it('inga oskyddade await-reads mot supabase finns kvar', () => {
    const found = unguardedDataOnlyReads();
    expect(found, `Oskyddade data-only reads:\n${found.join('\n')}`).toEqual([]);
  });

  it('storage.getPublicUrl är KLASS B (synkront API utan error-fält)', () => {
    const idx = SRC.indexOf('const { data: urlData } = supabase.storage');
    expect(idx).toBeGreaterThan(-1);
    // Ingen await → inget error-fält att kontrollera; påverkar bara URL-metadata.
    expect(SRC.slice(idx, idx + 120)).not.toContain('await');
  });

  it('alla känsliga tabeller läses med error-hantering i syncbeslut', () => {
    for (const table of [
      'bookings',
      'booking_products',
      'packing_projects',
      'calendar_events',
      'projects',
      'large_projects',
      'booking_staff_assignments',
    ]) {
      const bad = LINES.filter(
        (l, i) =>
          /const \{\s*data:\s*\w+\s*\}\s*=\s*await supabase/.test(l) &&
          LINES.slice(i, i + 6).some((n) => n.includes(`.from('${table}')`)),
      );
      expect(bad, `${table} har oskyddad read`).toEqual([]);
    }
  });
});

describe('STEG 4K — cancellation candidate local booking read', () => {
  const block = (() => {
    const i = SRC.indexOf("decision.action === 'cancellation'");
    return SRC.slice(i, i + 4500);
  })();

  it('destrukturerar .error', () => {
    expect(block).toContain('error: existingBookingReadError');
  });

  it('DB-fel → outcome failed, ingen cancellation, ingen cursor', () => {
    const i = block.indexOf('if (existingBookingReadError)');
    expect(i).toBeGreaterThan(-1);
    const fail = block.slice(i, i + 900);
    expect(fail).toContain("outcome: 'failed'");
    expect(fail).toContain('cancellation_local_booking_read_failed');
    expect(fail).not.toContain("outcome: 'already_current'");
  });

  it('fail-closed-grenen ligger FÖRE !existingBooking-grenen', () => {
    expect(block.indexOf('if (existingBookingReadError)')).toBeLessThan(block.indexOf('if (!existingBooking)'));
  });

  it('lyckad read med noll rader ger fortfarande already_current (cancellation_noop)', () => {
    const i = block.indexOf('if (!existingBooking)');
    const noop = block.slice(i, i + 500);
    expect(noop).toContain("outcome: 'already_current'");
    expect(noop).toContain('cancellation_noop');
  });

  it('lyckad read med befintlig CANCELLED-rad är idempotent already_current', () => {
    expect(block).toContain('cancellation_idempotent');
  });

  it('kandidat utan destruktiv åtgärd är kvar (ingen mutation)', () => {
    expect(block).toContain("outcome: 'cancellation_requires_explicit_apply'");
    expect(block).toContain('mutations: 0');
  });

  it('failed är inte success → completed=false, ingen revision commit', () => {
    const contract = readFileSync(
      join(process.cwd(), 'supabase/functions/_shared/singleBookingResult.ts'),
      'utf-8',
    );
    expect(contract).toContain("SUCCESS_OUTCOMES: readonly SingleBookingOutcome[] = ['applied', 'already_current']");
    expect(contract).toContain('completed: isSuccess');
  });
});

describe('STEG 4K — packing reconnection reads', () => {
  const block = (() => {
    const i = SRC.indexOf('PRODUCT UPDATE WITH PACKING LIST RECONNECTION');
    return SRC.slice(i, i + 2500);
  })();

  it('packing_projects read har .error och fail-closar bokningen', () => {
    expect(block).toContain('error: packingProjectReadError');
    const i = block.indexOf('if (packingProjectReadError)');
    const fail = block.slice(i, i + 400);
    expect(fail).toContain('packing_project_read_failed');
    expect(fail).toContain('results.failed++');
    expect(fail).toContain('continue;');
  });

  it('booking_products (old products) read har .error och fail-closar bokningen', () => {
    expect(block).toContain('error: oldProductsReadError');
    const i = block.indexOf('if (oldProductsReadError)');
    const fail = block.slice(i, i + 400);
    expect(fail).toContain('old_products_read_failed');
    expect(fail).toContain('results.failed++');
    expect(fail).toContain('continue;');
  });

  it('fail-close sker FÖRE beslutet om reconnection/preservation', () => {
    expect(block.indexOf('if (oldProductsReadError)')).toBeLessThan(block.indexOf('needsPackingReconnection ='));
  });

  it('lyckad read med noll rader ger fortfarande no-op reconnection', () => {
    expect(block).toContain('oldProducts = oldProductsData || null;');
    expect(block).toContain('needsPackingReconnection = !!(packingProject?.id && oldProducts && oldProducts.length > 0');
  });
});

describe('STEG 4K — cursor och attachments', () => {
  it('sync_state cursor read fail-closar (inget felaktigt importfönster)', () => {
    expect(SRC).toContain('error: syncStateReadError');
    expect(SRC).toContain('sync_cursor_read_failed');
    const i = SRC.indexOf('if (syncStateReadError)');
    expect(SRC.slice(i, i + 700)).toContain('completed: false');
  });

  it('booking_attachments dedup-read fail-closar istället för att gissa "inga bilagor"', () => {
    expect(SRC).toContain('error: existingAttachmentsError');
    expect(SRC).toContain('attachments_existing_read_failed');
  });
});

describe('STEG 4K — inga nya destruktiva vägar', () => {
  it('cancellation är fortfarande blockerad i normal sync', () => {
    expect(SRC).toContain('CANCELLATION_REQUIRES_EXPLICIT_APPLY');
    expect(SRC).toContain('logBlockedCancellation');
  });
});
