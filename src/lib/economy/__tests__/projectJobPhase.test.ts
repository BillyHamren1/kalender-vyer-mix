import { describe, it, expect } from 'vitest';
import { getProjectJobPhase, getJobLastDay } from '../projectJobPhase';

const d = (s: string) => new Date(`${s}T12:00:00`);

describe('getProjectJobPhase', () => {
  const job = {
    rigdaydate: '2026-05-10',
    eventdate: '2026-05-11',
    rigdowndate: '2026-05-12',
  };

  it('är kommande före första riggdagen', () => {
    expect(getProjectJobPhase(job, d('2026-05-09'))).toBe('upcoming');
  });

  it('är pågående på riggdagen', () => {
    expect(getProjectJobPhase(job, d('2026-05-10'))).toBe('active');
  });

  it('är fortfarande pågående på sista nedriggdagen', () => {
    expect(getProjectJobPhase(job, d('2026-05-12'))).toBe('active');
  });

  it('blir avslutat dagen efter sista nedriggdagen', () => {
    expect(getProjectJobPhase(job, d('2026-05-13'))).toBe('finished');
  });

  it('faller tillbaka på eventdatum när nedrigg saknas', () => {
    const p = { rigdaydate: null, eventdate: '2026-05-11', rigdowndate: null };
    expect(getJobLastDay(p)).toBe('2026-05-11');
    expect(getProjectJobPhase(p, d('2026-05-11'))).toBe('active');
    expect(getProjectJobPhase(p, d('2026-05-12'))).toBe('finished');
  });

  it('är utan datum när inget datum finns', () => {
    expect(getProjectJobPhase({}, d('2026-05-12'))).toBe('undated');
  });
});
