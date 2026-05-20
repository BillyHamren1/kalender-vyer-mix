import { describe, it, expect } from 'vitest';
import { geofencesToFeatures, themeForId } from '../geofencesToFeatures';

describe('themeForId', () => {
  it('mappar id-prefix till rätt typ', () => {
    expect(themeForId('loc:1').kind).toBe('location');
    expect(themeForId('booking:abc').kind).toBe('booking');
    expect(themeForId('project:xyz').kind).toBe('project');
    expect(themeForId('large:42').kind).toBe('large');
    expect(themeForId('mystery').kind).toBe('other');
  });
});

describe('geofencesToFeatures', () => {
  it('tomt input → tre tomma FCs', () => {
    const out = geofencesToFeatures([]);
    expect(out.fill.features).toHaveLength(0);
    expect(out.outline.features).toHaveLength(0);
    expect(out.labels.features).toHaveLength(0);
  });

  it('en cirkel ger 65 ring-coords (64 steg + stängning)', () => {
    const out = geofencesToFeatures([
      { id: 'loc:1', name: 'Lager', lat: 59.0, lng: 18.0, radiusMeters: 200 },
    ]);
    expect(out.fill.features).toHaveLength(1);
    const ring = out.fill.features[0].geometry.coordinates[0];
    expect(ring).toHaveLength(65);
    // Stängd polygon
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('properties speglar typ + radie + namn', () => {
    const out = geofencesToFeatures([
      { id: 'project:99', name: 'Westers', lat: 59.3, lng: 18.07, radiusMeters: 150 },
    ]);
    const props = out.labels.features[0].properties as any;
    expect(props.kind).toBe('project');
    expect(props.color).toBe('#f97316');
    expect(props.radius).toBe(150);
    expect(props.label).toContain('Westers');
    expect(props.label).toContain('150 m');
  });

  it('ogiltiga koordinater hoppas över', () => {
    const out = geofencesToFeatures([
      { id: 'loc:1', name: 'OK', lat: 59.0, lng: 18.0, radiusMeters: 100 },
      { id: 'loc:2', name: 'Bad', lat: Number.NaN, lng: 18.0, radiusMeters: 100 },
    ]);
    expect(out.fill.features).toHaveLength(1);
  });

  it('radius < 10m clampar till 10', () => {
    const out = geofencesToFeatures([
      { id: 'loc:1', name: 'X', lat: 59, lng: 18, radiusMeters: 0 },
    ]);
    expect((out.labels.features[0].properties as any).radius).toBe(200); // fallback via || 200
  });
});
