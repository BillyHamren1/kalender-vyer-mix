/**
 * StaffGpsDayInlineMap — liten inline-karta för en (staff, dag) i veckolistan.
 *
 * Render endast när "Visa karta" klickats för raden. Hämtar pings + geofences
 * via useMobileStaffDayPings (samma snapshot som detalj-vyn) och renderar
 * RawGpsSatelliteMap i en kort container direkt under dagsraden — INGEN
 * navigering till ny sida.
 */
import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useMobileStaffDayPings } from '@/hooks/staff/useMobileStaffDayPings';
import RawGpsSatelliteMap from './RawGpsSatelliteMap';
import type { RawStaffGpsPing } from '@/hooks/staff/useStaffGpsPingsForDay';
import type { GeofenceSite } from '@/lib/staff/geofencesToFeatures';
import type { PlaceVisit } from '@/lib/staff/pingPlaceSegments';

interface Props {
  staffId: string;
  dateStr: string;
}

export function StaffGpsDayInlineMap({ staffId, dateStr }: Props) {
  const snapshot = useMobileStaffDayPings(staffId, dateStr, true);

  const pings: RawStaffGpsPing[] = useMemo(
    () => (snapshot.data?.pings ?? []).map((p) => ({
      id: p.id,
      recorded_at: p.recorded_at,
      lat: p.lat,
      lng: p.lng,
      accuracy: p.accuracy,
      speed: null,
      source: null,
      battery_percent: null,
      is_charging: null,
      app_version: null,
      app_build: null,
      platform: null,
      os_version: null,
      device_model: null,
      app_id: null,
    })),
    [snapshot.data?.pings],
  );

  const geofences: GeofenceSite[] = useMemo(
    () => (snapshot.data?.geofences ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      radiusMeters: s.radiusMeters,
      polygon: s.polygon ?? undefined,
    })),
    [snapshot.data?.geofences],
  );

  const visits: PlaceVisit[] = useMemo(
    () => (snapshot.data?.visits ?? []).map((v) => ({
      placeKey: v.placeKey,
      knownSite: v.knownSite,
      centre: v.centre,
      start: v.start,
      end: v.end,
      durationMin: v.durationMin,
      pingCount: v.pingCount,
      pings: v.pings.map((p) => ({
        recorded_at: p.recorded_at,
        lat: p.lat,
        lng: p.lng,
        accuracy: p.accuracy,
      })),
      subKind: v.subKind,
    })),
    [snapshot.data?.visits],
  );

  if (snapshot.isLoading) {
    return (
      <div className="h-[360px] flex items-center justify-center text-muted-foreground text-[12px] gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Laddar karta…
      </div>
    );
  }

  if (pings.length === 0 && geofences.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-muted-foreground text-[12px]">
        Inga rörelser registrerade för vald dag.
      </div>
    );
  }

  return (
    <div className="h-[420px] w-full rounded-lg overflow-hidden border border-[hsl(270_20%_90%)]">
      <RawGpsSatelliteMap
        pings={pings}
        geofences={geofences}
        visits={visits}
        className="h-full w-full"
      />
    </div>
  );
}

export default StaffGpsDayInlineMap;
