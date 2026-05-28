import { describe, it, expect } from 'vitest';
import {
  makeExtraDay,
  insertDaySorted,
  removeDayAt,
  seedDaysFromBooking,
  mergeCalendarEventsIntoSeed,
  nextDayIso,
  prevDayIso,
  DEFAULTS,
  PlanningDay,
  isDeliveryOnlyBooking,
  DELIVERY_DEFAULT_TEAM_ID,
  DELIVERY_FALLBACK_SLOTS,
} from '../bookingPlacementSeed';


describe('bookingPlacementSeed extra-day helpers', () => {
  it('prevDayIso/nextDayIso speglar varandra', () => {
    expect(nextDayIso('2026-06-09')).toBe('2026-06-10');
    expect(prevDayIso('2026-06-09')).toBe('2026-06-08');
    // månadsbyte
    expect(prevDayIso('2026-06-01')).toBe('2026-05-31');
    expect(nextDayIso('2026-05-31')).toBe('2026-06-01');
  });

  it('makeExtraDay rig → dagen före basdatumet med rig-defaults', () => {
    const d = makeExtraDay('rig', '2026-06-09', 'team-3');
    expect(d.date).toBe('2026-06-08');
    expect(d.kind).toBe('rig');
    expect(d.startTime).toBe(DEFAULTS.rig.start);
    expect(d.endTime).toBe(DEFAULTS.rig.end);
    expect(d.teamId).toBe('team-3');
  });

  it('makeExtraDay rigDown → dagen efter basdatumet med rigDown-defaults', () => {
    const d = makeExtraDay('rigDown', '2026-06-16', 'team-2');
    expect(d.date).toBe('2026-06-17');
    expect(d.kind).toBe('rigDown');
    expect(d.startTime).toBe(DEFAULTS.rigDown.start);
    expect(d.endTime).toBe(DEFAULTS.rigDown.end);
    expect(d.teamId).toBe('team-2');
  });

  it('insertDaySorted håller kronologisk ordning + event sist på samma datum', () => {
    const base: PlanningDay[] = [
      { date: '2026-06-09', kind: 'rig', startTime: '08:00', endTime: '16:00', teamId: 't1' },
      { date: '2026-06-13', kind: 'event', startTime: '17:00', endTime: '23:00', teamId: 't1' },
      { date: '2026-06-16', kind: 'rigDown', startTime: '08:00', endTime: '16:00', teamId: 't1' },
    ];
    const extra = makeExtraDay('rig', '2026-06-09', 't1'); // → 2026-06-08
    const out = insertDaySorted(base, extra);
    expect(out.map((d) => `${d.date}/${d.kind}`)).toEqual([
      '2026-06-08/rig',
      '2026-06-09/rig',
      '2026-06-13/event',
      '2026-06-16/rigDown',
    ]);
  });

  it('insertDaySorted: rig kommer före event på samma datum', () => {
    const base: PlanningDay[] = [
      { date: '2026-06-13', kind: 'event', startTime: '17:00', endTime: '23:00', teamId: 't1' },
    ];
    const sameDay: PlanningDay = {
      date: '2026-06-13',
      kind: 'rig',
      startTime: '08:00',
      endTime: '12:00',
      teamId: 't1',
    };
    const out = insertDaySorted(base, sameDay);
    expect(out.map((d) => d.kind)).toEqual(['rig', 'event']);
  });

  it('removeDayAt tar bort rätt dag men aldrig event-dagen', () => {
    const days: PlanningDay[] = [
      { date: '2026-06-09', kind: 'rig', startTime: '08:00', endTime: '16:00', teamId: 't1' },
      { date: '2026-06-13', kind: 'event', startTime: '17:00', endTime: '23:00', teamId: 't1' },
      { date: '2026-06-16', kind: 'rigDown', startTime: '08:00', endTime: '16:00', teamId: 't1' },
    ];
    const without0 = removeDayAt(days, 0);
    expect(without0).toHaveLength(2);
    expect(without0[0].kind).toBe('event');

    // event skyddad
    const cannotRemove = removeDayAt(days, 1);
    expect(cannotRemove).toEqual(days);

    // out of range
    expect(removeDayAt(days, 99)).toEqual(days);
    expect(removeDayAt(days, -1)).toEqual(days);
  });

  it('seed → add rig → remove → add rigDown är idempotent på struktur', () => {
    const booking = {
      rigdaydate: '2026-06-09',
      eventdate: '2026-06-13',
      rigdowndate: '2026-06-16',
    };
    const seeded = seedDaysFromBooking(booking);
    expect(seeded).toHaveLength(3);

    const added = insertDaySorted(seeded, makeExtraDay('rig', '2026-06-09', 'team-1'));
    expect(added).toHaveLength(4);
    expect(added[0].date).toBe('2026-06-08');

    const removed = removeDayAt(added, 0);
    expect(removed).toEqual(seeded);

    const addedDown = insertDaySorted(seeded, makeExtraDay('rigDown', '2026-06-16', 'team-1'));
    expect(addedDown).toHaveLength(4);
    expect(addedDown[addedDown.length - 1].date).toBe('2026-06-17');
    expect(addedDown[addedDown.length - 1].kind).toBe('rigDown');
  });
});

