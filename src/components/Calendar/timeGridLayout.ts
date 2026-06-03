/**
 * Pure layout helpers for TimeGrid — overlap math, time slots, event positioning.
 * No React, no DOM.
 */
import type { CalendarEvent } from './ResourceData';
import { extractUTCDate, extractUTCTime } from '@/utils/dateUtils';

export interface OverlapInfo { column: number; totalColumns: number; }

/**
 * Beräkna kolumn-layout för överlappande events.
 *
 * Algoritm:
 *  1. Sortera items på top, sedan höjd.
 *  2. Tilldela varje item den lägsta lediga "lane" (kolumn) där det inte krockar
 *     med tidigare placerat item i samma lane (sweep-line via active set).
 *  3. Bygg kluster av transitivt överlappande items via union-find — så att om
 *     A↔B och B↔C så får alla samma totalColumns (= maxLane+1 i klustret).
 *
 * Detta löser den tidigare buggen där två separata "grupper" kunde bildas
 * även när de hade ett gemensamt överlapps-element, vilket fick lanes att
 * räknas oberoende och två kort att hamna på samma plats.
 */
export function computeOverlapLayout(
  events: CalendarEvent[],
  getPos: (e: CalendarEvent) => { top: number; height: number },
): Map<string, OverlapInfo> {
  const result = new Map<string, OverlapInfo>();
  if (events.length === 0) return result;

  type Item = { id: string; top: number; bottom: number; lane: number; root: number };
  const items: Item[] = events.map((e, i) => {
    const { top, height } = getPos(e);
    return { id: e.id, top, bottom: top + height, lane: 0, root: i };
  });
  items.sort((a, b) => a.top - b.top || (b.bottom - b.top) - (a.bottom - a.top));

  // Union-find över items-indices för att hitta kluster av transitivt
  // överlappande events.
  const parent = items.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Sweep: aktiva = items vars bottom > current.top.
  type Active = { idx: number; lane: number; bottom: number };
  const active: Active[] = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    // Rensa active set från items som slutat före it.top.
    for (let a = active.length - 1; a >= 0; a--) {
      if (active[a].bottom <= it.top) active.splice(a, 1);
    }

    // Union med alla som överlappar (transitiv kluster-bildning).
    for (const a of active) union(i, a.idx);

    // Hitta lägsta lediga lane.
    const usedLanes = new Set(active.map((a) => a.lane));
    let lane = 0;
    while (usedLanes.has(lane)) lane++;
    it.lane = lane;

    active.push({ idx: i, lane, bottom: it.bottom });
  }

  // Beräkna totalColumns per kluster (= max lane + 1 i klustret).
  const clusterMax = new Map<number, number>();
  for (let i = 0; i < items.length; i++) {
    const r = find(i);
    const cur = clusterMax.get(r) ?? 0;
    if (items[i].lane + 1 > cur) clusterMax.set(r, items[i].lane + 1);
  }

  for (let i = 0; i < items.length; i++) {
    const r = find(i);
    result.set(items[i].id, {
      column: items[i].lane,
      totalColumns: clusterMax.get(r) ?? 1,
    });
  }

  return result;
}

export function generateTimeSlots(): Array<{ time: string; displayTime: string }> {
  const slots: Array<{ time: string; displayTime: string }> = [];
  for (let hour = 5; hour <= 23; hour++) {
    const time = hour.toString().padStart(2, '0') + ':00';
    const displayTime = hour.toString().padStart(2, '0');
    slots.push({ time, displayTime });
  }
  for (let hour = 24; hour < 29; hour++) {
    const displayHour = hour - 24;
    const time = hour.toString();
    const displayTime = displayHour.toString().padStart(2, '0');
    slots.push({ time, displayTime });
  }
  return slots;
}

/** Vertical position in pixels for an event on a continuous 24h grid. slotPx = pixels per 1h. */
export function getEventPosition(event: CalendarEvent, slotPx: number = 25): { top: number; height: number } {
  const startClock = extractUTCTime(event.start);
  const endClock = extractUTCTime(event.end);
  const startDate = extractUTCDate(event.start);
  const endDate = extractUTCDate(event.end);

  const [startHH, startMM] = startClock.split(':').map(Number);
  const [endHH, endMM] = endClock.split(':').map(Number);

  let startHour = (Number.isNaN(startHH) ? 0 : startHH) + (Number.isNaN(startMM) ? 0 : startMM / 60);
  let endHour = (Number.isNaN(endHH) ? 0 : endHH) + (Number.isNaN(endMM) ? 0 : endMM / 60);

  if (endDate > startDate || endHour < startHour) {
    endHour += 24;
  }

  const top = (startHour - 5) * slotPx;
  const height = Math.max(12, (endHour - startHour) * slotPx);
  return { top, height };
}
