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

  it('kortet berikas med aktivitet, rubrik, tid, packstatus, brister och bemanning', () => {
    for (const key of [
      'warehouseActivityLabel',
      'bookingTitle',
      'timeLabel',
      'packedLabel',
      'shortfallCount',
      'crewLabel',
    ]) {
      expect(page).toContain(key);
      expect(card).toContain(key);
    }
    expect(card).toContain('brister');
  });

  it('metadata-hämtningen är read-only', () => {
    const meta = fs.readFileSync('src/hooks/useWarehouseCardMeta.ts', 'utf8');
    expect(meta).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });
});