describe('seedDaysFromBooking — rental_only (leverans)', () => {
  it('isDeliveryOnlyBooking triggas ENDAST av rental_only=true', () => {
    expect(isDeliveryOnlyBooking({ rental_only: true })).toBe(true);
    expect(isDeliveryOnlyBooking({ rental_only: true, rigdaydate: '2026-06-12', rigdowndate: '2026-06-14' })).toBe(true);
    // Datum-heuristik räknas inte längre
    expect(isDeliveryOnlyBooking({ eventdate: '2026-06-13' })).toBe(false);
    expect(isDeliveryOnlyBooking({ eventdate: '2026-06-13', rigdaydate: '2026-07-04' })).toBe(false);
    expect(isDeliveryOnlyBooking({ rental_only: false })).toBe(false);
    expect(isDeliveryOnlyBooking({})).toBe(false);
  });

  it('rigdaydate → Leverans UT, rigdowndate → Retur IN i Lager', () => {
    const booking = {
      rental_only: true,
      eventdate: '2026-06-13',
      rigdaydate: '2026-06-12',
      rigdowndate: '2026-06-14',
    };
    const days = seedDaysFromBooking(booking);
    expect(days).toHaveLength(2); // INGEN event-dag

    const [out, ret] = days;
    expect(out.kind).toBe('rig');
    expect(out.date).toBe('2026-06-12');
    expect(out.teamId).toBe(DELIVERY_DEFAULT_TEAM_ID);

    expect(ret.kind).toBe('rigDown');
    expect(ret.date).toBe('2026-06-14');
    expect(ret.teamId).toBe(DELIVERY_DEFAULT_TEAM_ID);
  });

  it('UT och IN på samma dag använder slot 0 (08–11) och slot 1 (12–15)', () => {
    const booking = {
      rental_only: true,
      rigdaydate: '2026-06-13',
      rigdowndate: '2026-06-13',
    };
    const [out, ret] = seedDaysFromBooking(booking);
    expect(out.startTime).toBe(DELIVERY_FALLBACK_SLOTS[0].start);
    expect(out.endTime).toBe(DELIVERY_FALLBACK_SLOTS[0].end);
    expect(ret.startTime).toBe(DELIVERY_FALLBACK_SLOTS[1].start);
    expect(ret.endTime).toBe(DELIVERY_FALLBACK_SLOTS[1].end);
  });

  it('UT och IN på olika dagar använder 08–11 för båda', () => {
    const booking = {
      rental_only: true,
      rigdaydate: '2026-06-12',
      rigdowndate: '2026-06-14',
    };
    const [out, ret] = seedDaysFromBooking(booking);
    expect(out.startTime).toBe(DELIVERY_FALLBACK_SLOTS[0].start);
    expect(out.endTime).toBe(DELIVERY_FALLBACK_SLOTS[0].end);
    expect(ret.startTime).toBe(DELIVERY_FALLBACK_SLOTS[0].start);
    expect(ret.endTime).toBe(DELIVERY_FALLBACK_SLOTS[0].end);
  });

  it('saknade rig/rigdown → fallback till eventdate (UT 08–11 + IN 12–15 samma dag)', () => {
    const booking = { rental_only: true, eventdate: '2026-06-13' };
    const days = seedDaysFromBooking(booking);
    expect(days).toHaveLength(2);
    expect(days[0].date).toBe('2026-06-13');
    expect(days[1].date).toBe('2026-06-13');
    expect(days[0].startTime).toBe(DELIVERY_FALLBACK_SLOTS[0].start);
    expect(days[1].startTime).toBe(DELIVERY_FALLBACK_SLOTS[1].start);
  });

  it('bokningens egna rig_*/rigdown_*-tider vinner över fallback', () => {
    const booking = {
      rental_only: true,
      rigdaydate: '2026-06-12',
      rigdowndate: '2026-06-14',
      rig_start_time: '07:30:00',
      rig_end_time: '09:00:00',
      rigdown_start_time: '13:15:00',
      rigdown_end_time: '14:45:00',
    };
    const [out, ret] = seedDaysFromBooking(booking);
    expect(out.startTime).toBe('07:30');
    expect(out.endTime).toBe('09:00');
    expect(ret.startTime).toBe('13:15');
    expect(ret.endTime).toBe('14:45');
  });

  it('defaultTeamId-argument påverkar INTE rental_only (Lager vinner)', () => {
    const booking = { rental_only: true, eventdate: '2026-06-13' };
    const days = seedDaysFromBooking(booking, 'team-5');
    expect(days.every((d) => d.teamId === DELIVERY_DEFAULT_TEAM_ID)).toBe(true);
  });
});

