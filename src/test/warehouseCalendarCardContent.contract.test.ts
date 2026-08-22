import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync('src/pages/WarehouseCalendarPage.tsx', 'utf8');
const card = fs.readFileSync('src/components/Calendar/CustomEvent.tsx', 'utf8');
const filter = fs.readFileSync('src/components/Calendar/WarehouseEventFilter.tsx', 'utf8');

describe('Lagerkalenderns kortinnehåll (presentation only)', () => {
  it('rig/event/rigDown renderas inte som egna lagerposter', () => {
    expect(page).not.toContain('filteredCalendarEvents');
    expect(filter).not.toMatch(/id: 'rig'/);
    expect(filter).not.toMatch(/id: 'rigDown'/);
  });

  it('planning-datum finns kvar som kontext på lagerkortet', () => {
    expect(page).toContain('phaseContext');
    expect(card).toContain('phaseContext');
  });

  it('kortet berikas med aktivitet, rubrik, tid, packstatus och bemanning', () => {
    for (const key of [
      'warehouseActivityLabel',
      'bookingTitle',
      'timeLabel',
      'packedLabel',
      'crewLabel',
    ]) {
      expect(page).toContain(key);
      expect(card).toContain(key);
    }
    // "Brister" får inte visas utan verklig shortage-data; opackade rader är inte brister.
    expect(card).not.toContain('brister');
    expect(page).not.toContain('shortfallCount');
  });

  it('bemanning kommer från exakt aktiv lagerhändelse', () => {
    const meta = fs.readFileSync('src/hooks/useWarehouseCardMeta.ts', 'utf8');
    expect(page).toContain('eventCrew?.get(warehouseEventKeyOf(event))');
    expect(meta).toContain("from('warehouse_assignments')");
    expect(meta).toContain(".in('warehouse_event_id', ids)");
    expect(meta).toContain(".neq('status', 'cancelled')");
    expect(meta).not.toContain("from('staff_assignments')");
  });

  it('metadata-hämtningen är read-only', () => {
    const meta = fs.readFileSync('src/hooks/useWarehouseCardMeta.ts', 'utf8');
    expect(meta).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });
});
