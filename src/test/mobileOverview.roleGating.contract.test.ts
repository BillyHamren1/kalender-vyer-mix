import { describe, it, expect } from 'vitest';
import type { MobileStaff, MobileAppRole } from '@/services/mobileApiService';

/**
 * Contract: a user is "Planner" iff they have ≥1 row in `user_roles`.
 * The backend computes `is_planner = app_roles.length > 0` and the frontend
 * `useMobileRoles` falls back to the same rule. Any of the four app roles
 * (admin, forsaljning, projekt, lager) qualifies.
 */
function isPlanner(staff: Pick<MobileStaff, 'app_roles' | 'is_planner'> | null): boolean {
  if (!staff) return false;
  if (typeof staff.is_planner === 'boolean') return staff.is_planner;
  return (staff.app_roles ?? []).length > 0;
}

describe('mobile overview role gating', () => {
  const make = (roles: MobileAppRole[], isPlannerFlag?: boolean): Pick<MobileStaff, 'app_roles' | 'is_planner'> => ({
    app_roles: roles,
    is_planner: isPlannerFlag,
  });

  it('field staff with no app_roles is NOT a planner', () => {
    expect(isPlanner(make([], false))).toBe(false);
    expect(isPlanner(make([]))).toBe(false);
  });

  it('staff with admin role IS a planner', () => {
    expect(isPlanner(make(['admin'], true))).toBe(true);
  });

  it('staff with projekt role IS a planner', () => {
    expect(isPlanner(make(['projekt'], true))).toBe(true);
  });

  it('staff with forsaljning role IS a planner', () => {
    expect(isPlanner(make(['forsaljning'], true))).toBe(true);
  });

  it('staff with lager role IS a planner', () => {
    expect(isPlanner(make(['lager'], true))).toBe(true);
  });

  it('staff with multiple roles IS a planner', () => {
    expect(isPlanner(make(['admin', 'projekt', 'lager'], true))).toBe(true);
  });

  it('falls back to app_roles length when is_planner flag missing', () => {
    expect(isPlanner(make(['admin']))).toBe(true);
    expect(isPlanner(make([]))).toBe(false);
  });

  it('null staff is never a planner', () => {
    expect(isPlanner(null)).toBe(false);
  });
});