describe('mergeCalendarEventsIntoSeed — flera riggdagar behandlas likadant', () => {
  const baseBooking = {
    rigdaydate: '2026-05-30',
    rig_start_time: '08:00:00',
    rig_end_time: '12:00:00',
    eventdate: '2026-05-30',
    rigdowndate: '2026-05-30',
  };

  it('lägger till extra riggdag från calendar_events som saknas i seed', () => {
    const seed = seedDaysFromBooking(baseBooking, 'team-2');
    const merged = mergeCalendarEventsIntoSeed(seed, [
      {
        event_type: 'rig',
        source_date: '2026-05-29',
        start_time: '09:00:00',
        end_time: '17:00:00',
        resource_id: 'team-3',
      },
    ], 'team-2');

    const rigs = merged.filter((d) => d.kind === 'rig');
    expect(rigs.map((d) => d.date)).toEqual(['2026-05-29', '2026-05-30']);
    // Extra riggdagen behåller exakt samma form som seed-dagen
    expect(rigs[0]).toEqual({
      date: '2026-05-29',
      kind: 'rig',
      startTime: '09:00',
      endTime: '17:00',
      teamId: 'team-3',
    });
  });

  it('dedupar samma fas+datum — seed vinner, ingen dubblett', () => {
    const seed = seedDaysFromBooking(baseBooking, 'team-2');
    const merged = mergeCalendarEventsIntoSeed(seed, [
      {
        event_type: 'rig',
        source_date: '2026-05-30',
        start_time: '06:00:00',
        end_time: '07:00:00',
        resource_id: 'team-9',
      },
    ]);
    const rigs = merged.filter((d) => d.kind === 'rig');
    expect(rigs).toHaveLength(1);
    // Seed-värdena är intakta
    expect(rigs[0].startTime).toBe('08:00');
    expect(rigs[0].teamId).toBe('team-2');
  });

  it('hanterar flera rigDown- och eventdagar från calendar_events', () => {
    const seed = seedDaysFromBooking(
      { rigdaydate: '2026-05-29', eventdate: '2026-05-30', rigdowndate: '2026-05-31' },
      'team-1',
    );
    const merged = mergeCalendarEventsIntoSeed(seed, [
      { event_type: 'rigDown', source_date: '2026-06-01', start_time: '08:00', end_time: '12:00', resource_id: 'team-1' },
      { event_type: 'event', source_date: '2026-05-31', start_time: '18:00', end_time: '23:00', resource_id: null },
    ]);
    expect(merged.filter((d) => d.kind === 'rigDown').map((d) => d.date)).toEqual(['2026-05-31', '2026-06-01']);
    expect(merged.filter((d) => d.kind === 'event').map((d) => d.date)).toEqual(['2026-05-30', '2026-05-31']);
  });

  it('sorterar kronologiskt med fasordning inom samma datum', () => {
    const merged = mergeCalendarEventsIntoSeed(
      [],
      [
        { event_type: 'rigDown', source_date: '2026-05-30', start_time: null, end_time: null, resource_id: null },
        { event_type: 'rig', source_date: '2026-05-30', start_time: null, end_time: null, resource_id: null },
        { event_type: 'event', source_date: '2026-05-30', start_time: null, end_time: null, resource_id: null },
        { event_type: 'rig', source_date: '2026-05-28', start_time: null, end_time: null, resource_id: null },
      ],
      'team-1',
    );
    expect(merged.map((d) => `${d.date}/${d.kind}`)).toEqual([
      '2026-05-28/rig',
      '2026-05-30/rig',
      '2026-05-30/event',
      '2026-05-30/rigDown',
    ]);
  });

  it('faller tillbaka till seedens rig-team när calendar_events saknar giltigt resource_id', () => {
    const seed = seedDaysFromBooking({ rigdaydate: '2026-05-30' }, 'team-7');
    const merged = mergeCalendarEventsIntoSeed(seed, [
      { event_type: 'rig', source_date: '2026-05-29', start_time: null, end_time: null, resource_id: null },
      { event_type: 'rig', source_date: '2026-05-28', start_time: null, end_time: null, resource_id: 'not-a-team' },
    ]);
    const rigs = merged.filter((d) => d.kind === 'rig');
    expect(rigs.every((d) => d.teamId === 'team-7')).toBe(true);
  });

  it('ignorerar okända event_type och ogiltiga datum', () => {
    const merged = mergeCalendarEventsIntoSeed([], [
      { event_type: 'lunch' as any, source_date: '2026-05-29', start_time: null, end_time: null, resource_id: null },
      { event_type: 'rig', source_date: 'inte-ett-datum', start_time: null, end_time: null, resource_id: null },
      { event_type: 'rig', source_date: '2026-05-29', start_time: null, end_time: null, resource_id: null },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].date).toBe('2026-05-29');
  });
});



