// @vitest-environment node
/**
 * CONTRACT: personalkalendern/planeraren får bara ha EN datumkälla och inga
 * maskerande filter.
 *
 * Bakgrund: bokningar "försvann" för vissa användare men inte andra. Orsaken
 * var (a) ett parallellt datumankare i sessionStorage som gjorde att olika
 * användare hämtade olika datumfönster, (b) guards som behöll förra resultatet
 * när en hämtning gav färre/inga rader, och (c) tysta 1000-radersgränser.
 *
 * Dessa tre får aldrig återinföras.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const HOOK = 'src/hooks/useRealTimeCalendarEvents.tsx';
const PAGE = 'src/pages/PersonalkalendernPage.tsx';
const SERVICE = 'src/services/eventService.ts';

describe('kalender — en datumkälla', () => {
  it('kalenderhooken använder inte sessionStorage som datumankare', () => {
    const src = read(HOOK);
    expect(src.includes("sessionStorage.getItem('calendarDate')")).toBe(false);
    expect(src.includes("sessionStorage.setItem('calendarDate'")).toBe(false);
  });

  it('personalkalendern skickar in sin vecka som ankare till hämtningen', () => {
    const src = read(PAGE);
    expect(src).toMatch(/useRealTimeCalendarEvents\(\{\s*[\s\S]*anchorDate:\s*weekStart/);
  });

  it('dubbletthooken useCalendarEvents är borttagen', () => {
    expect(existsSync(resolve(process.cwd(), 'src/hooks/useCalendarEvents.tsx'))).toBe(false);
  });
});

describe('kalender — inga maskerande filter', () => {
  it('inga "behåll förra resultatet"-guards i hooken', () => {
    const src = read(HOOK);
    expect(/Ignoring empty reload/.test(src)).toBe(false);
    expect(/suspicious shrink/i.test(src)).toBe(false);
    expect(/prev\.length \* 0\.5/.test(src)).toBe(false);
  });

  it('hämtningsfel exponeras som eget tillstånd', () => {
    expect(read(HOOK)).toMatch(/loadError/);
    expect(read(PAGE)).toMatch(/loadError/);
  });
});

describe('kalender — inga tysta radgränser', () => {
  it('bemanningstabellen hämtas inte längre i kalenderkedjan', () => {
    expect(read(SERVICE).includes("from('booking_staff_assignments')")).toBe(false);
  });

  it('alla stödfrågor går genom fetchAllPages', () => {
    const src = read(SERVICE);
    for (const table of [
      'large_project_bookings',
      'large_project_team_assignments',
    ]) {
      const idx = src.indexOf(`from('${table}')`);
      expect(idx, `${table} saknas i eventService`).toBeGreaterThan(-1);
      // .range(...) måste finnas i samma kedja
      expect(src.slice(idx, idx + 400)).toMatch(/\.range\(/);
    }
  });

  it('hookens batch-hämtningar är sidindelade', () => {
    const src = read(HOOK);
    expect(src).toMatch(/fetchAllPages/);
    expect(src).not.toMatch(/\.in\('id', uniqueBookingIds\);/);
  });
});
