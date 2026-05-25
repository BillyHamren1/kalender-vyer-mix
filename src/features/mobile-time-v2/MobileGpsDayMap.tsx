/**
 * MobileGpsDayMap — renderar dagens karta från backendens `map`-objekt.
 *
 * Appen bygger ALDRIG routeGeoJson, markers, bounds eller areas själv.
 * Den får dem färdiga från `get-mobile-gps-day-view`.
 *
 * Just nu visas ett kompakt placeholderkort med antal punkter/markörer/områden.
 * Riktig Mapbox-rendering tas i nästa steg — types och backend-svar är redan
 * förberedda så bytet blir lokalt här.
 */
import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Map as MapIcon, MapPinOff } from 'lucide-react';
import type { MobileGpsMap } from './types';

interface Props {
  map: MobileGpsMap;
}

const MobileGpsDayMap: React.FC<Props> = ({ map }) => {
  if (!map || map.type === 'empty') {
    return (
      <Card className="p-4 flex items-center gap-3 border-dashed">
        <MapPinOff className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Ingen karta för denna dag</p>
          <p className="text-xs text-muted-foreground">Telefonen har inte rapporterat någon GPS.</p>
        </div>
      </Card>
    );
  }

  const pointCount = map.routeGeoJson?.geometry.coordinates.length ?? 0;
  const markerCount = map.markers.length;
  const areaCount = map.areas.length;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
          <MapIcon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">GPS-karta finns</p>
          <p className="text-xs text-muted-foreground">
            {pointCount} punkter · {markerCount} markörer · {areaCount} områden
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          {map.hasPings ? 'Live' : 'Statisk'}
        </Badge>
      </div>
    </Card>
  );
};

export default MobileGpsDayMap;
