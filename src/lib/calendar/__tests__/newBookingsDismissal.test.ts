import { describe, it, expect } from 'vitest';
import {
  filterDismissed,
  readDismissedIds,
  writeDismissedIds,
  NEW_BOOKINGS_DISMISS_KEY,
} from '../newBookingsDismissal';

const makeStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; },
  } as unknown as Storage;
};

describe('newBookingsDismissal', () => {
  it('filtrerar bort bortkryssade id men släpper igenom nya', () => {
    const items = [{ dismissKey: 'a' }, { dismissKey: 'b' }, { dismissKey: 'c' }];
    expect(filterDismissed(items, ['b']).map((i) => i.dismissKey)).toEqual(['a', 'c']);
    expect(filterDismissed(items, []).length).toBe(3);
  });

  it('läser och skriver till storage', () => {
    const s = makeStorage();
    expect(readDismissedIds(s)).toEqual([]);
    writeDismissedIds(['x', 'y'], s);
    expect(s.getItem(NEW_BOOKINGS_DISMISS_KEY)).toBe('["x","y"]');
    expect(readDismissedIds(s)).toEqual(['x', 'y']);
  });

  it('tål trasigt innehåll', () => {
    const s = makeStorage();
    s.setItem(NEW_BOOKINGS_DISMISS_KEY, '{oops');
    expect(readDismissedIds(s)).toEqual([]);
  });
});

import { hasUnsnoozed, readSnoozedIds, writeSnoozedIds } from '../newBookingsDismissal';
describe('Senare-snooze per besök', () => {
  const mem = () => { const m = new Map<string,string>(); return { getItem:(k:string)=>m.get(k)??null, setItem:(k:string,v:string)=>{m.set(k,v);} } as unknown as Storage; };
  it('samma tre bokningar öppnar inte igen efter Senare (vecko-/månadsbyte, remount)', () => {
    const s = mem();
    const items = [{dismissKey:'a'},{dismissKey:'b'},{dismissKey:'c'}];
    writeSnoozedIds(items.map(i=>i.dismissKey), s);
    expect(hasUnsnoozed(items, readSnoozedIds(s))).toBe(false);
    expect(hasUnsnoozed([], readSnoozedIds(s))).toBe(false);
  });
  it('en verkligt ny bokning öppnar igen', () => {
    expect(hasUnsnoozed([{dismissKey:'a'},{dismissKey:'d'}], ['a','b','c'])).toBe(true);
  });
});
