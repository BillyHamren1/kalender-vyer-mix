import React from 'react';
import type { ArticleSlot, WarehouseRack } from '../../../supabase/functions/_shared/warehouseArticleLocations';

interface Props { rack: WarehouseRack; slots: ArticleSlot[] }

/** Read-only rack front. Level 1 = floor (rendered at the bottom). */
export const RackFrontView: React.FC<Props> = ({ rack, slots }) => {
  const bays = rack.storage?.bays ?? [];
  if (bays.length === 0) {
    return <p className="text-xs text-muted-foreground">Stallagets fack är inte registrerade.</p>;
  }
  const maxLevel = Math.max(1, ...bays.flatMap((b) => b.levels.map((l) => l.level)));
  const levels = Array.from({ length: maxLevel }, (_, i) => maxLevel - i);
  return (
    <div className="space-y-1" aria-label={`Framsida stallage ${rack.name}`}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Stallage {rack.name}</span>
        {rack.storage?.status === 'provisional' && <span>Preliminär indelning</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-[10px]">
          <tbody>
            {levels.map((level) => (
              <tr key={level}>
                <th scope="row" className="pr-1 text-right font-normal text-muted-foreground whitespace-nowrap">
                  {level === 1 ? 'Golv' : `Nivå ${level}`}
                </th>
                {bays.map((bay) => {
                  const lvl = bay.levels.find((l) => l.level === level);
                  const hits = slots.filter((s) => s.bayId === bay.id && s.level === level);
                  return (
                    <td key={bay.id} className={`border min-w-[44px] h-8 text-center align-middle ${
                      !lvl ? 'bg-muted/40' : hits.length ? 'bg-primary text-primary-foreground font-semibold' : 'bg-background'}`}
                      aria-label={hits.length ? `Fack ${bay.label} ${level === 1 ? 'golv' : `nivå ${level}`}: artikeln finns här` : undefined}>
                      {hits.length ? hits.map((h) => `P${h.position}·D${h.depth}`).join(' ') : lvl ? '' : '–'}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td />
              {bays.map((b) => <td key={b.id} className="text-center text-muted-foreground pt-0.5">{b.label}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
