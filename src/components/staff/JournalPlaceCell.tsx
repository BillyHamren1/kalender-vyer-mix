import React, { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { useStaffPingsForDay } from '@/hooks/useStaffPingsForDay';
import { useReverseGeocode } from '@/hooks/useReverseGeocode';
import { findPingAtTime } from '@/lib/staff/pingAtTime';

type JournalPlaceCellProps = {
  staffId: string;
  date: string;
  rowKind: string;
  startIso: string | null;
  fallbackAddress: string | null;
};

export const JournalPlaceCell: React.FC<JournalPlaceCellProps> = ({
  staffId,
  date,
  rowKind,
  startIso,
  fallbackAddress,
}) => {
  const shouldResolveStartPlace = rowKind === 'day-start' && !!startIso;
  const { data: pings = [] } = useStaffPingsForDay(staffId, date, shouldResolveStartPlace);

  const startPing = useMemo(() => {
    if (!shouldResolveStartPlace || !startIso) return null;
    return findPingAtTime(pings, startIso, 15);
  }, [pings, shouldResolveStartPlace, startIso]);

  const [resolvedAddress] = useReverseGeocode([startPing?.coords ?? null]);
  const displayAddress = shouldResolveStartPlace
    ? (resolvedAddress ?? (startPing
        ? `${startPing.coords.lat.toFixed(4)}, ${startPing.coords.lng.toFixed(4)}`
        : fallbackAddress))
    : fallbackAddress;

  if (!displayAddress) {
    return <span className="text-muted-foreground/50">—</span>;
  }

  return (
    <span className="inline-flex items-center gap-1 truncate">
      <MapPin className="h-3 w-3 shrink-0" />
      <span className="truncate">{displayAddress}</span>
    </span>
  );
};