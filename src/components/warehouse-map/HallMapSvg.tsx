import React from 'react';
import type { WarehouseMap } from '../../../supabase/functions/_shared/warehouseArticleLocations';

const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;
export const safeRackColor = (c: string) => (SAFE_COLOR.test(c) ? c : 'hsl(var(--muted-foreground))');

interface Props {
  map: WarehouseMap;
  selectedRackId: string | null;
  highlightedRackIds: Set<string>;
  onSelectRack: (rackId: string) => void;
}

/** Read-only hall plan. Geometry is pre-bounded by the contract validator. */
export const HallMapSvg: React.FC<Props> = ({ map, selectedRackId, highlightedRackIds, onSelectRack }) => {
  const { widthM, depthM } = map.hall;
  const fontSize = Math.max(0.4, Math.min(widthM, depthM) / 30);
  return (
    <svg
      viewBox={`0 0 ${widthM} ${depthM}`}
      role="img"
      aria-label={`Hallkarta ${map.name}`}
      className="w-full h-auto max-h-[40vh] rounded-md border bg-muted/30"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={0} y={0} width={widthM} height={depthM} fill="none" stroke="hsl(var(--border))" strokeWidth={fontSize / 4} />
      {map.areas.map((a) => (
        <g key={a.id}>
          <rect x={a.geometry.xM} y={a.geometry.yM} width={a.geometry.widthM} height={a.geometry.depthM}
            fill="hsl(var(--muted))" stroke="hsl(var(--muted-foreground))" strokeDasharray={`${fontSize / 2}`} strokeWidth={fontSize / 10} />
          <text x={a.geometry.xM + fontSize / 3} y={a.geometry.yM + fontSize} fontSize={fontSize * 0.8} fill="hsl(var(--muted-foreground))">{a.name}</text>
        </g>
      ))}
      {map.portals.map((p) => (
        <line key={p.id} x1={p.xM} y1={p.yM} x2={p.axis === 'x' ? p.xM + p.widthM : p.xM} y2={p.axis === 'y' ? p.yM + p.widthM : p.yM}
          stroke="hsl(var(--primary))" strokeWidth={fontSize / 2}><title>{p.name}</title></line>
      ))}
      {map.racks.filter((r) => r.geometry).map((r) => {
        const g = r.geometry!;
        const selected = r.id === selectedRackId;
        const hit = highlightedRackIds.has(r.id);
        return (
          <g key={r.id} role="button" tabIndex={0} aria-label={`Ställ ${r.name}${hit ? ', innehåller artikeln' : ''}`}
            aria-pressed={selected} className="cursor-pointer focus:outline-none"
            onClick={() => onSelectRack(r.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectRack(r.id); } }}>
            <rect x={g.xM} y={g.yM} width={g.widthM} height={g.depthM} fill={safeRackColor(r.color)}
              fillOpacity={hit || selected ? 0.95 : 0.35}
              stroke={selected ? 'hsl(var(--foreground))' : 'hsl(var(--border))'} strokeWidth={selected ? fontSize / 3 : fontSize / 12} />
            <text x={g.xM + g.widthM / 2} y={g.yM + g.depthM / 2} fontSize={fontSize} textAnchor="middle" dominantBaseline="middle"
              fill="hsl(var(--foreground))" fontWeight={hit ? 700 : 400}>{r.name}</text>
          </g>
        );
      })}
    </svg>
  );
};
