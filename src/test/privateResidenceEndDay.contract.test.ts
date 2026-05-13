/**
 * Contract test — Private Residence Auto End-Day
 *
 * Hemadresser (organization_locations.is_private_residence=true,
 * t.ex. "Boende - Vällsta") får ALDRIG fungera som arbetsplats.
 *
 * Reglerna som låses här:
 *  1. Mobile API returnerar `is_private_residence` + `location_type` i
 *     get_organization_locations-payloaden (annars kan klienten inte veta).
 *  2. useGeofencing.ts har en gren som hoppar över auto-arrival för
 *     is_private_residence och dispatchar `request-end-day` med
 *     `reason: 'arrived_home'` när man är inne i polygonen + har timers.
 *  3. Auto-start-grenen för fixed locations skippas (`continue`) för
 *     private residences.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..', '..');

describe('Private residence auto end-day (Vällsta)', () => {
  it('mobile-app-api: get_organization_locations selectar is_private_residence + location_type', () => {
    const src = readFileSync(
      resolve(repoRoot, 'supabase/functions/mobile-app-api/index.ts'),
      'utf8',
    );
    // Hitta handleGetOrganizationLocations-blocket
    const idx = src.indexOf('async function handleGetOrganizationLocations');
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx, idx + 1200);
    expect(block).toMatch(/is_private_residence/);
    expect(block).toMatch(/location_type/);
  });

  it('useGeofencing: typen exponerar is_private_residence + location_type', () => {
    const src = readFileSync(
      resolve(repoRoot, 'src/hooks/useGeofencing.ts'),
      'utf8',
    );
    const ifaceIdx = src.indexOf('export interface OrganizationLocationMobile');
    expect(ifaceIdx).toBeGreaterThan(0);
    const iface = src.slice(ifaceIdx, ifaceIdx + 800);
    expect(iface).toMatch(/is_private_residence\?:/);
    expect(iface).toMatch(/location_type\?:/);
  });

  it('useGeofencing: dispatchar request-end-day vid inträde i private residence med aktiv timer', () => {
    const src = readFileSync(
      resolve(repoRoot, 'src/hooks/useGeofencing.ts'),
      'utf8',
    );
    // Måste finnas one-shot ref
    expect(src).toMatch(/triggeredHomeEndDayRef/);
    // Måste hoppa över auto-arrival för private residences
    expect(src).toMatch(/loc\.is_private_residence\s*===\s*true/);
    // Måste dispatcha request-end-day med reason arrived_home
    expect(src).toMatch(/request-end-day[\s\S]{0,200}arrived_home/);
    // Måste ha continue (hoppa förbi auto-arrival/start för hemzon)
    const homeBlockIdx = src.indexOf('PRIVATE RESIDENCE / HOME ZONE');
    expect(homeBlockIdx).toBeGreaterThan(0);
    const homeBlock = src.slice(homeBlockIdx, homeBlockIdx + 2000);
    expect(homeBlock).toMatch(/continue;/);
  });
});
