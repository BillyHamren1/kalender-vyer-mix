/**
 * MobileGpsSegmentCard — single GPS Day segment row. Pure presentation.
 * Shows label, current start/end, duration and an override badge. Clicking
 * "Ändra tider" calls onEdit; nothing else.
 */
import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, MapPin, Route, AlertTriangle } from 'lucide-react';
import type { MobileGpsDaySegment } from './types';

interface Props {
  segment: MobileGpsDaySegment;
  onEdit: (segment: MobileGpsDaySegment) => void;
  disabled?: boolean;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function iconFor(seg: MobileGpsDaySegment) {
  if (seg.kind === 'travel') return <Route className="h-4 w-4 text-blue-500" />;
  if (seg.kind === 'gps_gap') return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <MapPin className="h-4 w-4 text-emerald-600" />;
}

const MobileGpsSegmentCard: React.FC<Props> = ({ segment, onEdit, disabled }) => {
  const overridden = segment.manualOverride.hasOverride;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="mt-0.5">{iconFor(segment)}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium truncate">{segment.label}</h3>
              {overridden && (
                <Badge variant="secondary" className="text-xs">Ändrad</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {fmtTime(segment.currentStartTime)} – {fmtTime(segment.currentEndTime)}
              <span className="mx-1.5">·</span>
              <span className="font-medium text-foreground">{segment.durationLabel}</span>
            </p>
            {overridden && segment.manualOverride.reason && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                "{segment.manualOverride.reason}"
              </p>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onEdit(segment)}
          disabled={disabled}
          className="shrink-0"
        >
          <Pencil className="h-4 w-4 mr-1.5" />
          Ändra tider
        </Button>
      </div>
    </Card>
  );
};

export default MobileGpsSegmentCard;
