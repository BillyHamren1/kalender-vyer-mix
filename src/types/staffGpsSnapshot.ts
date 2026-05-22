export interface StaffGpsSnapshotPing {
  id: string;
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy: number | null;
}

export interface StaffGpsSnapshotGeofence {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  polygon?: GeoJSON.Polygon | null;
}

export interface StaffGpsSnapshotVisitPing {
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy: number | null;
}

export interface StaffGpsSnapshotVisit {
  placeKey: string;
  knownSite: {
    id: string;
    name: string;
  } | null;
  centre: {
    lat: number;
    lng: number;
  };
  start: string;
  end: string;
  durationMin: number;
  pingCount: number;
  pings: StaffGpsSnapshotVisitPing[];
  subKind?: 'inside' | 'outside_geo';
}

export interface StaffGpsDaySnapshot {
  staffId: string;
  date: string;
  pings: StaffGpsSnapshotPing[];
  geofences: StaffGpsSnapshotGeofence[];
  visits: StaffGpsSnapshotVisit[];
  hasGps: boolean;
  lastUpdatedAt: string;
  generatedAt: string;
}