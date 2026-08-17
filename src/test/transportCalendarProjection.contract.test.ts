import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Logistik → Bemanningsplanering projection contract', () => {
  it('läser transport_assignments utan att skriva calendar_events', () => {
    const hook = read('src/hooks/useTransportCalendarProjection.ts');
    expect(hook).toContain(".from('transport_assignments')");
    expect(hook).not.toContain(".from('calendar_events')");
    expect(hook).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });

  it('berikar befintliga kalenderkort istället för att skapa ny transportresurs', () => {
    const page = read('src/pages/CustomCalendarPage.tsx');
    expect(page).toContain('logisticsTransports');
    expect(page).toContain('transportByBookingAndDate');
    expect(page).toContain("e.resourceId !== 'transport'");
  });

  it('har snabb registrering men behåller transport_assignments som write-path', () => {
    const dialog = read('src/components/logistics/QuickTransportDialog.tsx');
    expect(dialog).toContain('assignBookingToVehicle');
    expect(dialog).toContain('updateAssignment');
    expect(dialog).not.toContain('calendar_events');
  });
});
