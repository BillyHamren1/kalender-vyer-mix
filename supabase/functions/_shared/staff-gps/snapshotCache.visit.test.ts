// Locks the geofence-visit end-time behavior:
// När personen lämnar geofencen ska besökets UT-tid sättas till SISTA pingen
// inne i fencen — inte till nästa kända plats eller dagens sista ping.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Re-importera den interna byggaren genom att duplicera dess kontrakt via
// public surface: vi kallar via en liten lokal import. Eftersom funktionen
// inte exporteras explicit i snapshotCache.ts, testar vi den via en re-export
// här genom dynamisk import + monkey-patch är överkill — istället speglar
// vi minimalt vad funktionen ska göra och importerar den direkt om möjligt.
//
// För att hålla testet robust importerar vi funktionen genom relativ sökväg.
import { _testing } from "./snapshotCacheTestExports.ts";

const { buildExactGeofenceVisits } = _testing;

const D = "2026-05-18";
const t = (hhmm: string) => `${D}T${hhmm}:00.000Z`;

const fence = {
  id: "fa",
  name: "FA Warehouse",
  lat: 59.4914,
  lng: 17.8553,
  radiusMeters: 200,
};

function ping(id: string, time: string, lat: number, lng: number) {
  return { id, recorded_at: t(time), lat, lng, accuracy: 5 };
}

Deno.test("visit end = last ping inside fence even when outside pings follow", () => {
  const pings = [
    ping("1", "13:38", 59.4914, 17.8553), // inside
    ping("2", "15:00", 59.4914, 17.8553), // inside
    ping("3", "17:00", 59.4914, 17.8553), // inside (last inside)
    ping("4", "17:30", 59.5500, 17.9000), // outside (resa)
    ping("5", "22:29", 59.6500, 18.0000), // outside (slut på dagen)
  ];
  const visits = buildExactGeofenceVisits(pings, [fence]);
  assertEquals(visits.length, 1);
  assertEquals(visits[0].start, t("13:38"));
  assertEquals(visits[0].end, t("17:00"));
  assertEquals(visits[0].pingCount, 3);
});

Deno.test("visit closes at first ping of next fence, not absorbing transit", () => {
  const fence2 = { ...fence, id: "craft", name: "Craft", lat: 59.6, lng: 18.0 };
  const pings = [
    ping("1", "13:38", 59.4914, 17.8553),
    ping("2", "17:00", 59.4914, 17.8553),
    ping("3", "18:00", 59.6, 18.0),
    ping("4", "22:29", 59.6, 18.0),
  ];
  const visits = buildExactGeofenceVisits(pings, [fence, fence2]);
  assertEquals(visits.length, 2);
  assertEquals(visits[0].end, t("18:00")); // brytpunkten är nästa fence
  assertEquals(visits[1].start, t("18:00"));
  assertEquals(visits[1].end, t("22:29"));
});

Deno.test("re-entry creates a new visit, not extending the previous one", () => {
  const pings = [
    ping("1", "08:00", 59.4914, 17.8553), // inside
    ping("2", "09:00", 59.4914, 17.8553), // inside
    ping("3", "12:00", 59.5500, 17.9000), // outside (lunch i bil)
    ping("4", "13:00", 59.4914, 17.8553), // inside igen
    ping("5", "17:00", 59.4914, 17.8553), // inside (sista)
  ];
  const visits = buildExactGeofenceVisits(pings, [fence]);
  assertEquals(visits.length, 2);
  assertEquals(visits[0].start, t("08:00"));
  assertEquals(visits[0].end, t("09:00"));
  assertEquals(visits[1].start, t("13:00"));
  assertEquals(visits[1].end, t("17:00"));
});
