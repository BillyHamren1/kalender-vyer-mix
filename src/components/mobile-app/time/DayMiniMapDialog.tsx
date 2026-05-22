/**
 * DayMiniMapDialog — bottom-sheet med mini-karta för en specifik (staff, date).
 * Återanvänder admin-komponenten RawGpsSatelliteMap (read-only, ingen redigering)
 * och hämtar pings + geofences via snapshot-edge function
 * get-mobile-staff-day-pings (mobile-auth-säker).
 */
import { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import RawGpsSatelliteMap from '@/components/staff/RawGpsSatelliteMap';
import { useMobileStaffDayPings } from '@/hooks/staff/useMobileStaffDayPings';
import type { GeofenceSite } from '@/lib/staff/geofencesToFeatures';

interface Props {
  date: string | null;
  staffId: string | null;
  onClose: () => void;
}

export const DayMiniMapDialog: React.FC<Props> = ({ date, staffId, onClose }) => {
  const open = !!date && !!staffId;
  const { data, isLoading } = useMobileStaffDayPings(staffId, date, open);

  const geofences = useMemo<GeofenceSite[]>(
    () => (data?.geofences ?? []).map((g) => ({
      id: g.id, name: g.name, lat: g.lat, lng: g.lng,
      radiusMeters: g.radiusMeters,
      polygon: g.polygon ?? undefined,
    })),
    [data?.geofences],
  );

  // Ingen lokal visits-uträkning — mobilen är en ren spegling av webbens GPS-vy
  // (pings + geofence-polygoner). Allt "räknande" sker enbart på webben/admin.

  const label = date ? format(parseISO(date), 'EEEE d MMMM yyyy', { locale: sv }) : '';

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[92vh] p-0 overflow-hidden">
        <SheetHeader className="px-4 pt-4 pb-2 text-left">
          <SheetTitle className="capitalize text-base">{label}</SheetTitle>
          <p className="text-[11px] text-muted-foreground">Dina rörelser den här dagen</p>
        </SheetHeader>
        <div className="relative w-full h-[70vh] bg-muted/30">
          {isLoading && !data ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.pings?.length ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Inga rörelser registrerade.
            </div>
          ) : (
            <RawGpsSatelliteMap
              pings={data.pings.map((p) => ({
                id: `${p.recorded_at}`,
                recorded_at: p.recorded_at,
                lat: p.lat, lng: p.lng,
                accuracy: p.accuracy ?? null,
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
              }))}
              geofences={geofences}
              visits={[]}
              className="h-full w-full"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DayMiniMapDialog;
