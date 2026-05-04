/**
 * Regressionstest: Billy Hamrén 2026-05-04
 *
 * Använder dagens rådata från produktionsdb som låst kontrollfall.
 *
 * Rådata (verified mot DB 2026-05-04):
 *   workdays:                1 rad, 11:30:17Z → 19:07:01Z (13:30–21:07 lokal)
 *   location_time_entries:   0 rader för datumet
 *   time_reports:            0 rader
 *   assistant_events:        0 rader
 *   workday_flags:           0 rader
 *   staff_location_history:  1353 pings, 177 inom FA Warehouse-geofence
 *                            mellan 11:29Z och 13:49Z
 *
 * Kraven är uttryckliga:
 *
 *   1. OM en LTE finns på Lager för Billy → den får ALDRIG försvinna bara
 *      för att booking_id/large_project_id saknas. Klassas som
 *      `isLocationWorkTimer` när source är manual/timer/mobile/etc, och
 *      ska visas som lager-aktivitet i journalen.
 *
 *   2. OM ingen LTE finns men GPS visar Lager-besök → händelsejournalen
 *      ska fortfarande visa Lager-besöket som GPS-anlände/lämnade. UI
 *      får INTE bara säga "Arbetsdag finns, men tid är ofördelad" utan
 *      att också visa att personen var där.
 */
import { describe, it, expect } from 'vitest';
import { classifyLocationEntry } from '../locationEntryClassification';
import { buildStaffDayEventTimeline, hasPreWorkdayActivity } from '../dayEventTimeline';

const BILLY_ID = '365f4d55-b4a8-4248-8e3a-8d5b40af1e3b';
const FA_WAREHOUSE_ID = '0b9d94df-e46e-4987-8b7f-ef04b663dac5';
const FA_LAT = 59.4914494330173;
const FA_LNG = 17.8553564370097;

const WORKDAY_START = '2026-05-04T11:30:17.99Z';
const WORKDAY_END   = '2026-05-04T19:07:01.98Z';
const DAY_START     = '2026-05-04T00:00:00.000Z';
const DAY_END       = '2026-05-04T23:59:59.999Z';

// Syntetiska pings som matchar mängden vi ser i prod (förenklat: 12 pings
// inom geofence mellan 11:30 och 13:49, sen tystnad — räcker för stayPoint).
function buildWarehousePings(staff = BILLY_ID) {
  const start = new Date('2026-05-04T11:30:00Z').getTime();
  const out = [];
  for (let i = 0; i < 12; i++) {
    out.push({
      lat: FA_LAT + (i % 3) * 0.00005,
      lng: FA_LNG + (i % 2) * 0.00005,
      recorded_at: new Date(start + i * 12 * 60_000).toISOString(),
      accuracy: 25,
      address: 'FA Warehouse',
      _staff: staff,
    } as any);
  }
  return out;
}

describe('Billy 2026-05-04 regression', () => {
  describe('"OM ja" — LTE på Lager finns', () => {
    it('en LTE med location_id=FA Warehouse + source=manual + utan booking/lp klassas som arbetstimer', () => {
      const cls = classifyLocationEntry({
        source: 'manual',
        booking_id: null,
        large_project_id: null,
        location_id: FA_WAREHOUSE_ID,
      });
      expect(cls.isPresenceOnly).toBe(false);
      expect(cls.isLocationWorkTimer).toBe(true);
    });

    it.each(['manual', 'timer', 'mobile', 'location_timer', 'auto_assigned', ''])(
      'source=%s räknas som Lager-arbete (inte presence)',
      (source) => {
        const cls = classifyLocationEntry({
          source,
          booking_id: null,
          large_project_id: null,
          location_id: FA_WAREHOUSE_ID,
        });
        expect(cls.isLocationWorkTimer).toBe(true);
        expect(cls.isPresenceOnly).toBe(false);
      },
    );

    it('source=gps utan booking/lp förblir presence-only (markör, inte arbete)', () => {
      const cls = classifyLocationEntry({
        source: 'gps',
        booking_id: null,
        large_project_id: null,
        location_id: FA_WAREHOUSE_ID,
      });
      expect(cls.isLocationWorkTimer).toBe(false);
      expect(cls.isPresenceOnly).toBe(true);
    });

    it('LTE syns i händelsejournalen som timer-aktivitet — inte som GPS', () => {
      const events = buildStaffDayEventTimeline({
        dayStartIso: DAY_START,
        dayEndIso: DAY_END,
        workdays: [{ id: 'wd1', started_at: WORKDAY_START, ended_at: WORKDAY_END }],
        ltes: [
          {
            id: 'lte1',
            entered_at: '2026-05-04T11:32:00Z',
            exited_at: '2026-05-04T13:50:00Z',
            label: 'FA Warehouse',
            source: 'manual',
            isPresenceOnly: false, // resultatet av classifyLocationEntry ovan
          },
        ],
        timeReports: [],
        travel: [],
        assistantEvents: [],
        flags: [],
        pings: [],
      });
      const lteStart = events.find(e => e.kind === 'lte_start');
      expect(lteStart).toBeDefined();
      expect(lteStart!.source).toBe('timer');           // INTE 'gps'
      expect(lteStart!.status).toBe('confirmed');       // synlig som riktig aktivitet
      expect(lteStart!.label).toContain('FA Warehouse');
    });
  });

  describe('"OM nej" — ingen LTE, bara GPS visar Lagerbesök', () => {
    it('GPS-pings inom FA Warehouse-geofence ger gps_arrived/gps_left i journalen', () => {
      const events = buildStaffDayEventTimeline({
        dayStartIso: DAY_START,
        dayEndIso: DAY_END,
        workdays: [{ id: 'wd1', started_at: WORKDAY_START, ended_at: WORKDAY_END }],
        ltes: [],
        timeReports: [],
        travel: [],
        assistantEvents: [],
        flags: [],
        pings: buildWarehousePings(),
      });

      const gpsArr = events.filter(e => e.kind === 'gps_arrived');
      const gpsLeft = events.filter(e => e.kind === 'gps_left');
      expect(gpsArr.length).toBeGreaterThan(0);
      expect(gpsLeft.length).toBeGreaterThan(0);

      // Workday-ramen finns parallellt
      expect(events.some(e => e.kind === 'workday_start')).toBe(true);
      expect(events.some(e => e.kind === 'workday_end')).toBe(true);

      // GPS-besöket startar vid eller efter workday — INTE pre-workday.
      // (Billys första warehouse-ping är 11:30Z, samma minut som workday.)
      expect(hasPreWorkdayActivity(events)).toBe(false);
    });

    it('UI-modellen exponerar arbetsdag + GPS-händelser samtidigt — händelsejournalen är inte tom', () => {
      const events = buildStaffDayEventTimeline({
        dayStartIso: DAY_START,
        dayEndIso: DAY_END,
        workdays: [{ id: 'wd1', started_at: WORKDAY_START, ended_at: WORKDAY_END }],
        ltes: [],
        timeReports: [],
        travel: [],
        assistantEvents: [],
        flags: [],
        pings: buildWarehousePings(),
      });
      // Acceptanskriterium: vi har minst en GPS-händelse OCH workday-rader.
      // Detta låser kravet "UI får inte säga 'tid är ofördelad' utan att
      // samtidigt visa att personen var på Lager".
      const hasWorkday = events.some(e => e.source === 'workday');
      const hasGps = events.some(e => e.source === 'gps');
      expect(hasWorkday && hasGps).toBe(true);
    });
  });
});
