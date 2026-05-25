/**
 * MobileGpsDayMap — kompakt underlagsrad för dagens GPS.
 * Tar inte över huvudflödet; karta är bara underlag.
 */
import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Map as MapIcon, ChevronDown, ChevronUp } from 'lucide-react';
import type { MobileGpsMap } from './types';

interface Props {
  map: MobileGpsMap;
}

const MobileGpsDayMap: React.FC<Props> = ({ map }) => {
  const [open, setOpen] = useState(false);

  if (!map || map.type === 'empty') {
    return (
      <p className="text-xs text-muted-foreground px-1">
        GPS-underlag saknas för denna dag.
      </p>
    );
  }

  const pointCount = map.routeGeoJson?.geometry.coordinates.length ?? 0;
  const markerCount = map.markers.length;
  const areaCount = map.areas.length;

  return (
    <Card className="p-3">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
          <MapIcon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">GPS-underlag finns</p>
          <p className="text-xs text-muted-foreground">
            {pointCount} punkter · {markerCount} platser · {areaCount} områden
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span className="ml-1 text-xs">{open ? 'Dölj' : 'Visa underlag'}</span>
        </Button>
      </div>
      {open && (
        <div className="mt-3 pt-3 border-t text-xs text-muted-foreground space-y-1">
          {map.markers.slice(0, 6).map((m) => (
            <div key={m.id} className="truncate">
              <span className="font-medium text-foreground">{m.label}</span>
              <span className="ml-2 opacity-70">{m.kind}</span>
            </div>
          ))}
          {map.markers.length > 6 && (
            <p className="opacity-70">+{map.markers.length - 6} fler</p>
          )}
        </div>
      )}
    </Card>
  );
};

export default MobileGpsDayMap;
