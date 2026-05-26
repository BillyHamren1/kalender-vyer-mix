import { describe, it, expect } from 'vitest';
import {
  makeExtraDay,
  insertDaySorted,
  removeDayAt,
  seedDaysFromBooking,
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

describe('seedDaysFromBooking — delivery-only (utan rig/riv)', () => {
  it('isDeliveryOnlyBooking känner igen bokning med endast eventdate', () => {
    expect(isDeliveryOnlyBooking({ eventdate: '2026-06-13' })).toBe(true);
    expect(isDeliveryOnlyBooking({ eventdate: '2026-06-13', rigdaydate: '2026-06-12' })).toBe(false);
    expect(isDeliveryOnlyBooking({ eventdate: '2026-06-13', rigdowndate: '2026-06-14' })).toBe(false);
    expect(isDeliveryOnlyBooking({})).toBe(false);
  });

  it('seedar leverans + retur på eventdate i Lager (transport) med fallback 08–11 + 12–15', () => {
    const booking = { eventdate: '2026-06-13' };
    const days = seedDaysFromBooking(booking);
    expect(days).toHaveLength(2);

    const [delivery, ret] = days;
    expect(delivery.kind).toBe('rig');
    expect(delivery.date).toBe('2026-06-13');
    expect(delivery.startTime).toBe(DELIVERY_FALLBACK_SLOTS[0].start);
    expect(delivery.endTime).toBe(DELIVERY_FALLBACK_SLOTS[0].end);
    expect(delivery.teamId).toBe(DELIVERY_DEFAULT_TEAM_ID);

    expect(ret.kind).toBe('rigDown');
    expect(ret.date).toBe('2026-06-13');
    expect(ret.startTime).toBe(DELIVERY_FALLBACK_SLOTS[1].start);
    expect(ret.endTime).toBe(DELIVERY_FALLBACK_SLOTS[1].end);
    expect(ret.teamId).toBe(DELIVERY_DEFAULT_TEAM_ID);
  });

  it('använder bokningens event_start_time/event_end_time för leveransen om de finns', () => {
    const booking = {
      eventdate: '2026-06-13',
      event_start_time: '09:30:00',
      event_end_time: '10:30:00',
    };
    const [delivery, ret] = seedDaysFromBooking(booking);
    expect(delivery.startTime).toBe('09:30');
    expect(delivery.endTime).toBe('10:30');
    // returen behåller alltid fallback slot 2
    expect(ret.startTime).toBe(DELIVERY_FALLBACK_SLOTS[1].start);
    expect(ret.endTime).toBe(DELIVERY_FALLBACK_SLOTS[1].end);
  });

  it('default-defaultTeamId-argument påverkar INTE delivery-only (Lager vinner)', () => {
    const booking = { eventdate: '2026-06-13' };
    const days = seedDaysFromBooking(booking, 'team-5');
    expect(days.every((d) => d.teamId === DELIVERY_DEFAULT_TEAM_ID)).toBe(true);
  });
});

