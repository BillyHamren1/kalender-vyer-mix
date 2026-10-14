import { describe, it, expect } from 'vitest';
import { buildWarehouseImportEvents, syncWarehouseEventsForBooking } from '../../../supabase/functions/_shared/warehouseImportEvents';
import { stockholmLocalInstant } from '../../../supabase/functions/_shared/warehousePlanningTime';
import { warehouseTimeOf, warehouseDateOf } from './warehouseTime';
import { personnelIntervals } from './personnelIntervals';

const booking = (date: string) => ({ id: 'booking', client: 'Customer', rigdaydate: date, eventdate: date, rigdowndate: date });
const clocks = ['08:00', '07:00', '09:00', '17:00', '08:00', '10:00'];
describe('warehouse import Stockholm contract', () => {
  for (const date of ['2026-01-01','2026-07-01','2026-03-28','2026-03-29','2026-03-30','2026-10-24','2026-10-25','2026-10-26']) {
    it(`round-trips all six logistics moments through calendar and personnel on ${date}`, () => {
      const events = buildWarehouseImportEvents(booking(date), 'org');
      expect(events.map(e => e.event_type)).toEqual(['packing','delivery','event','return','inventory','unpacking']);
      events.forEach((event, i) => {
        expect(event.start_time).toMatch(/Z$/);
        expect(warehouseTimeOf(event.start_time)).toBe(clocks[i]);
        const day = warehouseDateOf(event.start_time)!;
        expect(personnelIntervals(event.start_time,event.end_time,day,day,day)[0].startTime).toBe(clocks[i]);
        expect(Date.parse(event.end_time)).toBeGreaterThan(Date.parse(event.start_time));
      });
    });
  }
  it('converts using the moment date, not the booking date across a DST change', () => {
    const events = buildWarehouseImportEvents(booking('2026-03-30'), 'org');
    expect(events[0].start_time).toBe('2026-03-26T07:00:00.000Z');
    expect(events[1].start_time).toBe('2026-03-30T05:00:00.000Z');
  });
  it('validates invalid, nonexistent and ambiguous local timestamps', () => {
    for (const [d,t] of [['2026-02-30','08:00:00'],['2026-03-29','02:30:00'],['2026-10-25','02:30:00'],['2026-07-01','24:00:00']]) {
      expect(() => stockholmLocalInstant(d,t)).toThrow();
    }
  });
  it('supports multiple rigdown days and missing dates', () => {
    const events = buildWarehouseImportEvents({...booking('2026-10-24'), allRigdownDates:['2026-10-24','2026-10-25']}, 'org');
    expect(events).toHaveLength(9);
    expect(events.find(e => e.event_type === 'inventory_2026-10-24')!.start_time).toBe('2026-10-25T07:00:00.000Z');
    expect(buildWarehouseImportEvents({id:'booking'},'org')).toEqual([]);
  });
  it('import/reimport preserves every existing plan, including flags erased by legacy imports', async () => {
    const rows = new Map<string, any>();
    const client = { from: () => ({upsert: (events: any[], options: any) => ({ select: async () => {
      expect(options.ignoreDuplicates).toBe(true);
      expect(options.onConflict).toBe('organization_id,booking_id,event_type');
      const inserted: any[] = [];
      for (const e of events) {
        const key = `${e.organization_id}/${e.booking_id}/${e.event_type}`;
        if (!rows.has(key)) { rows.set(key,{...e}); inserted.push({id:key}); }
      }
      return {data:inserted,error:null};
    }})})};
    expect(await syncWarehouseEventsForBooking(client,booking('2026-07-01'),'org')).toBe(6);
    for (const [i,e] of [...rows.values()].entries()) {
      e.start_time = '2026-07-01T12:00:00Z';
      e.manually_adjusted = i === 0; e.viewed = i === 1;
      e.warehouse_project_task_id = i === 2 ? 'approved-task' : null;
    }
    const before = structuredClone([...rows.values()]);
    expect(await syncWarehouseEventsForBooking(client,booking('2026-11-01'),'org')).toBe(0);
    expect([...rows.values()]).toEqual(before);
    expect(await syncWarehouseEventsForBooking(client,booking('2026-07-01'),'other-org')).toBe(6);
  });
  it('does not report failed persistence as success', async () => {
    const client = {from:()=>({upsert:()=>({select:async()=>({error:{message:'offline'}})})})};
    await expect(syncWarehouseEventsForBooking(client,booking('2026-07-01'),'org')).rejects.toThrow('offline');
  });
});
