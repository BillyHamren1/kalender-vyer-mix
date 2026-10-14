import { describe, expect, it } from 'vitest';
import { warehouseAssignmentScopes, allowsLegacyWarehouseJob, warehouseMobileEventType } from '../../supabase/functions/_shared/warehouseAssignmentPrecedence';

const day = '2026-10-14';
const assignment = { assignment_date: day, warehouse_event_id: 'selected', metadata: { resource_id: 'lager-1' } };
const event = { start_time: '2026-10-14T08:00:00Z', resource_id: 'lager-1' };

describe('warehouse assignment precedence', () => {
  it('keeps existing team staffing when there are no concrete assignments', () => {
    expect(allowsLegacyWarehouseJob(warehouseAssignmentScopes([], new Map()), day, 'lager-1')).toBe(true);
  });
  it('prevents selecting one job from assigning every other job on the mirrored team', () => {
    const scopes = warehouseAssignmentScopes([assignment], new Map([['selected', event]]));
    expect(allowsLegacyWarehouseJob(scopes, day, 'lager-1')).toBe(false);
    expect(allowsLegacyWarehouseJob(scopes, day, 'lager-2')).toBe(true);
    expect(allowsLegacyWarehouseJob(scopes, '2026-10-15', 'lager-1')).toBe(true);
  });
  it('keeps cancellation authoritative when it is the last remaining concrete row', () => {
    const rows = [{ ...assignment, status: 'cancelled' }];
    expect(allowsLegacyWarehouseJob(warehouseAssignmentScopes(rows, new Map()), day, 'lager-1')).toBe(false);
  });
  it('blocks original and current scopes when a job has moved, preserving unrelated teams', () => {
    const scopes = warehouseAssignmentScopes([assignment], new Map([['selected', { start_time: '2026-10-14T22:30:00Z', resource_id: 'lager-2' }]]));
    expect(allowsLegacyWarehouseJob(scopes, day, 'lager-1')).toBe(false);
    expect(allowsLegacyWarehouseJob(scopes, '2026-10-15', 'lager-2')).toBe(false);
    expect(allowsLegacyWarehouseJob(scopes, day, 'lager-2')).toBe(true);
  });
  it('honors explicit mirror provenance for a transport event mirrored into lager-1', () => {
    const scopes = warehouseAssignmentScopes([{ ...assignment, metadata: { resource_id: 'transport', mirrored_team_id: 'lager-1' } }], new Map());
    expect(allowsLegacyWarehouseJob(scopes, day, 'transport')).toBe(false);
    expect(allowsLegacyWarehouseJob(scopes, day, 'lager-1')).toBe(false);
    expect(allowsLegacyWarehouseJob(scopes, day, 'lager-2')).toBe(true);
  });
  it.each(['return', 'inventory', 'unpacking'])('maps dated %s events to their scanner action type', (type) => {
    expect(warehouseMobileEventType(`${type}_2026-10-14`)).toBe(type);
    expect(warehouseMobileEventType(type)).toBe(type);
  });
  it('does not treat arbitrary prefixes as warehouse action types', () => {
    expect(warehouseMobileEventType('return_unknown')).toBe('return_unknown');
    expect(warehouseMobileEventType('event_2026-10-14')).toBe('event_2026-10-14');
  });
});
