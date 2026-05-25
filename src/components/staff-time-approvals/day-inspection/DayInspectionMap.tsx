import React, { useMemo } from "react";
import { useMobileStaffDayPings } from "@/hooks/staff/useMobileStaffDayPings";
import { useOrganizationLocations } from "@/hooks/useOrganizationLocations";
import { useAllActiveProjectGeofences } from "@/hooks/useAllActiveProjectGeofences";
import RawGpsSatelliteMap from "@/components/staff/RawGpsSatelliteMap";
import type { GeofenceSite } from "@/lib/staff/geofencesToFeatures";
import type { RawStaffGpsPing } from "@/hooks/staff/useStaffGpsPingsForDay";
import type { PlaceVisit } from "@/lib/staff/pingPlaceSegments";

interface Props {
  staffId: string;
  date: string;
  open: boolean;
}

/**
 * Daggranskningens inbäddade GPS-karta. Återanvänder samma datakälla som
 * /staff-management/gps-satellite-map (snapshot via mobile-snapshot edge),
 * filtrerar bort privata boenden och slår ihop projekt/large/lager-geofences.
 * Skriver INGENTING — bara visning.
 */
export const DayInspectionMap: React.FC<Props> = ({ staffId, date, open }) => {
  const snap = useMobileStaffDayPings(staffId, date, open);
  const projectsForDay = useAllActiveProjectGeofences(date);
  const { data: orgLocations = [] } = useOrganizationLocations();

  const pings: RawStaffGpsPing[] = useMemo(
    () =>
      (snap.data?.pings ?? []).map((p) => ({
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
    [snap.data?.pings],
  );

  const geofences: GeofenceSite[] = useMemo(() => {
    const nonProject = (snap.data?.geofences ?? []).filter((s) => {
      const id = String(s.id ?? "");
      return !id.startsWith("project:") && !id.startsWith("large:");
    });
    const merged = [...nonProject, ...(projectsForDay.data ?? [])];
    return merged.map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      radiusMeters: s.radiusMeters,
      polygon: s.polygon ?? undefined,
    }));
  }, [snap.data?.geofences, projectsForDay.data]);

  const visits: PlaceVisit[] = useMemo(() => {
    const privateIds = new Set(
      orgLocations.filter((l) => l.isPrivate).map((l) => `loc:${l.id}`),
    );
    return (snap.data?.visits ?? [])
      .filter((v) => !(v.knownSite && privateIds.has(v.knownSite.id)))
      .map((v) => ({
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
      }));
  }, [snap.data?.visits, orgLocations]);

  if (snap.isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
        Laddar karta…
      </div>
    );
  }
  if (pings.length === 0 && geofences.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground italic">
        Inga GPS-punkter för denna dag.
      </div>
    );
  }
  return (
    <RawGpsSatelliteMap
      pings={pings}
      geofences={geofences}
      visits={visits}
      className="h-full w-full"
    />
  );
};

export default DayInspectionMap;
