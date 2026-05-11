/**
 * Shared visuals for StaffDaySegment kinds. Used by TodayTab and the
 * day-detail sheet so the same backend `kind` always renders the same
 * icon, tone and human label. UI never invents a kind; it only maps
 * what backend sends.
 */
import React from 'react';
import {
  Briefcase, Building2, Warehouse, Car, MapPin, Coffee,
  Pencil, AlertTriangle, Sun, Clock,
} from 'lucide-react';
import type { StaffDaySegmentKind } from '@/hooks/useStaffDaySnapshot';

export const SEG_ICON: Record<StaffDaySegmentKind, React.ComponentType<{ className?: string }>> = {
  project: Briefcase,
  booking: Briefcase,
  location: Building2,
  warehouse: Warehouse,
  travel: Car,
  other_place: MapPin,
  break: Coffee,
  manual_adjustment: Pencil,
  unknown: AlertTriangle,
  active: Sun,
};

// Premium-tema: aktivt/projekt = primary, plats/lager = lugn blå-muted,
// transport och okänd plats är dämpade och får inte dominera tidslinjen.
// Endast verkliga varningar (unknown) signaleras med amber.
export const SEG_TONE: Record<StaffDaySegmentKind, string> = {
  project: 'bg-primary/10 text-primary',
  booking: 'bg-primary/10 text-primary',
  location: 'bg-muted/60 text-foreground/80',
  warehouse: 'bg-muted/60 text-foreground/80',
  travel: 'bg-muted/60 text-muted-foreground',
  other_place: 'bg-muted/60 text-muted-foreground',
  break: 'bg-muted text-muted-foreground',
  manual_adjustment: 'bg-muted text-muted-foreground',
  unknown: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  active: 'bg-primary/10 text-primary',
};

export const SEG_KIND_LABEL: Record<StaffDaySegmentKind, string> = {
  project: 'Projekt',
  booking: 'Projekt',
  location: 'Plats',
  warehouse: 'Lager',
  travel: 'Transport',
  other_place: 'Annan plats',
  break: 'Rast',
  manual_adjustment: 'Manuell ändring',
  unknown: 'Behöver granskning',
  active: 'Pågår',
};

export const FallbackSegIcon = Clock;
