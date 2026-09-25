import { describe, it, expect } from 'vitest';
import { describeLargeProjectLinkError as d } from '../linkErrorMessage';
import { LargeProjectMembershipConflictError } from '../largeProjectMembers';

describe('describeLargeProjectLinkError', () => {
  it('konflikt med namn behåller serviceklassens text', () => {
    expect(d(new LargeProjectMembershipConflictError('x', 'Mässan'))).toContain('Mässan');
  });
  it('rå RPC-konflikt', () => {
    expect(d(new Error('Kunde inte koppla bokningen till projektet: BOOKING_IN_OTHER_PROJECT:abc'))).toMatch(/annat aktivt/);
  });
  it('raderat projekt', () => expect(d(new Error('x: PROJECT_NOT_FOUND'))).toMatch(/raderat/));
  it('org-mismatch', () => expect(d(new Error('x: ORGANIZATION_MISMATCH'))).toMatch(/olika organisationer/));
  it('RLS', () => expect(d({ code: '42501', message: 'new row violates row-level security' })).toMatch(/behörighet/));
  it('okänt fel faller tillbaka', () => expect(d(null)).toMatch(/Kunde inte/));
});
