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

describe('geofencesToFeatures — cirkel-läge', () => {
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
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect((out.fill.features[0].properties as any).shape).toBe('circle');
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

  it('ogiltiga koordinater hoppas över i cirkel-läge', () => {
    const out = geofencesToFeatures([
      { id: 'loc:1', name: 'OK', lat: 59.0, lng: 18.0, radiusMeters: 100 },
      { id: 'loc:2', name: 'Bad', lat: Number.NaN, lng: 18.0, radiusMeters: 100 },
    ]);
    expect(out.fill.features).toHaveLength(1);
  });

  it('radius 0 fallar tillbaka till 200', () => {
    const out = geofencesToFeatures([
      { id: 'loc:1', name: 'X', lat: 59, lng: 18, radiusMeters: 0 },
    ]);
    expect((out.labels.features[0].properties as any).radius).toBe(200);
  });
});

describe('geofencesToFeatures — polygon-läge (exklusivt)', () => {
  const polygon: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [[
      [17.852, 59.491],
      [17.853, 59.491],
      [17.853, 59.492],
      [17.852, 59.492],
      [17.852, 59.491],
    ]],
  };

  it('använder polygonens EXAKTA koordinater, inte circle-approx', () => {
    const out = geofencesToFeatures([
      { id: 'loc:1', name: 'Boende', lat: 59.491, lng: 17.852, radiusMeters: 200, polygon },
    ]);
    const ring = out.fill.features[0].geometry.coordinates[0];
    expect(ring).toHaveLength(5); // inte 65 — inte cirkel
    expect(ring).toEqual(polygon.coordinates[0]);
    expect((out.fill.features[0].properties as any).shape).toBe('polygon');
  });

  it('etikett saknar "· N m" och radius=0', () => {
    const out = geofencesToFeatures([
      { id: 'loc:1', name: 'Boende', lat: 59.491, lng: 17.852, radiusMeters: 200, polygon },
    ]);
    const props = out.labels.features[0].properties as any;
    expect(props.label).toBe('Boende');
    expect(props.radius).toBe(0);
  });

  it('ogiltig polygon fallar tillbaka till cirkel (defensivt)', () => {
    const bad = { type: 'Polygon', coordinates: [[[1, 2]]] } as unknown as GeoJSON.Polygon;
    const out = geofencesToFeatures([
      { id: 'loc:1', name: 'X', lat: 59, lng: 18, radiusMeters: 100, polygon: bad },
    ]);
    expect(out.fill.features[0].geometry.coordinates[0]).toHaveLength(65);
    expect((out.fill.features[0].properties as any).shape).toBe('circle');
  });

  it('aldrig båda formerna för samma id (en feature per site)', () => {
    const out = geofencesToFeatures([
      { id: 'loc:1', name: 'A', lat: 59, lng: 18, radiusMeters: 200, polygon },
      { id: 'loc:2', name: 'B', lat: 59, lng: 18, radiusMeters: 150 },
    ]);
    expect(out.fill.features).toHaveLength(2);
    expect(out.outline.features).toHaveLength(2);
    const a = out.fill.features.find(f => (f.properties as any).id === 'loc:1')!;
    const b = out.fill.features.find(f => (f.properties as any).id === 'loc:2')!;
    expect((a.properties as any).shape).toBe('polygon');
    expect((b.properties as any).shape).toBe('circle');
  });
});
