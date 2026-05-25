import { describe, it, expect } from 'vitest';
import { parseGapDescription, resolveTravelLabels } from '../travelLabel';

describe('parseGapDescription', () => {
  it('parsar standard gap-beskrivning', () => {
    expect(parseGapDescription('Gap: Lager → Craft of Scandinavia AB - 16 maj 2026 (92 min)')).toEqual({
      from: 'Lager',
      to: 'Craft of Scandinavia AB - 16 maj 2026',
    });
  });

  it('parsar "Auto-switch X → Y" utan (N min)-suffix', () => {
    expect(parseGapDescription('Auto-switch Tiomila 2026 → FA Warehouse')).toEqual({
      from: 'Tiomila 2026',
      to: 'FA Warehouse',
    });
  });

  it('parsar "Switch: X → Y"', () => {
    expect(parseGapDescription('Switch: A → B')).toEqual({ from: 'A', to: 'B' });
  });

  it('tål extra mellanslag', () => {
    expect(parseGapDescription('  Gap:  A  →  B (10 min)  ')).toEqual({ from: 'A', to: 'B' });
  });

  it('returnerar null för ickematchande text', () => {
    expect(parseGapDescription('Manuell resa')).toEqual({ from: null, to: null });
    expect(parseGapDescription(null)).toEqual({ from: null, to: null });
    expect(parseGapDescription('')).toEqual({ from: null, to: null });
  });
});

describe('resolveTravelLabels', () => {
  it('föredrar from_address/to_address när de finns', () => {
    const r = resolveTravelLabels({
      from_address: 'Storgatan 1',
      to_address: 'Lillgatan 2',
      description: 'Gap: A → B (10 min)',
    });
    expect(r.fromLabel).toBe('Storgatan 1');
    expect(r.toLabel).toBe('Lillgatan 2');
    expect(r.fromFromDescription).toBe(false);
    expect(r.toFromDescription).toBe(false);
  });

  it('faller tillbaka på description när from_address saknas', () => {
    const r = resolveTravelLabels({
      from_address: null,
      to_address: 'Craft of Scandinavia AB - 16 maj 2026',
      description: 'Gap: Lager → Craft of Scandinavia AB - 16 maj 2026 (92 min)',
    });
    expect(r.fromLabel).toBe('Lager');
    expect(r.fromFromDescription).toBe(true);
    expect(r.toFromDescription).toBe(false);
  });

  it('faller tillbaka på koordinater när varken adress eller description ger något', () => {
    const r = resolveTravelLabels({
      from_address: null,
      to_address: null,
      description: null,
      from_latitude: 59.2620653,
      from_longitude: 17.8915914,
      to_latitude: 59.3255677,
      to_longitude: 18.0711248,
    });
    expect(r.fromLabel).toBe('Pos 59.262, 17.892');
    expect(r.toLabel).toBe('Pos 59.326, 18.071');
    expect(r.fromFromDescription).toBe(true);
    expect(r.toFromDescription).toBe(true);
  });

  it('returnerar null när varken adress, description eller koordinater finns', () => {
    const r = resolveTravelLabels({ from_address: null, to_address: null, description: null });
    expect(r.fromLabel).toBeNull();
    expect(r.toLabel).toBeNull();
  });
});
