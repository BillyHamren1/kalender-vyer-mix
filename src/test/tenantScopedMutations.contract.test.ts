/**
 * STEG 3O — Alla mutationer i normal Booking → Planning-sync ska vara
 * uttryckligt tenant-isolerade och säkerhetskritiska reads fail-closed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/import-bookings/index.ts'),
  'utf-8',
);

const lines = SRC.split('\n');

/** Plockar ut mutation-block (.update/.insert/.delete) mot en tabell */
const mutationBlocks = (table: string): string[] => {
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (!line.includes(`.from('${table}')`)) return;
    const block = lines.slice(i, i + 12).join('\n').split('\n\n')[0];
    if (!/\.(update|delete)\(/.test(block)) return;
    out.push(block);
  });
  return out;
};

describe('STEG 3O — tenant-scopade mutationer i import-bookings', () => {
  it('alla bookings-mutationer har organization_id-filter', () => {
    const unscoped = mutationBlocks('bookings').filter((b) => !b.includes('organization_id'));
    expect(unscoped, `Ofiltrerade bookings-mutationer:\n${unscoped.join('\n---\n')}`).toEqual([]);
  });

  it('alla booking_products-mutationer har organization_id-filter', () => {
    const unscoped = mutationBlocks('booking_products').filter((b) => !b.includes('organization_id'));
    expect(unscoped, `Ofiltrerade produktmutationer:\n${unscoped.join('\n---\n')}`).toEqual([]);
  });

  it('packing_list_items-mutationer scopeas via verifierad packing_id', () => {
    const unscoped = mutationBlocks('packing_list_items').filter(
      (b) => !b.includes('packing_id') && !b.includes('organization_id'),
    );
    expect(unscoped, `Oscopade packlisteitem-mutationer:\n${unscoped.join('\n---\n')}`).toEqual([]);
  });

  it('warehouse_calendar_events upsert använder tenant-säker conflict target', () => {
    expect(SRC).toContain("onConflict: 'organization_id,booking_id,event_type'");
    expect(SRC).not.toContain("onConflict: 'booking_id,event_type'");
  });

  it('existing bookings-read är fail-closed', () => {
    expect(SRC).toContain('existingBookingsError');
    expect(SRC).toContain('FAIL-CLOSED existing bookings read failed');
  });

  it('cross-org-kontrollen är fail-closed vid DB-fel', () => {
    expect(SRC).toContain('cross_org_check_failed');
  });
});
