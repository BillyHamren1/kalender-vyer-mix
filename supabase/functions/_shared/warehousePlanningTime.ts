const zone = 'Europe/Stockholm';
export function warehousePlanningDate(value: string | Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
/** UTC instant for Stockholm midnight, including DST transition days. */
function midnight(date: string): number {
  const target = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(target) || new Date(target).toISOString().slice(0, 10) !== date)
    throw new Error('Invalid warehouse date');
  let instant = target;
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    instant += target - wall;
  }
  return instant;
}
export function warehousePlanningBounds(from: string, to: string) {
  midnight(to); // Validate before constructing the next calendar date.
  const nextDate = new Date(Date.parse(`${to}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  return { start: new Date(midnight(from)).toISOString(), end: new Date(midnight(nextDate)).toISOString() };
}
