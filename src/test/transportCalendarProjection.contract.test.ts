import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('First-class transport planning contract', () => {
  it('läser transport_assignments utan att skriva calendar_events', () => {
    const hook = read('src/hooks/useTransportCalendarProjection.ts');
    expect(hook).toContain(".from('transport_assignments')");
    expect(hook).not.toContain(".from('calendar_events')");
    expect(hook).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });

  it('har en egen transportresurs separerad från Lager', () => {
    const teams = read('src/hooks/useTeamResources.tsx');
    expect(teams).toContain("id: 'warehouse', title: 'Lager'");
    expect(teams).toContain("id: 'logistics-transport', title: 'Transport'");
    expect(teams).toContain("team_id='transport'"); // documented legacy adapter only
  });

  it('renderar transport_assignments som egna transportkort i bemanningskalendern', () => {
    const page = read('src/pages/CustomCalendarPage.tsx');
    expect(page).toContain("resourceId: 'logistics-transport'");
    expect(page).toContain('transportItems');
    expect(page).toContain('isTransportPlanning');
  });

  it('snabbplanering skriver endast till transport_assignments', () => {
    const dialog = read('src/components/logistics/TransportPlanningDialog.tsx');
    expect(dialog).toContain(".from('transport_assignments').insert");
    expect(dialog).not.toContain(".from('calendar_events')");
    expect(dialog).toContain("vehicle_id: vehicleId === 'unassigned' ? null : vehicleId");
    expect(dialog).toContain("planning_status: planningStatus");
  });

  it('migrationen tillåter flera transporter per bokning/dag och valfritt fordon', () => {
    const migration = read('supabase/migrations/20260819145100_transport_planning_first_class.sql');
    expect(migration).toContain('ALTER COLUMN vehicle_id DROP NOT NULL');
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS transport_assignments_booking_id_transport_date_key');
    expect(migration).toContain("planning_status text NOT NULL DEFAULT 'preliminary'");
    expect(migration).toContain('transport_end_time time without time zone');
  });
});
