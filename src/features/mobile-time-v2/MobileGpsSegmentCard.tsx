/**
 * MobileGpsSegmentCard — single GPS Day segment row. Pure presentation.
 * Tydlig visuell skillnad mellan Boende (hem), Lager/Plats, Projekt, Resa,
 * Okänd plats och GPS-glapp.
 */
import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Pencil,
  MapPin,
  Route,
  AlertTriangle,
  Home,
  Warehouse,
  Briefcase,
  HelpCircle,
} from 'lucide-react';
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

interface VisualSpec {
  Icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  borderClass: string;
  dotClass: string;
  typeLabel: string;
}

function visualFor(seg: MobileGpsDaySegment): VisualSpec {
  if (seg.kind === 'gps_gap') {
    return {
      Icon: AlertTriangle,
      iconClass: 'text-amber-500',
      borderClass: 'border-dashed border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10',
      dotClass: 'bg-amber-400',
      typeLabel: 'GPS-glapp',
    };
  }
  if (seg.kind === 'travel') {
    return {
      Icon: Route,
      iconClass: 'text-sky-600',
      borderClass: 'border-sky-200/60',
      dotClass: 'bg-sky-500',
      typeLabel: 'Förflyttning',
    };
  }
  // stay
  const kind = seg.matched.kind;
  if (kind === 'home') {
    return {
      Icon: Home,
      iconClass: 'text-violet-600',
      borderClass: 'border-violet-200/70',
      dotClass: 'bg-violet-500',
      typeLabel: 'Boende',
    };
  }
  if (kind === 'project' || kind === 'large_project') {
    return {
      Icon: Briefcase,
      iconClass: 'text-emerald-600',
      borderClass: 'border-emerald-200/70',
      dotClass: 'bg-emerald-500',
      typeLabel: 'Projekt',
    };
  }
  if (kind === 'location' || kind === 'booking') {
    return {
      Icon: Warehouse,
      iconClass: 'text-blue-600',
      borderClass: 'border-blue-200/70',
      dotClass: 'bg-blue-500',
      typeLabel: 'Lager / Plats',
    };
  }
  return {
    Icon: HelpCircle,
    iconClass: 'text-muted-foreground',
    borderClass: 'border-muted',
    dotClass: 'bg-muted-foreground',
    typeLabel: 'Okänd plats',
  };
}

const MobileGpsSegmentCard: React.FC<Props> = ({ segment, onEdit, disabled }) => {
  const overridden = segment.manualOverride.hasOverride;
  const v = visualFor(segment);

  return (
    <Card className={`p-4 border ${v.borderClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="mt-0.5 flex flex-col items-center gap-1">
            <v.Icon className={`h-4 w-4 ${v.iconClass}`} />
            <span className={`block h-1.5 w-1.5 rounded-full ${v.dotClass}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {v.typeLabel}
              </Badge>
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
