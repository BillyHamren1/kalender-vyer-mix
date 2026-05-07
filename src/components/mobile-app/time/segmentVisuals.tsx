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

export const SEG_TONE: Record<StaffDaySegmentKind, string> = {
  project: 'bg-primary/10 text-primary',
  booking: 'bg-primary/10 text-primary',
  location: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  warehouse: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  travel: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  other_place: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
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
