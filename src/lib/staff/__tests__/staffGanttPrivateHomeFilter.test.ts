import { describe, it, expect } from 'vitest';

const shouldSuppressPrivateHomeBlock = (b: {
  targetType?: string | null;
  reviewReasons?: string[];
  title?: string | null;
  targetLabel?: string | null;
  warningLabel?: string | null;
}) => {
  const reasons = Array.isArray(b.reviewReasons) ? b.reviewReasons : [];
  const hay = `${b.title ?? ''} ${b.targetLabel ?? ''} ${b.warningLabel ?? ''}`.toLowerCase();
  return b.targetType === 'private_residence'
    || reasons.includes('private_residence')
    || reasons.includes('private_residence_status')
    || reasons.includes('home_private_conflict')
    || /\bjag är hemma\b|\bhemma\b|\bprivat zon\b|\bprivate residence\b/.test(hay);
};

describe('StaffGantt private/home failsafe filter', () => {
  it('suppresses leaked private_residence target blocks', () => {
    expect(shouldSuppressPrivateHomeBlock({
      targetType: 'private_residence',
      title: 'Jag är hemma',
    })).toBe(true);
  });

  it('suppresses legacy private_residence_status blocks even without targetType', () => {
    expect(shouldSuppressPrivateHomeBlock({
      reviewReasons: ['private_residence_status'],
      title: 'Behöver granskas',
    })).toBe(true);
  });

  it('does not suppress normal project work blocks', () => {
    expect(shouldSuppressPrivateHomeBlock({
      targetType: 'large_project',
      title: 'Projekt A',
      targetLabel: 'Projekt A',
      reviewReasons: [],
    })).toBe(false);
  });
});
